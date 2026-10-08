import { describe, it, expect, vi, beforeEach } from "vitest"
import { env } from "@/lib/env"

/**
 * @RF02.2 @RNF02.11 — enviar e remover a foto do próprio perfil.
 *
 * Dois clientes falsos, como na rota: o da sessão (perfil) e o de serviço
 * (Storage). Eles registram o caminho e o tipo do envio, o que foi apagado, o
 * que foi gravado em avatar_url e a condição do update.
 *
 * Sem caminho 403, como nas outras rotas de perfil: não há perfil-alvo na URL.
 * No lugar dele, o teste de que o caminho é sempre a pasta da sessão — a RLS não
 * pegaria um erro aqui, porque o Storage é escrito com a chave de serviço — e de
 * que só a foto da própria pessoa é apagada.
 */

type Resposta = { data: Record<string, unknown> | null; error: { message: string; code?: string } | null }

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  leitura: { data: null, error: null } as Resposta,
  /** null = o update não achou a linha (outra aba mexeu antes). */
  linhaAtualizada: true,
  erroEscrita: null as { message: string; code?: string } | null,
  erroEnvio: null as { message: string } | null,
  /** O Storage do supabase-js real responde sem erro e com lista vazia quando não apaga nada. */
  removeVazio: false,
  envios: [] as { caminho: string; tipo: string; upsert: unknown; tamanho: number }[],
  remocoes: [] as string[][],
  updates: [] as Record<string, unknown>[],
  condicoes: [] as string[],
  buckets: [] as string[],
}))

const perfilCom = (avatar_url: unknown) => ({
  id: "44444444-4444-4444-8444-444444444444",
  full_name: "Davi Teste",
  avatar_url,
  username: "davi",
  bio: null,
  is_public: true,
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => h.leitura }) }),
      update(valores: Record<string, unknown>) {
        h.updates.push(valores)
        const responder = {
          select: () => ({
            maybeSingle: async () =>
              h.erroEscrita
                ? { data: null, error: h.erroEscrita }
                : { data: h.linhaAtualizada ? perfilCom(valores.avatar_url) : null, error: null },
          }),
        }
        return {
          eq: (coluna: string, valor: string) => {
            h.condicoes.push(`${coluna}=${valor}`)
            return {
              is: (c: string, v: null) => {
                h.condicoes.push(`${c} is ${v}`)
                return responder
              },
              eq: (c: string, v: string) => {
                h.condicoes.push(`${c}=${v}`)
                return responder
              },
            }
          },
        }
      },
    }),
  }),
}))

vi.mock("@/lib/supabase/admin", () => ({
  criarClienteAdmin: () => ({
    storage: {
      from(bucket: string) {
        h.buckets.push(bucket)
        return {
          async upload(caminho: string, corpo: Uint8Array, opcoes: { contentType: string; upsert?: boolean }) {
            h.envios.push({ caminho, tipo: opcoes.contentType, upsert: opcoes.upsert, tamanho: corpo.byteLength })
            return { data: h.erroEnvio ? null : { path: caminho }, error: h.erroEnvio }
          },
          async remove(caminhos: string[]) {
            h.remocoes.push(caminhos)
            return { data: h.removeVazio ? [] : caminhos.map((name) => ({ name })), error: null }
          },
        }
      },
    },
  }),
}))

import { POST, DELETE } from "@/app/api/social/perfil/foto/route"

