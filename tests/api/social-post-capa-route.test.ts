import { describe, it, expect, vi, beforeEach } from "vitest"
import { DAVI, POST_ID, URL_ASSINADA, VIAGEM, estado, reiniciar, trocas } from "./post-capa-dubles"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"
import { VALIDADE_URL_AVATAR_S } from "@/lib/social/foto"
import { BUCKET_CAPAS, LIMITE_CAPA_BYTES } from "@/lib/social/capa"

/**
 * @RF09.7 — a capa do post de uma viagem: PUT (multipart, campo `capa`) e
 * DELETE em /api/social/viagens/[tripId]/post/capa.
 *
 * Os helpers reais (lib/social/posts.ts, lib/social/capa.ts) rodam sobre os
 * dublês de ./post-capa-dubles.ts: o 409 da troca concorrente sai de
 * `definirCapa` comparando a condição com o valor "no banco", não de uma flag.
 *
 * Toda resposta passa por `conferir`: `Cache-Control: private, no-store` e
 * nenhuma chave `cover_path`, `trip_id` ou `author_id`, em qualquer nível.
 */

vi.mock("@/lib/supabase/server", async () => {
  const { clienteDaSessao } = await import("./post-capa-dubles")
  return { createClient: async () => clienteDaSessao() }
})
vi.mock("@/lib/supabase/admin", async () => {
  const { clienteDeServico } = await import("./post-capa-dubles")
  return { criarClienteAdmin: clienteDeServico }
})

import { DELETE, PUT } from "@/app/api/social/viagens/[tripId]/post/capa/route"

const ANTERIOR = `${DAVI}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`
const DE_OUTRA_ABA = `${DAVI}/3c3c3c3c-3333-4333-8333-333333333333.jpg`
const ROTA = `http://localhost/api/social/viagens/${VIAGEM}/post/capa`

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 0])
const WEBP = new TextEncoder().encode("RIFF\u0000\u0000\u0000\u0000WEBPVP8 ")

const CHAVES_PROIBIDAS = ["cover_path", "trip_id", "author_id"]

function chavesProibidas(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.flatMap(chavesProibidas)
  if (typeof valor !== "object" || valor === null) return []
  return Object.entries(valor).flatMap(([chave, v]) => [
    ...(CHAVES_PROIBIDAS.includes(chave) ? [chave] : []),
    ...chavesProibidas(v),
  ])
}

/** O que toda resposta precisa cumprir, de sucesso ou de erro. */
async function conferir(resposta: Response) {
  expect(resposta.headers.get("cache-control")).toBe("private, no-store")
  const corpo = await resposta.json()
  expect(chavesProibidas(corpo)).toEqual([])
  return { status: resposta.status, corpo, headers: resposta.headers }
}

const contexto = (tripId = VIAGEM) => ({ params: Promise.resolve({ tripId }) })

function formulario(conteudo: Uint8Array | null, tipoDeclarado = "image/png") {
  const dados = new FormData()
  // A cópia dá ao File um ArrayBuffer concreto, que é o que o tipo BlobPart exige.
  if (conteudo) dados.append("capa", new File([new Uint8Array(conteudo)], "capa.png", { type: tipoDeclarado }))
  return new Request(ROTA, { method: "PUT", body: dados })
}

function comTamanho(tamanho: number) {
  const arquivo = new Uint8Array(tamanho)
  arquivo.set(PNG)
  return arquivo
}

const enviar = async (pedido: Request, tripId?: string) => conferir(await PUT(pedido, contexto(tripId)))
const tirar = async (tripId?: string) => conferir(await DELETE(new Request(ROTA, { method: "DELETE" }), contexto(tripId)))

const silenciarLog = () => vi.spyOn(console, "error").mockImplementation(() => {})
const capaNova = () => estado.envios[0].caminho

beforeEach(() => {
  reiniciar()
  esquecerLinksEmitidos()
  estado.usuario = { id: DAVI }
  return () => {
    vi.restoreAllMocks()
  }
})

