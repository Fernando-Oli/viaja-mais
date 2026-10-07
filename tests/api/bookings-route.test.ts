import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF07.1 adicionar reserva · @RF07.7 visualizar reservas
 *
 * Cliente falso ramificado por tabela: `trip_members` para `exigirMembro` e
 * `bookings` para o insert e a listagem.
 */

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  papel: { data: { role: "member" } as { role: string } | null, error: null as { message: string } | null },
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
          return { select: () => ({ single: async () => ({ data: { id: "booking-1" }, error: null }) }) }
        },
        select: () => ({
          eq: () => ({ order: async () => ({ data: [{ id: "booking-1" }], error: null }) }),
        }),
      }
    },
  }),
}))

import { GET, POST } from "@/app/api/trips/[tripId]/bookings/route"

const TRIP_ID = "11111111-1111-1111-1111-111111111111"

const RESERVA_VALIDA = {
  type: "flight",
  title: "Voo São Paulo - Recife",
  provider: "LATAM",
  start_date: "2026-12-01T10:00",
  end_date: "2026-12-01T13:05",
  price: 890.5,
}

function requisicao(body: unknown) {
  return new Request(`http://localhost/api/trips/${TRIP_ID}/bookings`, {
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
})

describe("POST /api/trips/[tripId]/bookings", () => {
  it("200: membro da viagem adiciona reserva", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await POST(requisicao(RESERVA_VALIDA), contexto())

    expect(resposta.status).toBe(200)
    expect(h.inserts).toEqual([
      expect.objectContaining({
        title: "Voo São Paulo - Recife",
        trip_id: TRIP_ID,
        user_id: "user-1",
        currency: "BRL",
        status: "confirmed",
      }),
    ])
  })

  it("401: sem sessão não chega a inserir", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await POST(requisicao(RESERVA_VALIDA), contexto())

    expect(resposta.status).toBe(401)
    expect(h.inserts).toHaveLength(0)
  })

  it("403: quem não participa da viagem não adiciona", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-2" } } })
    h.papel = { data: null, error: null }

    const resposta = await POST(requisicao(RESERVA_VALIDA), contexto())

    expect(resposta.status).toBe(403)
    expect(h.inserts).toHaveLength(0)
  })

  it("400: payload inválido (término antes do início)", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await POST(
      requisicao({ ...RESERVA_VALIDA, start_date: "2026-12-05T10:00", end_date: "2026-12-01T10:00" }),
      contexto(),
    )

    expect(resposta.status).toBe(400)
    expect(h.inserts).toHaveLength(0)
  })

  it("400: tipo fora da lista permitida", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await POST(requisicao({ ...RESERVA_VALIDA, type: "navio" }), contexto())

    expect(resposta.status).toBe(400)
    expect(h.inserts).toHaveLength(0)
  })

  it("400: preço negativo", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await POST(requisicao({ ...RESERVA_VALIDA, price: -10 }), contexto())

    expect(resposta.status).toBe(400)
    expect(h.inserts).toHaveLength(0)
  })

  it("autor vem da sessão e viagem da URL, mesmo que o corpo tente outros (sem mass-assignment)", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    await POST(
      requisicao({ ...RESERVA_VALIDA, user_id: "outra-pessoa", trip_id: "outra-viagem", id: "id-forjado" }),
      contexto(),
    )

    expect(h.inserts).toHaveLength(1)
    expect(h.inserts[0].user_id).toBe("user-1")
    expect(h.inserts[0].trip_id).toBe(TRIP_ID)
    expect(h.inserts[0]).not.toHaveProperty("id")
  })
})

describe("GET /api/trips/[tripId]/bookings", () => {
  it("200: membro lista as reservas", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await GET(new Request("http://localhost"), contexto())

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ bookings: [{ id: "booking-1" }] })
  })

  it("403: quem não participa não lista", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-2" } } })
    h.papel = { data: null, error: null }

    const resposta = await GET(new Request("http://localhost"), contexto())

    expect(resposta.status).toBe(403)
  })
})
