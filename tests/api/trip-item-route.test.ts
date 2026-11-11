import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF03.3 excluir viagem · @RF03.5 visualizar viagem
 *
 * GET e DELETE de uma viagem. O PATCH tem arquivo próprio
 * (`trips-patch.test.ts`). Ver é de qualquer membro; excluir apaga em cascata
 * os dados do grupo inteiro e é só do dono.
 */

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  papel: { data: { role: "owner" } as { role: string } | null, error: null as { message: string } | null },
  leitura: { data: { id: "trip-1" } as unknown, error: null as { message: string } | null },
  exclusao: { error: null as { message: string } | null },
  excluidas: [] as unknown[],
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from(tabela: string) {
      if (tabela === "trip_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => h.papel }),
            }),
          }),
        }
      }
      return {
        select: () => ({
          eq: () => ({ single: async () => h.leitura }),
        }),
        delete: () => ({
          eq: async (_coluna: string, valor: unknown) => {
            h.excluidas.push(valor)
            return h.exclusao
          },
        }),
      }
    },
  }),
}))

import { GET, DELETE } from "@/app/api/trips/[tripId]/route"

const TRIP_ID = "11111111-1111-1111-1111-111111111111"
const requisicao = (method: string) => new Request(`http://localhost/api/trips/${TRIP_ID}`, { method })
const contexto = () => ({ params: Promise.resolve({ tripId: TRIP_ID }) })

const logado = () => h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
const semSessao = () => h.getUser.mockResolvedValue({ data: { user: null } })

beforeEach(() => {
  h.getUser.mockReset()
  h.papel = { data: { role: "owner" }, error: null }
  h.leitura = { data: { id: TRIP_ID, title: "Porto" }, error: null }
  h.exclusao = { error: null }
  h.excluidas.length = 0
})

describe("GET /api/trips/[tripId]", () => {
  it("200: membro (não dono) vê a viagem", async () => {
    logado()
    h.papel = { data: { role: "member" }, error: null }

    const resposta = await GET(requisicao("GET"), contexto())

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ trip: { id: TRIP_ID, title: "Porto" } })
  })

  it("401: sem sessão", async () => {
    semSessao()
    expect((await GET(requisicao("GET"), contexto())).status).toBe(401)
  })

  it("403: quem não participa", async () => {
    logado()
    h.papel = { data: null, error: null }
    expect((await GET(requisicao("GET"), contexto())).status).toBe(403)
  })

  it("404: viagem não encontrada na leitura", async () => {
    logado()
    h.leitura = { data: null, error: { message: "0 rows" } }

    const resposta = await GET(requisicao("GET"), contexto())

    expect(resposta.status).toBe(404)
    expect(await resposta.json()).toEqual({ error: "Viagem não encontrada" })
  })

  it("500: falha ao consultar o papel não vira 200 nem 403", async () => {
    logado()
    h.papel = { data: null, error: { message: "conexão caiu" } }
    expect((await GET(requisicao("GET"), contexto())).status).toBe(500)
  })
})

describe("DELETE /api/trips/[tripId]", () => {
  it("200: dono exclui a viagem da URL", async () => {
    logado()

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(200)
    expect(h.excluidas).toEqual([TRIP_ID])
  })

  it("401: sem sessão não exclui", async () => {
    semSessao()
    expect((await DELETE(requisicao("DELETE"), contexto())).status).toBe(401)
    expect(h.excluidas).toEqual([])
  })

  it("403: membro que não é dono não exclui", async () => {
    logado()
    h.papel = { data: { role: "member" }, error: null }

    expect((await DELETE(requisicao("DELETE"), contexto())).status).toBe(403)
    expect(h.excluidas).toEqual([])
  })

  it("400: erro do banco na exclusão", async () => {
    logado()
    h.exclusao = { error: { message: "violação" } }
    expect((await DELETE(requisicao("DELETE"), contexto())).status).toBe(400)
  })
})
