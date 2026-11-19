import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import { ANA, BIA, banco, fotoDe } from "../api/banco-falso"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"
import { ErroHttp } from "@/lib/http"
import {
  BUCKET_CAPAS,
  LIMITE_FOTO_POST_BYTES,
  assinarFotos,
  caminhoDaNovaFotoDoPost,
  conferirTamanhoDeclarado,
  enviarFotoDoPost,
  enviarFotos,
  fotoApagavel,
  fotosDoFormulario,
  removerFotosDoPost,
  removerFotosSemFalhar,
  reprocessarFotos,
} from "@/lib/social/capa"
import { pngLiso } from "../fixtures/imagens"

/**
 * @RF09.15 @RF09.7 As fotos de um post (lib/social/capa.ts): caminho na pasta
 * da autora, conferência do multipart (quantidade, arquivo, 2 MB = 413, tipo
 * pelos bytes), envio com rollback, remoção só na pasta da autora, e
 * assinatura em lote que nunca lança.
 */

let PNG: Uint8Array
beforeAll(async () => {
  PNG = await pngLiso(20, 20)
})

beforeEach(() => {
  banco.reiniciar()
  esquecerLinksEmitidos()
  return () => vi.restoreAllMocks()
})

const admin = () => banco.clienteDeServico()

async function erroDe(promessa: Promise<unknown>) {
  return promessa.then(
    () => null,
    (e: unknown) => e,
  )
}

function formulario(entradas: (Uint8Array | string)[]) {
  const dados = new FormData()
  for (const e of entradas) dados.append("fotos", typeof e === "string" ? e : new File([new Uint8Array(e)], "f"))
  return dados
}

describe("caminho e pasta da autora", () => {
  it("caminho novo é <autora>/<uuid>.webp, um diferente a cada vez", () => {
    const a = caminhoDaNovaFotoDoPost(ANA)
    expect(a).toMatch(new RegExp(`^${ANA}/[0-9a-f-]{36}\\.webp$`))
    expect(caminhoDaNovaFotoDoPost(ANA)).not.toBe(a)
  })

  it.each(["", "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA", "../x", "nao-uuid"])("autora fora do formato (%s) lança", (autor) => {
    expect(() => caminhoDaNovaFotoDoPost(autor)).toThrow()
  })

  it.each([
    [fotoDe(ANA), fotoDe(ANA)],
    [fotoDe(BIA), null],
    [`${ANA}/../${BIA}/x.webp`, null],
    ["https://x/y.webp", null],
    [null, null],
    [undefined, null],
  ])("fotoApagavel(%s) → %s", (caminho, esperado) => {
    expect(fotoApagavel(caminho as string | null | undefined, ANA)).toBe(esperado)
  })
})