describe("PUT /api/social/viagens/[tripId]/post/capa (@RF09.7)", () => {
  it("200: envia para a pasta da sessão, grava no post e devolve só a URL assinada", async () => {
    const { status, corpo } = await enviar(formulario(PNG))

    expect(status).toBe(200)
    expect(estado.buckets.every((b) => b === BUCKET_CAPAS)).toBe(true)
    expect(estado.envios).toHaveLength(1)
    expect(capaNova()).toMatch(new RegExp(`^${DAVI}/[0-9a-f-]{36}\\.png$`))
    expect(estado.envios[0]).toMatchObject({ tipo: "image/png", upsert: false, tamanho: PNG.byteLength })
    // Troca condicionada à capa lida (nenhuma), no post da sessão.
    expect(trocas()).toEqual([
      { tipo: "troca", valores: { cover_path: capaNova() }, filtros: [["id", POST_ID], ["cover_path is", null]], retorno: "id" },
    ])
    expect(estado.capaNoBanco).toBe(capaNova())
    expect(estado.remocoes).toEqual([])
    expect(Object.keys(corpo)).toEqual(["capa"])
    expect(corpo.capa).toBe(`${URL_ASSINADA}${capaNova()}?token=tk`)
    expect(estado.assinaturas).toEqual([{ caminhos: [capaNova()], validade: VALIDADE_URL_AVATAR_S }])
  })

  it.each([
    ["JPEG", JPEG, "image/jpeg", "jpg"],
    ["WebP", WEBP, "image/webp", "webp"],
    ["PNG", PNG, "image/png", "png"],
  ])("200: %s é reconhecido pelos bytes, não pelo tipo declarado", async (_nome, bytes, tipo, extensao) => {
    const { status } = await enviar(formulario(bytes, "application/octet-stream"))

    expect(status).toBe(200)
    expect(estado.envios[0].tipo).toBe(tipo)
    expect(capaNova()).toMatch(new RegExp(`\\.${extensao}$`))
  })

  it("200: a capa anterior é apagada do bucket depois da troca", async () => {
    estado.capaNoBanco = ANTERIOR

    const { status } = await enviar(formulario(PNG))

    expect(status).toBe(200)
    expect(trocas()[0].filtros).toEqual([["id", POST_ID], ["cover_path", ANTERIOR]])
    expect(estado.capaNoBanco).toBe(capaNova())
    expect(estado.remocoes).toEqual([[ANTERIOR]])
  })

  it("aceita exatamente 2 MB", async () => {
    expect((await enviar(formulario(comTamanho(LIMITE_CAPA_BYTES)))).status).toBe(200)
  })

  it("autoriza e acha o post pela viagem da URL e pela sessão", async () => {
    await enviar(formulario(PNG))

    expect(estado.pedidos.slice(0, 3)).toEqual([
      {
        tipo: "papel",
        tabela: "trip_members",
        colunas: "role",
        filtros: [["trip_id", VIAGEM], ["user_id", DAVI]],
      },
      { tipo: "rpc", funcao: "social_meu_post_da_viagem", argumentos: { viagem: VIAGEM } },
      expect.objectContaining({ tipo: "post", filtros: [["id", POST_ID]] }),
    ])
  })

  it("401: sem sessão não consulta nem envia nada", async () => {
    estado.usuario = null

    const { status } = await enviar(formulario(PNG))

    expect(status).toBe(401)
    expect(estado.pedidos).toEqual([])
    expect(estado.envios).toEqual([])
    expect(estado.clientesDeServico).toBe(0)
  })

  it("403: quem não é membro da viagem não envia nem procura o post", async () => {
    estado.papel = null

    const { status } = await enviar(formulario(PNG))

    expect(status).toBe(403)
    expect(estado.pedidos.map((p) => p.tipo)).toEqual(["papel"])
    expect(estado.envios).toEqual([])
    expect(estado.clientesDeServico).toBe(0)
  })

  it("404: sem post da sessão nesta viagem, nada vai ao Storage", async () => {
    estado.postId = null

    const { status, corpo } = await enviar(formulario(PNG))

    expect(status).toBe(404)
    expect(corpo.error).toBe("Publicação não encontrada")
    expect(estado.envios).toEqual([])
    expect(estado.clientesDeServico).toBe(0)
  })

  it("400: bytes de texto declarados como image/png são recusados pelo conteúdo", async () => {
    const texto = new TextEncoder().encode("isto não é uma imagem, só texto")

    const { status, corpo } = await enviar(formulario(texto, "image/png"))

    expect(status).toBe(400)
    expect(corpo.error).toContain("JPEG, PNG ou WebP")
    expect(estado.envios).toEqual([])
  })

  it("400: um byte acima de 2 MB, pelo tamanho real", async () => {
    const { status, corpo } = await enviar(formulario(comTamanho(LIMITE_CAPA_BYTES + 1)))

    expect(status).toBe(400)
    expect(corpo.error).toContain("2 MB")
    expect(estado.envios).toEqual([])
  })

  it("400: content-length grande é recusado sem processar o multipart", async () => {
    const pedido = new Request(ROTA, {
      method: "PUT",
      body: "x",
      headers: { "content-length": String(50 * 1024 * 1024) },
    })
    const processarMultipart = vi.spyOn(pedido, "formData")

    const { status, corpo } = await enviar(pedido)

    expect(status).toBe(400)
    expect(corpo.error).toContain("2 MB")
    expect(processarMultipart).not.toHaveBeenCalled()
    expect(estado.envios).toEqual([])
  })

  it("400: sem o campo capa", async () => {
    const { status, corpo } = await enviar(formulario(null))

    expect(status).toBe(400)
    expect(corpo.error).toContain('campo "capa"')
    expect(estado.envios).toEqual([])
  })

  it("400: arquivo vazio", async () => {
    expect((await enviar(formulario(new Uint8Array()))).status).toBe(400)
    expect(estado.envios).toEqual([])
  })

  it("400: campo capa como texto, não arquivo — mesmo imitando a assinatura do WebP", async () => {
    const dados = new FormData()
    dados.append("capa", "RIFF\u0000\u0000\u0000\u0000WEBPVP8 ")

    const { status, corpo } = await enviar(new Request(ROTA, { method: "PUT", body: dados }))

    expect(status).toBe(400)
    expect(corpo.error).toContain('campo "capa"')
    expect(estado.envios).toEqual([])
  })

  it("400: corpo que não é multipart", async () => {
    const json = new Request(ROTA, {
      method: "PUT",
      body: JSON.stringify({ capa: "x" }),
      headers: { "content-type": "application/json" },
    })

    expect((await enviar(json)).status).toBe(400)
    expect(estado.envios).toEqual([])
  })

  it("400: tripId que não é uuid, antes de qualquer consulta", async () => {
    const { status, corpo } = await enviar(formulario(PNG), "nao-e-uuid")

    expect(status).toBe(400)
    expect(corpo.detalhes).toEqual({ tripId: ["identificador de viagem inválido"] })
    expect(estado.pedidos).toEqual([])
  })

  it("409: outra aba trocou a capa no meio — o arquivo novo é apagado e a capa dela fica", async () => {
    estado.capaNoBanco = ANTERIOR
    estado.outraAbaTrocouPara = DE_OUTRA_ABA

    const { status, corpo } = await enviar(formulario(PNG))

    expect(status).toBe(409)
    expect(corpo.error).toContain("outra aba")
    expect(estado.remocoes).toEqual([[capaNova()]])
    expect(estado.capaNoBanco).toBe(DE_OUTRA_ABA)
  })

  it("409 mesmo se apagar o arquivo novo falhar: a falha só vai ao log", async () => {
    const log = silenciarLog()
    estado.outraAbaTrocouPara = DE_OUTRA_ABA
    estado.erroRemocao = { message: "storage fora do ar" }

    const { status } = await enviar(formulario(PNG))

    expect(status).toBe(409)
    expect(log).toHaveBeenCalledWith("[capa do post] arquivo não apagado", capaNova(), expect.any(Error))
  })

  it("403: a policy recusa a troca (42501) — o arquivo novo é apagado", async () => {
    estado.erroEscrita = { code: "42501", message: 'new row violates row-level security policy for table "trip_posts"' }

    const { status, corpo } = await enviar(formulario(PNG))

    expect(status).toBe(403)
    expect(JSON.stringify(corpo)).not.toContain("row-level security")
    expect(estado.remocoes).toEqual([[capaNova()]])
  })

  it("500: erro do banco na troca não vaza, e o arquivo novo é apagado", async () => {
    silenciarLog()
    estado.erroEscrita = { code: "23514", message: 'violates check constraint "trip_posts_cover_path_check"' }

    const { status, corpo, headers } = await enviar(formulario(PNG))

    expect(status).toBe(500)
    expect(JSON.stringify(corpo)).not.toContain("cover_path_check")
    expect(headers.get("x-codigo-erro")).toMatch(/^[0-9a-f]{8}$/)
    expect(estado.remocoes).toEqual([[capaNova()]])
  })

  it("500: erro do Storage no envio não vaza, e o post não é tocado", async () => {
    silenciarLog()
    estado.erroEnvio = { message: "mime type application/pdf is not supported" }

    const { status, corpo } = await enviar(formulario(PNG))

    expect(status).toBe(500)
    expect(corpo).toEqual({ error: "Erro interno do servidor" })
    expect(trocas()).toEqual([])
    expect(estado.remocoes).toEqual([])
  })

  it("500: erro do banco ao checar o papel não vaza a mensagem", async () => {
    silenciarLog()
    estado.erroPapel = { message: 'relation "trip_members" does not exist' }

    const { status, corpo } = await enviar(formulario(PNG))

    expect(status).toBe(500)
    expect(corpo).toEqual({ error: "Erro interno do servidor" })
    expect(estado.envios).toEqual([])
  })

  it.each([
    ["o Storage não acha o arquivo", { removeVazio: true }, []],
    ["o Storage falha", { erroRemocao: { message: "storage fora do ar" } }, [expect.any(Error)]],
  ])("200 quando a capa anterior não sai porque %s: só vai ao log", async (_caso, falha, extra) => {
    const log = silenciarLog()
    estado.capaNoBanco = ANTERIOR
    Object.assign(estado, falha)

    const { status } = await enviar(formulario(PNG))

    expect(status).toBe(200)
    expect(estado.capaNoBanco).toBe(capaNova())
    expect(log).toHaveBeenCalledWith("[capa do post] arquivo não apagado", ANTERIOR, ...extra)
  })

  it("200 com capa nula se a assinatura falhar: a troca já valeu", async () => {
    silenciarLog()
    estado.erroAssinatura = { message: "storage fora do ar" }

    const { status, corpo } = await enviar(formulario(PNG))

    expect(status).toBe(200)
    expect(corpo).toEqual({ capa: null })
    expect(estado.capaNoBanco).toBe(capaNova())
  })
})

