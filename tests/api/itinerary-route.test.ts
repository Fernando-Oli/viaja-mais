import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF05.1 adicionar atividade ao itinerário.
 *
 * Cliente falso ramificado por tabela: `trip_members` para a checagem de
 * participação (`exigirMembro`) e `itinerary_items` para o insert.
 */

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  papel: { data: { role: "member" } as { role: string } | null, error: null as { message: string } | null },
  insertResult: { data: { id: "item-1" }, error: null as { message: string } | null },
  inserts: [] as Record<string, unknown>[],
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
        insert(valores: Record<string, unknown>) {
          h.inserts.push(valores)
          return { select: () => ({ single: async () => h.insertResult }) }
        },
        select: () => ({
          eq: () => ({
            order: () => ({ order: async () => ({ data: [{ id: "item-1" }], error: null }) }),
          }),
        }),
      }
    },
  }),
}))

import { GET, POST } from "@/app/api/trips/[tripId]/itinerary/route"

const TRIP_ID = "11111111-1111-1111-1111-111111111111"

const ITEM_VALIDO = {
  title: "Praia de Boa Viagem",
  date: "2026-12-02",
  start_time: "09:00",
  end_time: "12:00",
  location: "Recife",
  category: "attraction",
  status: "planned",
}

function requisicao(body: unknown) {
  return new Request(`http://localhost/api/trips/${TRIP_ID}/itinerary`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function contexto() {
  return { params: Promise.resolve({ tripId: TRIP_ID }) }
}

beforeEach(() => {
  h.inserts.length = 0
  h.getUser.mockReset()
  h.papel = { data: { role: "member" }, error: null }
  h.insertResult = { data: { id: "item-1" }, error: null }
})

describe("POST /api/trips/[tripId]/itinerary", () => {
  it("200: membro da viagem adiciona atividade", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await POST(requisicao(ITEM_VALIDO), contexto())

    expect(resposta.status).toBe(200)
    expect(h.inserts).toEqual([expect.objectContaining({ title: "Praia de Boa Viagem", trip_id: TRIP_ID })])
  })

  it("401: sem sessão não chega a inserir", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await POST(requisicao(ITEM_VALIDO), contexto())

    expect(resposta.status).toBe(401)
    expect(h.inserts).toHaveLength(0)
  })

  it("403: quem não participa da viagem não adiciona", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-2" } } })
    h.papel = { data: null, error: null }

    const resposta = await POST(requisicao(ITEM_VALIDO), contexto())

    expect(resposta.status).toBe(403)
    expect(h.inserts).toHaveLength(0)
  })

  it("400: payload inválido (término antes do início)", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await POST(requisicao({ ...ITEM_VALIDO, start_time: "15:00", end_time: "10:00" }), contexto())

    expect(resposta.status).toBe(400)
    expect(h.inserts).toHaveLength(0)
  })

  it("descarta colunas fora do schema e usa o trip_id da URL (sem mass-assignment)", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    await POST(
      requisicao({ ...ITEM_VALIDO, trip_id: "outra-viagem", id: "id-forjado", created_at: "2000-01-01" }),
      contexto(),
    )

    expect(h.inserts).toHaveLength(1)
    expect(h.inserts[0].trip_id).toBe(TRIP_ID)
    expect(h.inserts[0]).not.toHaveProperty("id")
    expect(h.inserts[0]).not.toHaveProperty("created_at")
  })
})

/** @RF05.4 visualizar itinerário. */
describe("GET /api/trips/[tripId]/itinerary", () => {
  it("200: membro lê o itinerário", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await GET(new Request("http://localhost"), contexto())

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ itinerary: [{ id: "item-1" }] })
  })

  it("403: quem não participa não lê o itinerário", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-2" } } })
    h.papel = { data: null, error: null }

    const resposta = await GET(new Request("http://localhost"), contexto())

    expect(resposta.status).toBe(403)
  })
})
