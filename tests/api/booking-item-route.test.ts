import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF07.5 editar reserva · @RF07.6 excluir reserva
 *
 * Cliente falso ramificado por tabela: `trip_members` para `exigirMembro` e
 * `bookings` para leitura, update e delete. Os filtros `.eq()` são registrados
 * para provar que toda operação escopa por `trip_id` **e** `id`.
 */

type Linha = Record<string, unknown> | null

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  papel: { data: { role: "member" } as { role: string } | null, error: null as { message: string } | null },
  // O que o banco "encontra" com os filtros aplicados: null simula reserva de outra viagem.
  linha: { id: "booking-1", title: "Voo" } as Record<string, unknown> | null,
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

import { GET, PATCH, DELETE } from "@/app/api/trips/[tripId]/bookings/[bookingId]/route"

const TRIP_ID = "11111111-1111-1111-1111-111111111111"
const BOOKING_ID = "33333333-3333-3333-3333-333333333333"

function requisicao(method: string, body?: unknown) {
  return new Request(`http://localhost/api/trips/${TRIP_ID}/bookings/${BOOKING_ID}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function contexto() {
  return { params: Promise.resolve({ tripId: TRIP_ID, bookingId: BOOKING_ID }) }
}

const logado = () => h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
const naoMembro = () => {
  h.getUser.mockResolvedValue({ data: { user: { id: "user-2" } } })
  h.papel = { data: null, error: null }
}

beforeEach(() => {
  h.getUser.mockReset()
  h.papel = { data: { role: "member" }, error: null }
  h.linha = { id: BOOKING_ID, title: "Voo" }
  h.updates.length = 0
  h.deletes = 0
  h.filtros.length = 0
})

describe("PATCH /api/trips/[tripId]/bookings/[bookingId]", () => {
  it("200: membro edita título e status", async () => {
    logado()

    const resposta = await PATCH(requisicao("PATCH", { title: "Voo remarcado", status: "pending" }), contexto())

    expect(resposta.status).toBe(200)
    expect(h.updates).toEqual([expect.objectContaining({ title: "Voo remarcado", status: "pending" })])
  })

  it("401: sem sessão não chega a atualizar", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await PATCH(requisicao("PATCH", { title: "Voo remarcado" }), contexto())

    expect(resposta.status).toBe(401)
    expect(h.updates).toHaveLength(0)
  })

  it("403: quem não participa da viagem não altera", async () => {
    naoMembro()

    const resposta = await PATCH(requisicao("PATCH", { title: "Voo remarcado" }), contexto())

    expect(resposta.status).toBe(403)
    expect(h.updates).toHaveLength(0)
  })

  it("400: payload inválido (término antes do início)", async () => {
    logado()

    const resposta = await PATCH(
      requisicao("PATCH", { start_date: "2026-12-05T10:00", end_date: "2026-12-01T10:00" }),
      contexto(),
    )

    expect(resposta.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("400: status fora da lista permitida", async () => {
    logado()

    const resposta = await PATCH(requisicao("PATCH", { status: "pago" }), contexto())

    expect(resposta.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("400: corpo vazio", async () => {
    logado()

    const resposta = await PATCH(requisicao("PATCH", {}), contexto())

    expect(resposta.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("404: reserva que não pertence a esta viagem", async () => {
    logado()
    h.linha = null

    const resposta = await PATCH(requisicao("PATCH", { title: "Voo remarcado" }), contexto())

    expect(resposta.status).toBe(404)
  })

  it("filtra por trip_id e id, e descarta trip_id/user_id/id do corpo (sem mass-assignment)", async () => {
    logado()

    await PATCH(
      requisicao("PATCH", { title: "Nova", trip_id: "outra-viagem", user_id: "outra-pessoa", id: "id-forjado" }),
      contexto(),
    )

    expect(h.filtros).toEqual([
      ["trip_id", TRIP_ID],
      ["id", BOOKING_ID],
    ])
    expect(h.updates[0]).not.toHaveProperty("trip_id")
    expect(h.updates[0]).not.toHaveProperty("user_id")
    expect(h.updates[0]).not.toHaveProperty("id")
  })
})

describe("DELETE /api/trips/[tripId]/bookings/[bookingId]", () => {
  it("200: membro exclui a reserva", async () => {
    logado()

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(200)
    expect(h.deletes).toBe(1)
    expect(h.filtros).toEqual([
      ["trip_id", TRIP_ID],
      ["id", BOOKING_ID],
    ])
  })

  it("401: sem sessão não chega a excluir", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(401)
    expect(h.deletes).toBe(0)
  })

  it("403: quem não participa da viagem não exclui", async () => {
    naoMembro()

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(403)
    expect(h.deletes).toBe(0)
  })

  it("404: reserva que não pertence a esta viagem", async () => {
    logado()
    h.linha = null

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(404)
  })
})

describe("GET /api/trips/[tripId]/bookings/[bookingId]", () => {
  it("200: membro carrega a reserva para editar", async () => {
    logado()

    const resposta = await GET(requisicao("GET"), contexto())

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ booking: { id: BOOKING_ID, title: "Voo" } })
  })

  it("403: quem não participa não carrega", async () => {
    naoMembro()

    const resposta = await GET(requisicao("GET"), contexto())

    expect(resposta.status).toBe(403)
  })

  it("404: reserva que não pertence a esta viagem", async () => {
    logado()
    h.linha = null

    const resposta = await GET(requisicao("GET"), contexto())

    expect(resposta.status).toBe(404)
  })
})