const DAVI = "44444444-4444-4444-8444-444444444444"
const OUTRO = "22222222-2222-4222-8222-222222222222"
const ANTERIOR = `${DAVI}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const URL_DO_BUCKET = `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/avatars/`

function envio(conteudo: Uint8Array | null, tipoDeclarado = "image/png") {
  const formulario = new FormData()
  // A cópia dá ao File um ArrayBuffer concreto, que é o que o tipo BlobPart exige.
  if (conteudo) formulario.append("foto", new File([new Uint8Array(conteudo)], "foto.png", { type: tipoDeclarado }))
  return new Request("http://localhost/api/social/perfil/foto", { method: "POST", body: formulario })
}

function comTamanho(tamanho: number) {
  const arquivo = new Uint8Array(tamanho)
  arquivo.set(PNG)
  return arquivo
}

const logado = () => h.getUser.mockResolvedValue({ data: { user: { id: DAVI } } })
const semSessao = () => h.getUser.mockResolvedValue({ data: { user: null } })

beforeEach(() => {
  h.getUser.mockReset()
  h.leitura = { data: { avatar_url: ANTERIOR }, error: null }
  h.linhaAtualizada = true
  h.erroEscrita = null
  h.erroEnvio = null
  h.removeVazio = false
  h.envios.length = 0
  h.remocoes.length = 0
  h.updates.length = 0
  h.condicoes.length = 0
  h.buckets.length = 0
})

describe("POST /api/social/perfil/foto", () => {
  it("200: envia para a pasta da sessão, troca a anterior por ela e devolve a URL pública", async () => {
    logado()

    const resposta = await POST(envio(PNG))
    const corpo = await resposta.json()

    expect(resposta.status).toBe(200)
    expect(h.buckets.every((b) => b === "avatars")).toBe(true)
    expect(h.envios).toHaveLength(1)
    const { caminho } = h.envios[0]
    expect(caminho).toMatch(new RegExp(`^${DAVI}/[0-9a-f-]{36}\\.png$`))
    expect(h.envios[0].upsert).toBe(false)
    expect(h.updates).toEqual([{ avatar_url: caminho }])
    // Condicional à foto lida no começo: id da sessão e avatar_url anterior.
    expect(h.condicoes).toEqual([`id=${DAVI}`, `avatar_url=${ANTERIOR}`])
    expect(h.remocoes).toEqual([[ANTERIOR]])
    expect(corpo.perfil.avatar_url).toBe(`${URL_DO_BUCKET}${caminho}`)
  })

  it("o tipo e a extensão vêm dos bytes, não do que o cliente declarou", async () => {
    logado()

    expect((await POST(envio(PNG, "image/jpeg"))).status).toBe(200)
    expect(h.envios[0].tipo).toBe("image/png")
    expect(h.envios[0].caminho).toMatch(/\.png$/)
  })

  it("sem foto anterior, o update exige avatar_url nulo", async () => {
    logado()
    h.leitura = { data: { avatar_url: null }, error: null }

    expect((await POST(envio(PNG))).status).toBe(200)
    expect(h.condicoes).toEqual([`id=${DAVI}`, "avatar_url is null"])
    expect(h.remocoes).toEqual([])
  })

  it("aceita exatamente 2 MB", async () => {
    logado()

    expect((await POST(envio(comTamanho(2 * 1024 * 1024)))).status).toBe(200)
  })

  it("401: sem sessão não envia nada", async () => {
    semSessao()

    expect((await POST(envio(PNG))).status).toBe(401)
    expect(h.envios).toHaveLength(0)
  })

  it("400: sem o campo foto", async () => {
    logado()

    expect((await POST(envio(null))).status).toBe(400)
    expect(h.envios).toHaveLength(0)
  })

  it("400: arquivo vazio", async () => {
    logado()

    expect((await POST(envio(new Uint8Array()))).status).toBe(400)
    expect(h.envios).toHaveLength(0)
  })

  it("413: um byte acima de 2 MB", async () => {
    logado()

    expect((await POST(envio(comTamanho(2 * 1024 * 1024 + 1)))).status).toBe(413)
    expect(h.envios).toHaveLength(0)
  })

  it("413: content-length grande é recusado antes de ler o corpo", async () => {
    logado()
    const pedido = new Request("http://localhost/api/social/perfil/foto", {
      method: "POST",
      body: "x",
      headers: { "content-length": String(50 * 1024 * 1024) },
    })
    const lerCorpo = vi.spyOn(pedido, "formData")

    expect((await POST(pedido)).status).toBe(413)
    expect(lerCorpo).not.toHaveBeenCalled()
  })

  it("400: PDF declarado como image/png é recusado pelo conteúdo", async () => {
    logado()
    const pdf = new TextEncoder().encode("%PDF-1.4 conteúdo")

    const resposta = await POST(envio(pdf, "image/png"))

    expect(resposta.status).toBe(400)
    expect((await resposta.json()).error).toContain("JPEG, PNG ou WebP")
    expect(h.envios).toHaveLength(0)
  })

  it("400: corpo que não é multipart", async () => {
    logado()
    const json = new Request("http://localhost/api/social/perfil/foto", {
      method: "POST",
      body: JSON.stringify({ foto: "x" }),
      headers: { "content-type": "application/json" },
    })

    expect((await POST(json)).status).toBe(400)
    expect(h.envios).toHaveLength(0)
  })

  it.each([
    ["URL antiga", "https://exemplo.com/a.png"],
    ["arquivo de outra pasta", `${OUTRO}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`],
    ["nome fora do formato da rota", `${DAVI}/foto.webp`],
  ])("não apaga a anterior quando ela é %s", async (_caso, anterior) => {
    logado()
    h.leitura = { data: { avatar_url: anterior }, error: null }

    expect((await POST(envio(PNG))).status).toBe(200)
    expect(h.remocoes).toEqual([])
  })

  it("se a foto anterior não for apagada, responde 200 e registra no log", async () => {
    logado()
    h.removeVazio = true
    const log = vi.spyOn(console, "error").mockImplementation(() => {})

    expect((await POST(envio(PNG))).status).toBe(200)
    expect(log).toHaveBeenCalledWith("[foto de perfil] arquivo não apagado", ANTERIOR, null)
  })

  it("409: outra aba trocou a foto no meio — a nova é apagada e a anterior fica", async () => {
    logado()
    h.linhaAtualizada = false

    const resposta = await POST(envio(PNG))

    expect(resposta.status).toBe(409)
    expect(h.remocoes).toEqual([[h.envios[0].caminho]])
  })

  it("500: se o banco falha, a foto recém-enviada é apagada e o erro não vaza", async () => {
    logado()
    h.erroEscrita = { code: "23514", message: 'violates check "profiles_validar_avatar_url"' }

    const resposta = await POST(envio(PNG))

    expect(resposta.status).toBe(500)
    expect(JSON.stringify(await resposta.json())).not.toContain("profiles_validar")
    expect(h.remocoes).toEqual([[h.envios[0].caminho]])
  })

  it("500: se o Storage falha, nada é gravado no perfil e o erro não vaza", async () => {
    logado()
    h.erroEnvio = { message: "mime type application/pdf is not supported" }

    const resposta = await POST(envio(PNG))

    expect(resposta.status).toBe(500)
    expect(JSON.stringify(await resposta.json())).not.toContain("mime type")
    expect(h.updates).toHaveLength(0)
  })

  it("404: sessão sem linha em profiles não envia nada", async () => {
    logado()
    h.leitura = { data: null, error: null }

    expect((await POST(envio(PNG))).status).toBe(404)
    expect(h.envios).toHaveLength(0)
  })
})

describe("DELETE /api/social/perfil/foto", () => {
  it("200: limpa avatar_url, condicionado à foto atual, e apaga o arquivo", async () => {
    logado()

    const resposta = await DELETE()

    expect(resposta.status).toBe(200)
    expect(h.updates).toEqual([{ avatar_url: null }])
    expect(h.condicoes).toEqual([`id=${DAVI}`, `avatar_url=${ANTERIOR}`])
    expect(h.remocoes).toEqual([[ANTERIOR]])
    expect((await resposta.json()).perfil.avatar_url).toBeNull()
  })

  it("401: sem sessão não mexe em nada", async () => {
    semSessao()

    expect((await DELETE()).status).toBe(401)
    expect(h.updates).toHaveLength(0)
    expect(h.remocoes).toHaveLength(0)
  })

  it("404: sessão sem linha em profiles", async () => {
    logado()
    h.leitura = { data: null, error: null }

    expect((await DELETE()).status).toBe(404)
    expect(h.updates).toHaveLength(0)
  })

  it("409: a foto mudou no meio — nada é apagado", async () => {
    logado()
    h.linhaAtualizada = false

    expect((await DELETE()).status).toBe(409)
    expect(h.remocoes).toHaveLength(0)
  })

  it("500: erro do banco não vaza e não apaga a foto", async () => {
    logado()
    h.erroEscrita = { message: "permission denied for table profiles" }

    const resposta = await DELETE()

    expect(resposta.status).toBe(500)
    expect(JSON.stringify(await resposta.json())).not.toContain("permission denied")
    expect(h.remocoes).toHaveLength(0)
  })
})
