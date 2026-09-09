import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Regressão do bug P0 (S02-A): o `POST /api/trips` criava a viagem mas o insert
 * do criador em `trip_members` estava comentado. Como o `GET` usa
 * `trip_members!inner` e filtra por participação, a viagem criada nunca voltava
 * para a lista — o usuário criava e "sumia".
 *
 * O cliente falso tem a forma encadeada do supabase-js; não é mock do SDK.
 */

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  inserts: [] as Array<{ tabela: string; valores: unknown }>,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from(tabela: string) {
      return {
        insert(valores: unknown) {
          h.inserts.push({ tabela, valores })
          const resultado =
            tabela === "trips"
              ? { data: [{ id: "trip-1" }], error: null }
              : { data: null, error: null }
          const promessa = Promise.resolve(resultado)
          return Object.assign(promessa, { select: () => Promise.resolve(resultado) })
        },
      }
    },
  }),
}))

import { POST } from "@/app/api/trips/route"

const CORPO_VALIDO = {
  title: "Viagem",
  destination: "Paris",
  start_date: "2026-01-01",
  end_date: "2026-01-05",
  currency: "BRL",
  status: "planning",
}

function requisicao(body: unknown) {
  return new Request("http://localhost/api/trips", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  h.inserts.length = 0
  h.getUser.mockReset()
})

describe("POST /api/trips", () => {
  it("registra o criador como dono em trip_members", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await POST(requisicao(CORPO_VALIDO))

    expect(resposta.status).toBe(200)
    const membro = h.inserts.find((i) => i.tabela === "trip_members")
    expect(membro?.valores).toEqual({ trip_id: "trip-1", user_id: "user-1", role: "owner" })
  })

  it("responde 401 e não cria nada sem sessão", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await POST(requisicao(CORPO_VALIDO))

    expect(resposta.status).toBe(401)
    expect(h.inserts).toHaveLength(0)
  })
})
