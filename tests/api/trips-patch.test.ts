import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF03.2 editar viagem.
 *
 * Cliente falso ramificado por tabela: `trip_members` para a checagem de
 * dono (`exigirDono`) e `trips` para o update.
 */

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  papel: { data: { role: "owner" } as { role: string } | null, error: null as { message: string } | null },
  updateResult: { data: { id: "trip-1", title: "Nova" }, error: null as { message: string } | null },
  updates: [] as unknown[],
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
        update(valores: unknown) {
          h.updates.push(valores)
          return {
            eq: () => ({
              select: () => ({ single: async () => h.updateResult }),
            }),
          }
        },
      }
    },
  }),
}))

import { PATCH } from "@/app/api/trips/[tripId]/route"

const TRIP_ID = "11111111-1111-1111-1111-111111111111"

function requisicao(body: unknown) {
  return new Request(`http://localhost/api/trips/${TRIP_ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function contexto() {
  return { params: Promise.resolve({ tripId: TRIP_ID }) }
}

beforeEach(() => {
  h.updates.length = 0
  h.getUser.mockReset()
  h.papel = { data: { role: "owner" }, error: null }
  h.updateResult = { data: { id: TRIP_ID, title: "Nova" }, error: null }
})

describe("PATCH /api/trips/[tripId]", () => {
  it("200: dono edita e recebe a viagem atualizada", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await PATCH(requisicao({ title: "Nova" }), contexto())

    expect(resposta.status).toBe(200)
    expect(h.updates).toEqual([expect.objectContaining({ title: "Nova" })])
  })

  it("401: sem sessão não chega a atualizar", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await PATCH(requisicao({ title: "Nova" }), contexto())

    expect(resposta.status).toBe(401)
    expect(h.updates).toHaveLength(0)
  })

  it("403: membro comum (não dono) não edita", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-2" } } })
    h.papel = { data: { role: "member" }, error: null }

    const resposta = await PATCH(requisicao({ title: "Nova" }), contexto())

    expect(resposta.status).toBe(403)
    expect(h.updates).toHaveLength(0)
  })

  it("400: payload inválido (data de fim antes da de início)", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await PATCH(
      requisicao({ start_date: "2026-02-10", end_date: "2026-02-01" }),
      contexto(),
    )

    expect(resposta.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })
})
