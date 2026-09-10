import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF03.1 criar viagem.
 *
 * Regressão do bug P0 (S02-A): o `POST /api/trips` criava a viagem mas o insert
 * do criador em `trip_members` estava comentado. Como o `GET` usa
 * `trip_members!inner` e filtra por participação, a viagem criada nunca voltava
 * para a lista — o usuário criava e "sumia".
 *
 * A garantia agora vem do trigger `on_trip_created` (supabase/migrations/),
 * não de um insert manual aqui: inserir de novo em `trip_members` colidiria
 * com a constraint única `trip_members_trip_id_user_id_key`. O trigger roda
 * no Postgres real, fora do alcance deste cliente falso — por isso o teste
 * cobre só o que a rota ainda faz (criar a viagem), não o efeito do trigger.
 *
 * O cliente falso tem a forma encadeada do supabase-js; não é mock do SDK.
 */

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  inserts: [] as Array<{ tabela: string; valores: unknown }>,
  tripInsertResult: { data: [{ id: "trip-1" }], error: null as { message: string } | null },
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from(tabela: string) {
      return {
        insert(valores: unknown) {
          h.inserts.push({ tabela, valores })
          const resultado = h.tripInsertResult
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
  h.tripInsertResult = { data: [{ id: "trip-1" }], error: null }
})

describe("POST /api/trips", () => {
  it("cria a viagem e devolve os dados", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

    const resposta = await POST(requisicao(CORPO_VALIDO))

    expect(resposta.status).toBe(200)
    expect(h.inserts).toEqual([
      { tabela: "trips", valores: [expect.objectContaining({ user_id: "user-1", title: "Viagem" })] },
    ])
  })

  it("responde 401 e não cria nada sem sessão", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await POST(requisicao(CORPO_VALIDO))

    expect(resposta.status).toBe(401)
    expect(h.inserts).toHaveLength(0)
  })

  it("responde 500 quando o insert da viagem não retorna dado", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
    h.tripInsertResult = { data: [], error: null }

    const resposta = await POST(requisicao(CORPO_VALIDO))

    expect(resposta.status).toBe(500)
  })

  it("responde 400 quando o insert da viagem falha", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
    h.tripInsertResult = { data: null as unknown as never[], error: { message: "falhou" } }

    const resposta = await POST(requisicao(CORPO_VALIDO))

    expect(resposta.status).toBe(400)
  })
})