describe("DELETE /api/social/viagens/[tripId]/post/capa (@RF09.7)", () => {
  it("200: tira a capa do post, condicionada à atual, e apaga o arquivo", async () => {
    estado.capaNoBanco = ANTERIOR

    const { status, corpo } = await tirar()

    expect(status).toBe(200)
    expect(corpo).toEqual({ capa: null })
    expect(trocas()).toEqual([
      { tipo: "troca", valores: { cover_path: null }, filtros: [["id", POST_ID], ["cover_path", ANTERIOR]], retorno: "id" },
    ])
    expect(estado.capaNoBanco).toBeNull()
    expect(estado.remocoes).toEqual([[ANTERIOR]])
    expect(estado.buckets.every((b) => b === BUCKET_CAPAS)).toBe(true)
  })

  it("200 sem capa: idempotente, sem gravar nem ir ao Storage", async () => {
    const { status, corpo } = await tirar()

    expect(status).toBe(200)
    expect(corpo).toEqual({ capa: null })
    expect(trocas()).toEqual([])
    expect(estado.clientesDeServico).toBe(0)
  })

  it("200 mesmo se apagar o arquivo falhar: a falha só vai ao log", async () => {
    const log = silenciarLog()
    estado.capaNoBanco = ANTERIOR
    estado.erroRemocao = { message: "storage fora do ar" }

    const { status } = await tirar()

    expect(status).toBe(200)
    expect(estado.capaNoBanco).toBeNull()
    expect(log).toHaveBeenCalledWith("[capa do post] arquivo não apagado", ANTERIOR, expect.any(Error))
  })

  it("401: sem sessão não mexe em nada", async () => {
    estado.usuario = null
    estado.capaNoBanco = ANTERIOR

    expect((await tirar()).status).toBe(401)
    expect(estado.pedidos).toEqual([])
    expect(estado.remocoes).toEqual([])
  })

  it("403: quem não é membro não mexe em nada", async () => {
    estado.papel = null
    estado.capaNoBanco = ANTERIOR

    expect((await tirar()).status).toBe(403)
    expect(trocas()).toEqual([])
    expect(estado.remocoes).toEqual([])
  })

  it("404: sem post da sessão nesta viagem", async () => {
    estado.postId = null

    expect((await tirar()).status).toBe(404)
    expect(trocas()).toEqual([])
    expect(estado.clientesDeServico).toBe(0)
  })

  it("400: tripId que não é uuid", async () => {
    expect((await tirar("nao-e-uuid")).status).toBe(400)
    expect(estado.pedidos).toEqual([])
  })

  it("409: outra aba trocou a capa no meio — nada é apagado", async () => {
    estado.capaNoBanco = ANTERIOR
    estado.outraAbaTrocouPara = DE_OUTRA_ABA

    expect((await tirar()).status).toBe(409)
    expect(estado.remocoes).toEqual([])
    expect(estado.capaNoBanco).toBe(DE_OUTRA_ABA)
  })

  it("500: erro do banco não vaza e não apaga o arquivo", async () => {
    silenciarLog()
    estado.capaNoBanco = ANTERIOR
    estado.erroEscrita = { message: "permission denied for table trip_posts" }

    const { status, corpo } = await tirar()

    expect(status).toBe(500)
    expect(JSON.stringify(corpo)).not.toContain("permission denied")
    expect(estado.remocoes).toEqual([])
  })
})
