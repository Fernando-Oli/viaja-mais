import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * GET /api/invitations (S09-F): os convites pendentes, com a viagem, numa
 * consulta só.
 *
 * Antes: 1 consulta pelos convites + 1 por convite para a viagem — e as N
 * voltavam vazias, porque o convidado ainda não enxerga a viagem pela RLS. O
 * que a função do banco devolve (só os convites do e-mail da sessão) é provado
 * em tests/rls/16-meus-convites.test.ts.
 *
 * @RF04.3 · @RNF01.2
 */

const h = vi.hoisted(() => ({
  usuario: { id: "u-carla", email: "teste.c@viajamais.local" } as { id: string; email: string } | null,
  rpcs: [] as string[],
  tabelas: [] as string[],
  resposta: { data: [] as unknown[], error: null as { message: string } | null },
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: h.usuario } }) },
    rpc: async (nome: string) => {
      h.rpcs.push(nome)
      return h.resposta
    },
    from: (tabela: string) => {
      h.tabelas.push(tabela)
      throw new Error(`a rota não devia ler ${tabela} direto`)
    },
  }),
}))
vi.mock("@/lib/supabase/admin", () => ({ criarClienteAdmin: vi.fn() }))

import { GET } from "@/app/api/invitations/route"

const convite = (n: number) => ({
  id: `conv-${n}`,
  trip_id: `trip-${n}`,
  created_at: "2026-11-13T10:00:00Z",
  title: `Viagem ${n}`,
  destination: "Pirenópolis",
  start_date: "2026-12-01",
  end_date: "2026-12-05",
})

beforeEach(() => {
  h.usuario = { id: "u-carla", email: "teste.c@viajamais.local" }
  h.rpcs.length = 0
  h.tabelas.length = 0
  h.resposta = { data: [], error: null }
})

describe("GET /api/invitations", () => {
  it("200: dez convites, uma consulta só, e nenhuma leitura de trips", async () => {
    h.resposta = { data: Array.from({ length: 10 }, (_, i) => convite(i)), error: null }

    const resposta = await GET()

    expect(resposta.status).toBe(200)
    expect(h.rpcs).toEqual(["meus_convites_pendentes"])
    expect(h.tabelas).toEqual([])
    expect((await resposta.json()).invitations).toHaveLength(10)
  })

  it("o cartão recebe a viagem (antes vinha sempre null)", async () => {
    h.resposta = { data: [convite(1)], error: null }

    const { invitations } = await (await GET()).json()

    expect(invitations[0]).toEqual({
      id: "conv-1",
      trip_id: "trip-1",
      status: "pending",
      created_at: "2026-11-13T10:00:00Z",
      trip: { id: "trip-1", title: "Viagem 1", destination: "Pirenópolis", start_date: "2026-12-01", end_date: "2026-12-05" },
    })
  })

  it("401: sem sessão, nada é consultado", async () => {
    h.usuario = null

    const resposta = await GET()

    expect(resposta.status).toBe(401)
    expect(h.rpcs).toEqual([])
  })

  it("400: erro do banco não volta cru", async () => {
    h.resposta = { data: [], error: { message: 'function public.meus_convites_pendentes() does not exist' } }

    const resposta = await GET()

    expect(resposta.status).toBe(400)
    expect(JSON.stringify(await resposta.json())).not.toContain("does not exist")
  })
})
