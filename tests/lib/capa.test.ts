import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  BUCKET_CAPAS,
  LIMITE_CAPA_BYTES,
  TIPOS_CAPA,
  assinarCapa,
  assinarCapas,
  caminhoDaNovaCapa,
  capaApagavel,
  enviarCapa,
  removerCapa,
} from "@/lib/social/capa"
import { assinarAvatar, esquecerLinksEmitidos, type ClienteDeServico } from "@/lib/social/avatar"
import { REUSO_URL_AVATAR_S, VALIDADE_URL_AVATAR_S } from "@/lib/social/foto"

/**
 * @RF09.7 — capa do post de viagem: caminho na pasta do autor, envio e remoção
 * com a chave de serviço, link assinado em lote (bucket privado `capas-posts`).
 *
 * O cliente de serviço é falso e registra cada chamada ao Storage (bucket,
 * operação e argumentos); cada assinatura sai com um token diferente, como no
 * Storage de verdade, para o reaproveitamento aparecer.
 */

const ANA = "11111111-1111-4111-8111-111111111111"
const BRUNO = "22222222-2222-4222-8222-222222222222"
const CAPA_ANA = `${ANA}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`
const CAPA_BRUNO = `${BRUNO}/1c7a3d5f-6e8b-4b9f-8c2d-3a4f5e6b7c8d.jpg`

/** O mesmo regex do CHECK trip_posts_cover_path_check, copiado da migration. */
const CHECK_DO_BANCO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg|png)$/

type Item = { path: string | null; signedUrl: string | null; error: string | null }
type Resultado<T> = { data: T; error: { message: string } | null }

let emissao = 0
const assinada = (bucket: string, caminho: string, token: number) =>
  `https://storage.teste/storage/v1/object/sign/${bucket}/${caminho}?token=t${token}`

const chamadas: { bucket: string; op: string; args: unknown[] }[] = []
let clientesCriados = 0
let semChave = false
let respostaUpload: () => Resultado<{ path: string } | null>
let respostaRemove: (caminhos: string[]) => Resultado<{ name: string }[] | null>
let respostaAssinar: (bucket: string, caminhos: string[]) => Resultado<Item[] | null>

const cliente = {
  storage: {
    from: (bucket: string) => ({
      async upload(...args: unknown[]) {
        chamadas.push({ bucket, op: "upload", args })
        return respostaUpload()
      },
      async remove(caminhos: string[]) {
        chamadas.push({ bucket, op: "remove", args: [caminhos] })
        return respostaRemove(caminhos)
      },
      async createSignedUrls(caminhos: string[], validade: number) {
        chamadas.push({ bucket, op: "createSignedUrls", args: [caminhos, validade] })
        return respostaAssinar(bucket, caminhos)
      },
    }),
  },
} as unknown as ClienteDeServico

const criarAdmin = () => {
  if (semChave) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada")
  clientesCriados++
  return cliente
}

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])

