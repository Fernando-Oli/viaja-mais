import { describe, it, expect, vi, beforeEach } from "vitest"
import { env } from "@/lib/env"

/**
 * @RF02.1 @RNF02.11 — dados básicos de um perfil, por id (consumido pelo
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

  it("200: o caminho da foto no bucket volta como URL pública", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: BRUNO } } })
    const caminho = `${ANA}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`
    h.resposta = { data: { ...perfilAna, avatar_url: caminho }, error: null }

    const { profile } = await (await GET(pedido(), contexto(ANA))).json()

    // Montado a partir de lib/env: no CI a URL do Supabase não é a local.
    expect(profile.avatar_url).toBe(
      `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/avatars/${caminho}`,
    )
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
