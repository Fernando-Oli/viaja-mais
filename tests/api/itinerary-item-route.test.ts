import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF05.2 editar atividade · @RF05.3 excluir atividade
 *
 * Cliente falso ramificado por tabela: `trip_members` para `exigirMembro` e
 * `itinerary_items` para leitura, update e delete. Os filtros `.eq()` são
 * registrados para provar que toda operação escopa por `trip_id` **e** `id`.
 */

type Linha = Record<string, unknown> | null

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  papel: { data: { role: "member" } as { role: string } | null, error: null as { message: string } | null },
  // O que o banco "encontra" com os filtros aplicados: null simula item de outra viagem.
  linha: { id: "item-1", title: "Praia" } as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
  deletes: 0,
  filtros: [] as [string, string][],
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

      // Cadeia `.eq().eq()` que termina em `fim`, anotando cada filtro.
      const filtrar = <T,>(fim: T) => ({
        eq: (c1: string, v1: string) => {
          h.filtros.push([c1, v1])
          return {
            eq: (c2: string, v2: string) => {
              h.filtros.push([c2, v2])
              return fim
            },
          }
        },
      })

      return {
        select: () => filtrar({ maybeSingle: async () => ({ data: h.linha as Linha, error: null }) }),
        update(valores: Record<string, unknown>) {
          h.updates.push(valores)
          return filtrar({
            select: () => ({ maybeSingle: async () => ({ data: h.linha as Linha, error: null }) }),
          })
        },
        delete() {
          h.deletes++
          return filtrar({ select: async () => ({ data: h.linha ? [h.linha] : [], error: null }) })
        },
      }
    },
  }),
}))

import { GET, PATCH, DELETE } from "@/app/api/trips/[tripId]/itinerary/[itemId]/route"

const TRIP_ID = "11111111-1111-1111-1111-111111111111"
const ITEM_ID = "22222222-2222-2222-2222-222222222222"

function requisicao(method: string, body?: unknown) {
  return new Request(`http://localhost/api/trips/${TRIP_ID}/itinerary/${ITEM_ID}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function contexto() {
  return { params: Promise.resolve({ tripId: TRIP_ID, itemId: ITEM_ID }) }
}

const logado = () => h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

beforeEach(() => {
  h.getUser.mockReset()
  h.papel = { data: { role: "member" }, error: null }
  h.linha = { id: ITEM_ID, title: "Praia" }
  h.updates.length = 0
  h.deletes = 0
  h.filtros.length = 0
})

describe("PATCH /api/trips/[tripId]/itinerary/[itemId]", () => {
  it("200: membro conclui a atividade", async () => {
    logado()

    const resposta = await PATCH(requisicao("PATCH", { status: "completed" }), contexto())

    expect(resposta.status).toBe(200)
    expect(h.updates).toEqual([expect.objectContaining({ status: "completed" })])
  })

  it("200: membro edita título e horários", async () => {
    logado()

    const resposta = await PATCH(
      requisicao("PATCH", { title: "Praia de Porto de Galinhas", start_time: "08:00", end_time: "11:30" }),
      contexto(),
    )

    expect(resposta.status).toBe(200)
    expect(h.updates[0]).toMatchObject({ title: "Praia de Porto de Galinhas", start_time: "08:00", end_time: "11:30" })
  })

  it("401: sem sessão não chega a atualizar", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await PATCH(requisicao("PATCH", { status: "completed" }), contexto())

    expect(resposta.status).toBe(401)
    expect(h.updates).toHaveLength(0)
  })

  it("403: quem não participa da viagem não altera", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-2" } } })
    h.papel = { data: null, error: null }

    const resposta = await PATCH(requisicao("PATCH", { status: "completed" }), contexto())

    expect(resposta.status).toBe(403)
    expect(h.updates).toHaveLength(0)
  })

  it("400: payload inválido (término antes do início)", async () => {
    logado()

    const resposta = await PATCH(requisicao("PATCH", { start_time: "15:00", end_time: "10:00" }), contexto())

    expect(resposta.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("400: status fora da lista permitida", async () => {
    logado()

    const resposta = await PATCH(requisicao("PATCH", { status: "feito" }), contexto())

    expect(resposta.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("400: corpo vazio", async () => {
    logado()

    const resposta = await PATCH(requisicao("PATCH", {}), contexto())

    expect(resposta.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("404: item que não pertence a esta viagem", async () => {
    logado()
    h.linha = null

    const resposta = await PATCH(requisicao("PATCH", { status: "completed" }), contexto())

    expect(resposta.status).toBe(404)
  })

  it("filtra por trip_id e id, e descarta trip_id/id vindos do corpo (sem mass-assignment)", async () => {
    logado()

    await PATCH(requisicao("PATCH", { title: "Nova", trip_id: "outra-viagem", id: "id-forjado" }), contexto())

    expect(h.filtros).toEqual([
      ["trip_id", TRIP_ID],
      ["id", ITEM_ID],
    ])
    expect(h.updates[0]).not.toHaveProperty("trip_id")
    expect(h.updates[0]).not.toHaveProperty("id")
  })
})

describe("DELETE /api/trips/[tripId]/itinerary/[itemId]", () => {
  it("200: membro exclui a atividade", async () => {
    logado()

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(200)
    expect(h.deletes).toBe(1)
    expect(h.filtros).toEqual([
      ["trip_id", TRIP_ID],
      ["id", ITEM_ID],
    ])
  })

  it("401: sem sessão não chega a excluir", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(401)
    expect(h.deletes).toBe(0)
  })

  it("403: quem não participa da viagem não exclui", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-2" } } })
    h.papel = { data: null, error: null }

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(403)
    expect(h.deletes).toBe(0)
  })

  it("404: item que não pertence a esta viagem", async () => {
    logado()
    h.linha = null

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(404)
  })
})

describe("GET /api/trips/[tripId]/itinerary/[itemId]", () => {
  it("200: membro carrega a atividade para editar", async () => {
    logado()

    const resposta = await GET(requisicao("GET"), contexto())

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ item: { id: ITEM_ID, title: "Praia" } })
  })

  it("403: quem não participa não carrega", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-2" } } })
    h.papel = { data: null, error: null }

    const resposta = await GET(requisicao("GET"), contexto())

    expect(resposta.status).toBe(403)
  })

  it("404: item que não pertence a esta viagem", async () => {
    logado()
    h.linha = null

    const resposta = await GET(requisicao("GET"), contexto())

    expect(resposta.status).toBe(404)
  })
})