describe("conferência do multipart", () => {
  it("Content-Length acima de 3 × 2 MB + folga é 413; ausente ou dentro passa", () => {
    const pedido = (n: number | null) => new Request("http://x", { method: "POST", headers: n === null ? {} : { "content-length": String(n) }, body: "x" })
    expect(() => conferirTamanhoDeclarado(pedido(3 * LIMITE_FOTO_POST_BYTES + 65 * 1024))).toThrow(ErroHttp)
    expect(() => conferirTamanhoDeclarado(pedido(3 * LIMITE_FOTO_POST_BYTES))).not.toThrow()
    expect(() => conferirTamanhoDeclarado(pedido(null))).not.toThrow()
  })

  it("devolve os bytes na ordem do formulário", async () => {
    const outro = await pngLiso(10, 10)
    const fotos = await fotosDoFormulario(formulario([PNG, outro]), { minimo: 1 })
    expect(fotos.map((f) => f.byteLength)).toEqual([PNG.byteLength, outro.byteLength])
  })

  it.each([
    ["nenhuma com mínimo 1", [] as (Uint8Array | string)[], 1, 400],
    ["4 fotos", ["a", "b", "c", "d"].map(() => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 1, 400],
    ["texto no lugar do arquivo", ["oi"], 1, 400],
    ["arquivo vazio", [new Uint8Array(0)], 1, 400],
    ["bytes que não são imagem", [new TextEncoder().encode("GIF89a....")], 1, 400],
    ["acima de 2 MB", [new Uint8Array(LIMITE_FOTO_POST_BYTES + 1)], 1, 413],
  ])("%s → %s", async (_caso, entradas, minimo, status) => {
    const erro = await erroDe(fotosDoFormulario(formulario(entradas), { minimo }))
    expect(erro).toBeInstanceOf(ErroHttp)
    expect((erro as ErroHttp).status).toBe(status)
  })

  it("0 fotos é aceito quando o mínimo é 0 (post de viagem)", async () => {
    expect(await fotosDoFormulario(formulario([]), { minimo: 0 })).toEqual([])
  })

  it("reprocessarFotos devolve WebP de cada foto, na ordem", async () => {
    const regeradas = await reprocessarFotos([PNG, PNG])
    expect(regeradas.map((r) => r.tipo)).toEqual(["image/webp", "image/webp"])
  })
})

describe("envio e remoção com a chave de serviço", () => {
  it("enviarFotoDoPost grava no bucket, como WebP e sem upsert; caminho fora do formato lança sem ir ao Storage", async () => {
    await enviarFotoDoPost(admin(), fotoDe(ANA), new Uint8Array([1]))
    expect(banco.storage.envios).toEqual([
      { bucket: BUCKET_CAPAS, caminho: fotoDe(ANA), bytes: new Uint8Array([1]), contentType: "image/webp", upsert: false },
    ])
    await expect(enviarFotoDoPost(admin(), "../x.webp", new Uint8Array([1]))).rejects.toThrow()
    expect(banco.storage.envios).toHaveLength(1)
  })

  it("erro do Storage no envio lança genérico, com o original em cause", async () => {
    banco.storage.falharEnvioNo = 0
    const erro = (await erroDe(enviarFotoDoPost(admin(), fotoDe(ANA), new Uint8Array([1])))) as Error
    expect(erro.message).not.toContain("storage fora do ar")
    expect(erro.cause).toEqual({ message: "storage fora do ar" })
  })

  it("enviarFotos devolve os caminhos na ordem; falha no meio apaga os já enviados", async () => {
    const [a, b] = await reprocessarFotos([PNG, PNG])
    const caminhos = await enviarFotos(admin(), ANA, [a, b])
    expect(caminhos).toEqual(banco.storage.envios.map((e) => e.caminho))

    banco.reiniciar()
    vi.spyOn(console, "error").mockImplementation(() => {})
    banco.storage.falharEnvioNo = 1
    await expect(enviarFotos(admin(), ANA, [a, b])).rejects.toThrow()
    expect(banco.storage.remocoes).toEqual([{ bucket: BUCKET_CAPAS, caminhos: [banco.storage.envios[0].caminho] }])
  })

  it("removerFotosDoPost só apaga na pasta da autora, sem repetir; nada apagável não vai ao Storage", async () => {
    banco.storage.arquivos.set(`${BUCKET_CAPAS}/${fotoDe(ANA)}`, new Uint8Array([1]))
    expect(await removerFotosDoPost(admin(), [fotoDe(ANA), fotoDe(ANA), fotoDe(BIA), null], ANA)).toBe(1)
    expect(banco.storage.remocoes).toEqual([{ bucket: BUCKET_CAPAS, caminhos: [fotoDe(ANA)] }])
    expect(await removerFotosDoPost(admin(), [fotoDe(BIA)], ANA)).toBe(0)
    expect(banco.storage.remocoes).toHaveLength(1)
  })

  it("erro do Storage na remoção: removerFotosDoPost lança; removerFotosSemFalhar só registra", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    banco.storage.falharRemocao = true
    await expect(removerFotosDoPost(admin(), [fotoDe(ANA)], ANA)).rejects.toThrow()
    await expect(removerFotosSemFalhar(admin(), [fotoDe(ANA)], ANA)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalled()
    await removerFotosSemFalhar(admin(), [], ANA)
  })
})

describe("assinarFotos", () => {
  it("assina em lote só os caminhos no formato; sem nenhum, não cria o cliente", async () => {
    const criar = vi.fn(admin)
    const links = await assinarFotos(criar, [fotoDe(ANA), "javascript:x", null, fotoDe(ANA, 2)])
    expect([...links.keys()]).toEqual([fotoDe(ANA), fotoDe(ANA, 2)])
    expect(banco.storage.assinaturas).toEqual([{ bucket: BUCKET_CAPAS, caminhos: [fotoDe(ANA), fotoDe(ANA, 2)], validade: 600 }])

    const nenhum = vi.fn(admin)
    expect((await assinarFotos(nenhum, [null, "x"])).size).toBe(0)
    expect(nenhum).not.toHaveBeenCalled()
  })

  it("sem a chave de serviço, não lança: o mapa vem vazio", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const links = await assinarFotos(() => {
      throw new Error("sem chave")
    }, [fotoDe(ANA, 3)])
    expect(links.size).toBe(0)
  })
})