beforeEach(() => {
  esquecerLinksEmitidos()
  chamadas.length = 0
  clientesCriados = 0
  semChave = false
  respostaUpload = () => ({ data: { path: "ok" }, error: null })
  respostaRemove = (caminhos) => ({ data: caminhos.map((name) => ({ name })), error: null })
  respostaAssinar = (bucket, caminhos) => {
    emissao++
    return {
      data: caminhos.map((path) => ({ path, signedUrl: assinada(bucket, path, emissao), error: null })),
      error: null,
    }
  }
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("contrato com o bucket", () => {
  it("é o bucket privado da migration, com os limites da foto", () => {
    expect(BUCKET_CAPAS).toBe("capas-posts")
    expect(LIMITE_CAPA_BYTES).toBe(2 * 1024 * 1024)
    expect([...TIPOS_CAPA]).toEqual(["image/jpeg", "image/png", "image/webp"])
  })
})

describe("caminhoDaNovaCapa — casa com o CHECK do banco", () => {
  it.each([
    ["image/webp", "webp"],
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
  ] as const)("%s vai para a pasta do autor com .%s", (tipo, extensao) => {
    const caminho = caminhoDaNovaCapa(ANA, tipo)

    expect(caminho).toMatch(CHECK_DO_BANCO)
    expect(caminho.split("/")[0]).toBe(ANA)
    expect(caminho.endsWith(`.${extensao}`)).toBe(true)
  })

  it("cada envio tem um nome novo", () => {
    expect(caminhoDaNovaCapa(ANA, "image/webp")).not.toBe(caminhoDaNovaCapa(ANA, "image/webp"))
  })

  it.each([
    ["vazio", ""],
    ["maiúsculas", "ABCDEF01-2345-4678-89AB-CDEF01234567"],
    ["subida de pasta", "../.."],
    ["não é uuid", "ana"],
  ])("autor fora do formato (%s) lança antes de qualquer envio", (_caso, autor) => {
    expect(() => caminhoDaNovaCapa(autor, "image/png")).toThrow("autor fora do formato")
  })
})

describe("capaApagavel — nunca o caminho de outra pessoa", () => {
  it("aceita a capa do autor, no formato da rota", () => {
    expect(capaApagavel(CAPA_ANA, ANA)).toBe(CAPA_ANA)
  })

  it.each([
    ["nulo", null],
    ["indefinido", undefined],
    ["vazio", ""],
    ["pasta de outro autor", CAPA_BRUNO],
    ["subida de pasta", `${ANA}/../${CAPA_BRUNO}`],
    ["subida no nome", `${ANA}/../../avatars/x.webp`],
    ["subpasta", `${ANA}/sub/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`],
    ["nome que não é uuid", `${ANA}/capa.webp`],
    ["extensão fora da lista", `${ANA}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.svg`],
    ["URL", `https://x.supabase.co/storage/v1/object/public/capas-posts/${CAPA_ANA}`],
    ["prefixo parecido", `${ANA}x/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`],
  ])("recusa %s", (_caso, valor) => {
    expect(capaApagavel(valor, ANA)).toBeNull()
  })
})

describe("enviarCapa", () => {
  it("grava no bucket das capas, com o contentType do tipo detectado e sem upsert", async () => {
    await enviarCapa(cliente, CAPA_ANA, png, "image/png")

    expect(chamadas).toEqual([
      { bucket: "capas-posts", op: "upload", args: [CAPA_ANA, png, { contentType: "image/png", upsert: false }] },
    ])
  })

  it("erro do Storage lança um erro genérico, com o original só em cause", async () => {
    const original = { message: "The resource already exists" }
    respostaUpload = () => ({ data: null, error: original })

    const erro = await enviarCapa(cliente, CAPA_ANA, png, "image/png").catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(Error)
    expect((erro as Error).message).not.toContain("already exists")
    expect((erro as Error).cause).toBe(original)
  })

  it.each([
    ["subida de pasta", `${ANA}/../${CAPA_BRUNO}`],
    ["URL", "https://exemplo.com/a.png"],
    ["nome que não é uuid", `${ANA}/capa.png`],
  ])("caminho fora do formato (%s) lança sem ir ao Storage", async (_caso, caminho) => {
    await expect(enviarCapa(cliente, caminho, png, "image/png")).rejects.toThrow("fora do formato")
    expect(chamadas).toEqual([])
  })
})

describe("removerCapa", () => {
  it("apaga a capa do autor no bucket das capas", async () => {
    expect(await removerCapa(cliente, CAPA_ANA, ANA)).toBe(true)
    expect(chamadas).toEqual([{ bucket: "capas-posts", op: "remove", args: [[CAPA_ANA]] }])
  })

  it("arquivo que já não existe não é erro", async () => {
    // O Storage responde à remoção de um caminho ausente com a lista vazia.
    respostaRemove = () => ({ data: [], error: null })
    expect(await removerCapa(cliente, CAPA_ANA, ANA)).toBe(false)
  })

  it("resposta sem lista também não é erro", async () => {
    respostaRemove = () => ({ data: null, error: null })
    expect(await removerCapa(cliente, CAPA_ANA, ANA)).toBe(false)
  })

  it.each([
    ["nulo", null],
    ["pasta de outro autor", CAPA_BRUNO],
    ["subida de pasta", `${ANA}/../${CAPA_BRUNO}`],
  ])("%s não vai ao Storage", async (_caso, valor) => {
    expect(await removerCapa(cliente, valor, ANA)).toBe(false)
    expect(chamadas).toEqual([])
  })

  it("erro do Storage lança um erro genérico, com o original só em cause", async () => {
    const original = { message: "relation storage.objects: permission denied" }
    respostaRemove = () => ({ data: null, error: original })

    const erro = await removerCapa(cliente, CAPA_ANA, ANA).catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(Error)
    expect((erro as Error).message).not.toContain("permission denied")
    expect((erro as Error).cause).toBe(original)
  })
})

describe("assinarCapas — em lote", () => {
  it("assina no bucket das capas, com a validade do avatar, numa chamada só", async () => {
    const links = await assinarCapas(criarAdmin, [CAPA_ANA, null, CAPA_BRUNO, undefined, CAPA_ANA])

    expect(chamadas).toEqual([
      {
        bucket: "capas-posts",
        op: "createSignedUrls",
        args: [[CAPA_ANA, CAPA_BRUNO], VALIDADE_URL_AVATAR_S],
      },
    ])
    expect([...links.entries()]).toEqual([
      [CAPA_ANA, assinada("capas-posts", CAPA_ANA, emissao)],
      [CAPA_BRUNO, assinada("capas-posts", CAPA_BRUNO, emissao)],
    ])
  })

  it.each([
    ["URL", "https://exemplo.com/a.png"],
    ["javascript:", "javascript:alert(1)"],
    ["subida de pasta", `${ANA}/../../../rest/v1/trip_posts`],
    ["nome que não é uuid", `${ANA}/capa.webp`],
    ["quebra de linha no fim", `${CAPA_ANA}\n`],
    ["vazio", ""],
  ])("caminho fora do formato (%s) fica de fora sem ir ao Storage", async (_caso, valor) => {
    const links = await assinarCapas(criarAdmin, [valor])

    expect(links.size).toBe(0)
    expect(chamadas).toEqual([])
    expect(clientesCriados).toBe(0)
  })

  it("sem nenhuma capa, não cria o cliente de serviço", async () => {
    expect((await assinarCapas(criarAdmin, [])).size).toBe(0)
    expect((await assinarCapas(criarAdmin, [null, null])).size).toBe(0)
    expect(clientesCriados).toBe(0)
  })

  it("reaproveita o link dentro do prazo de reuso e assina de novo depois", async () => {
    vi.useFakeTimers()
    const primeira = await assinarCapa(criarAdmin, CAPA_ANA)

    vi.advanceTimersByTime(REUSO_URL_AVATAR_S * 1000 - 1)
    expect(await assinarCapa(criarAdmin, CAPA_ANA)).toBe(primeira)
    expect(chamadas).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(await assinarCapa(criarAdmin, CAPA_ANA)).not.toBe(primeira)
    expect(chamadas).toHaveLength(2)
  })

  it("só as capas que ainda não têm link vão ao Storage", async () => {
    await assinarCapa(criarAdmin, CAPA_ANA)
    await assinarCapas(criarAdmin, [CAPA_ANA, CAPA_BRUNO])

    expect(chamadas[1].args[0]).toEqual([CAPA_BRUNO])
  })

  it("o link de um caminho no bucket das fotos nunca é devolvido como capa", async () => {
    // Mesmo caminho nos dois buckets: o cache é separado por bucket.
    const daFoto = await assinarAvatar(criarAdmin, { id: ANA, avatar_url: CAPA_ANA })
    const daCapa = await assinarCapa(criarAdmin, CAPA_ANA)

    expect(daFoto).toContain("/avatars/")
    expect(daCapa).toContain("/capas-posts/")
    expect(chamadas.map((c) => c.bucket)).toEqual(["avatars", "capas-posts"])
  })

  it("item que o Storage não assina (arquivo ausente) fica de fora, com log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    respostaAssinar = () => ({
      data: [
        { path: CAPA_ANA, signedUrl: assinada("capas-posts", CAPA_ANA, 1), error: null },
        { path: CAPA_BRUNO, signedUrl: null, error: "Either the object does not exist or you do not have access to it" },
      ],
      error: null,
    })

    const links = await assinarCapas(criarAdmin, [CAPA_ANA, CAPA_BRUNO])

    expect([...links.keys()]).toEqual([CAPA_ANA])
    expect(log).toHaveBeenCalledWith("[capa do post] capa não assinada", CAPA_BRUNO, expect.any(String))
  })

  it("Storage fora do ar não lança: o mapa vem vazio e o erro vai ao log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    respostaAssinar = () => ({ data: null, error: { message: "storage fora do ar" } })

    expect((await assinarCapas(criarAdmin, [CAPA_ANA])).size).toBe(0)
    expect(await assinarCapa(criarAdmin, CAPA_ANA)).toBeNull()
    expect(log).toHaveBeenCalledWith("[capa do post] não foi possível assinar as capas", {
      message: "storage fora do ar",
    })
  })

  it("sem a chave de serviço, não lança: a capa vem nula", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    semChave = true

    expect(await assinarCapa(criarAdmin, CAPA_ANA)).toBeNull()
  })
})

describe("assinarCapa — atalho", () => {
  it("sem capa devolve nulo, sem ir ao Storage (a tela mostra o fundo com o destino)", async () => {
    expect(await assinarCapa(criarAdmin, null)).toBeNull()
    expect(await assinarCapa(criarAdmin, undefined)).toBeNull()
    expect(clientesCriados).toBe(0)
  })

  it("com capa devolve a URL assinada dela", async () => {
    expect(await assinarCapa(criarAdmin, CAPA_ANA)).toBe(assinada("capas-posts", CAPA_ANA, emissao))
  })
})
