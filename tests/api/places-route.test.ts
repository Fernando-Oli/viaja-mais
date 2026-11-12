import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF08.2 salvar lugar · @RF08.3 notas no lugar
 *
 * Cliente falso ramificado por tabela: `trip_members` para `exigirMembro` e
 * `places` para o insert e a listagem.
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
          return { select: () => ({ single: async () => ({ data: { id: "place-1" }, error: null }) }) }
        },
        select: () => ({
          eq: () => ({ order: async () => ({ data: [{ id: "place-1" }], error: null }) }),
        }),
      }
    },
  }),
}))

import { GET, POST } from "@/app/api/trips/[tripId]/places/route"

const TRIP_ID = "11111111-1111-1111-1111-111111111111"

const LUGAR_VALIDO = {
  name: "Marco Zero",
  address: "Praça Rio Branco, Recife - PE",
  latitude: -8.0631,
  longitude: -34.8711,
  category: "Ponto turístico",
  rating: 4.7,
  notes: "Ir no fim da tarde",
}

function requisicao(body: unknown) {
  return new Request(`http://localhost/api/trips/${TRIP_ID}/places`, {
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

describe("POST /api/trips/[tripId]/places", () => {
  it("200: membro da viagem salva lugar com observação", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await POST(requisicao(LUGAR_VALIDO), contexto())

    expect(resposta.status).toBe(200)
    expect(h.inserts).toEqual([
      expect.objectContaining({
        name: "Marco Zero",
        notes: "Ir no fim da tarde",
        trip_id: TRIP_ID,
        user_id: "user-1",
      }),
    ])
  })

  it("401: sem sessão não chega a inserir", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await POST(requisicao(LUGAR_VALIDO), contexto())

    expect(resposta.status).toBe(401)
    expect(h.inserts).toHaveLength(0)
  })

  it("403: quem não participa da viagem não salva", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-2" } } })
    h.papel = { data: null, error: null }

    const resposta = await POST(requisicao(LUGAR_VALIDO), contexto())

    expect(resposta.status).toBe(403)
    expect(h.inserts).toHaveLength(0)
  })

  it("400: payload inválido (sem nome)", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await POST(requisicao({ ...LUGAR_VALIDO, name: "  " }), contexto())

    expect(resposta.status).toBe(400)
    expect(h.inserts).toHaveLength(0)
  })

  it("400: latitude fora da faixa", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await POST(requisicao({ ...LUGAR_VALIDO, latitude: 120 }), contexto())

    expect(resposta.status).toBe(400)
    expect(h.inserts).toHaveLength(0)
  })

  it("autor vem da sessão e viagem da URL, mesmo que o corpo tente outros (sem mass-assignment)", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    await POST(
      requisicao({ ...LUGAR_VALIDO, user_id: "outra-pessoa", trip_id: "outra-viagem", id: "id-forjado", visited: true }),
      contexto(),
    )

    expect(h.inserts).toHaveLength(1)
    expect(h.inserts[0].user_id).toBe("user-1")
    expect(h.inserts[0].trip_id).toBe(TRIP_ID)
    expect(h.inserts[0]).not.toHaveProperty("id")
    expect(h.inserts[0]).not.toHaveProperty("visited")
  })
})

describe("GET /api/trips/[tripId]/places", () => {
  it("200: membro lista os lugares", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await GET(new Request("http://localhost"), contexto())

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ places: [{ id: "place-1" }] })
  })

  it("401: sem sessão não lista", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await GET(new Request("http://localhost"), contexto())

    expect(resposta.status).toBe(401)
  })

  it("403: quem não participa não lista (antes desta atividade, listava vazio sem erro)", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-2" } } })
    h.papel = { data: null, error: null }

    const resposta = await GET(new Request("http://localhost"), contexto())

    expect(resposta.status).toBe(403)
  })
})
