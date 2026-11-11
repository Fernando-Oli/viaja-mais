import { describe, it, expect, vi, beforeEach } from "vitest"
import { VALIDADE_URL_AVATAR_S } from "@/lib/social/foto"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"

/**
 * @RF02.1 @RF02.2 @RNF02.11 — dados básicos de um perfil, por id (consumido pelo
 * auth-context para o cabeçalho).
 *
 * Sem caminho 403: os dados básicos são visíveis a qualquer autenticado
 * (detalhamento do RF02). O que se prova é sessão exigida, id validado e erro
 * do banco que não vaza.
 */

type RespostaBanco = { data: Record<string, unknown> | null; error: { code?: string; message: string } | null }

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  tabelas: [] as string[],
  filtros: [] as [string, string][],
  resposta: { data: null, error: null } as RespostaBanco,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from(tabela: string) {
      h.tabelas.push(tabela)
      return {
        select: () => ({
          eq: (coluna: string, valor: string) => {
            h.filtros.push([coluna, valor])
            return { maybeSingle: async () => h.resposta }
          },
        }),
      }
    },
  }),
}))

/**
 * Storage falso do cliente de serviço: registra cada assinatura (bucket,
 * caminhos e validade) e devolve URLs assinadas previsíveis. `falha` simula o
 * Storage fora do ar.
 */
const s = vi.hoisted(() => ({
  URL_ASSINADA: "https://storage.teste/storage/v1/object/sign/avatars/",
  assinaturas: [] as { bucket: string; caminhos: string[]; validade: number }[],
  falha: null as { message: string } | null,
  /** Sem SUPABASE_SERVICE_ROLE_KEY: criar o cliente de serviço lança, como no lib/env. */
  semChave: false,
}))

vi.mock("@/lib/supabase/admin", () => ({
  criarClienteAdmin: () => {
    if (s.semChave) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada")
    return {
    storage: {
      from: (bucket: string) => ({
        async createSignedUrls(caminhos: string[], validade: number) {
          s.assinaturas.push({ bucket, caminhos, validade })
          if (s.falha) return { data: null, error: s.falha }
          return {
            data: caminhos.map((path) => ({ path, signedUrl: `${s.URL_ASSINADA}${path}?token=tk`, error: null })),
            error: null,
          }
        },
      }),
    },
    }
  },
}))
import { GET } from "@/app/api/profile/[userId]/route"

const ANA = "11111111-1111-4111-8111-111111111111"
const BRUNO = "22222222-2222-4222-8222-222222222222"
const perfilAna = { id: ANA, full_name: "Ana Teste", avatar_url: null, created_at: "x", updated_at: "y" }

const contexto = (userId: string) => ({ params: Promise.resolve({ userId }) })
const pedido = () => new Request("http://localhost/api/profile/x")

beforeEach(() => {
  h.getUser.mockReset()
  h.tabelas.length = 0
  h.filtros.length = 0
  h.resposta = { data: perfilAna, error: null }
  s.assinaturas.length = 0
  s.falha = null
  s.semChave = false
  esquecerLinksEmitidos()
})

describe("GET /api/profile/[userId]", () => {
  it("200: autenticado lê os dados básicos de um perfil", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: BRUNO } } })

    const resposta = await GET(pedido(), contexto(ANA))

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ profile: perfilAna })
    expect(h.tabelas).toEqual(["profiles"])
    expect(h.filtros).toEqual([["id", ANA]])
  })

  it("200: o caminho da foto no bucket volta como URL assinada, numa assinatura só", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: BRUNO } } })
    const caminho = `${ANA}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`
    h.resposta = { data: { ...perfilAna, avatar_url: caminho }, error: null }

    const { profile } = await (await GET(pedido(), contexto(ANA))).json()

    expect(profile.avatar_url).toBe(`${s.URL_ASSINADA}${caminho}?token=tk`)
    expect(s.assinaturas).toEqual([{ bucket: "avatars", caminhos: [caminho], validade: VALIDADE_URL_AVATAR_S }])
  })

  it("200: sem foto não vai ao Storage; com o Storage fora do ar, a foto volta nula", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: BRUNO } } })
    expect((await (await GET(pedido(), contexto(ANA))).json()).profile.avatar_url).toBeNull()
    expect(s.assinaturas).toEqual([])

    const silenciar = vi.spyOn(console, "error").mockImplementation(() => {})
    s.falha = { message: "storage fora do ar" }
    h.resposta = { data: { ...perfilAna, avatar_url: `${ANA}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp` }, error: null }
    const resposta = await GET(pedido(), contexto(ANA))
    expect(resposta.status).toBe(200)
    expect((await resposta.json()).profile.avatar_url).toBeNull()
    silenciar.mockRestore()
  })

  it("200: sem a chave de serviço, o menu continua com nome; a foto é que vem nula", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: BRUNO } } })
    s.semChave = true
    expect((await GET(pedido(), contexto(ANA))).status).toBe(200)

    const silenciar = vi.spyOn(console, "error").mockImplementation(() => {})
    h.resposta = { data: { ...perfilAna, avatar_url: `${ANA}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp` }, error: null }
    const { profile } = await (await GET(pedido(), contexto(ANA))).json()
    expect(profile).toEqual({ ...perfilAna, avatar_url: null })
    silenciar.mockRestore()
  })

  it("a resposta com o link assinado não vai para cache compartilhado", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: BRUNO } } })

    expect((await GET(pedido(), contexto(ANA))).headers.get("cache-control")).toBe("private, no-store")
  })

  it("401: sem sessão não chega a consultar", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await GET(pedido(), contexto(ANA))

    expect(resposta.status).toBe(401)
    expect(h.filtros).toHaveLength(0)
  })

  it.each(["undefined", "nao-e-uuid", "1111"])("400: id inválido (%s) não chega a consultar", async (id) => {
    h.getUser.mockResolvedValue({ data: { user: { id: BRUNO } } })

    const resposta = await GET(pedido(), contexto(id))

    expect(resposta.status).toBe(400)
    expect(h.filtros).toHaveLength(0)
  })

  it("404: id sem perfil", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: BRUNO } } })
    h.resposta = { data: null, error: null }

    expect((await GET(pedido(), contexto(ANA))).status).toBe(404)
  })

  it("500: erro do banco não vaza a mensagem crua", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: BRUNO } } })
    h.resposta = { data: null, error: { code: "42501", message: "permission denied for table profiles" } }

    const resposta = await GET(pedido(), contexto(ANA))

    expect(resposta.status).toBe(500)
    expect(JSON.stringify(await resposta.json())).not.toContain("permission denied")
  })
})
