import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF08.4 marcar visitado · @RF08.6 excluir lugar
 *
 * Cliente falso ramificado por tabela: `trip_members` para `exigirMembro` e
 * `places` para update e delete. Os filtros `.eq()` são registrados para provar
 * que toda operação escopa por `trip_id` **e** `id`.
 */

type Linha = Record<string, unknown> | null

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  papel: { data: { role: "member" } as { role: string } | null, error: null as { message: string } | null },
  // O que o banco "encontra" com os filtros aplicados: null simula lugar de outra viagem.
  linha: { id: "place-1", name: "Marco Zero" } as Record<string, unknown> | null,
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

import { PATCH, DELETE } from "@/app/api/trips/[tripId]/places/[placeId]/route"

const TRIP_ID = "11111111-1111-1111-1111-111111111111"
const PLACE_ID = "44444444-4444-4444-4444-444444444444"

function requisicao(method: string, body?: unknown) {
  return new Request(`http://localhost/api/trips/${TRIP_ID}/places/${PLACE_ID}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function contexto() {
  return { params: Promise.resolve({ tripId: TRIP_ID, placeId: PLACE_ID }) }
}

const logado = () => h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
const naoMembro = () => {
  h.getUser.mockResolvedValue({ data: { user: { id: "user-2" } } })
  h.papel = { data: null, error: null }
}

beforeEach(() => {
  h.getUser.mockReset()
  h.papel = { data: { role: "member" }, error: null }
  h.linha = { id: PLACE_ID, name: "Marco Zero" }
  h.updates.length = 0
  h.deletes = 0
  h.filtros.length = 0
})

describe("PATCH /api/trips/[tripId]/places/[placeId]", () => {
  it("200: membro marca o lugar como visitado", async () => {
    logado()

    const resposta = await PATCH(requisicao("PATCH", { visited: true }), contexto())

    expect(resposta.status).toBe(200)
    expect(h.updates).toEqual([{ visited: true }])
  })

  it("200: marcar visitado não apaga a observação (só o campo enviado é gravado)", async () => {
    logado()

    await PATCH(requisicao("PATCH", { visited: false }), contexto())

    expect(h.updates[0]).not.toHaveProperty("notes")
  })

  it("401: sem sessão não chega a atualizar", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await PATCH(requisicao("PATCH", { visited: true }), contexto())

    expect(resposta.status).toBe(401)
    expect(h.updates).toHaveLength(0)
  })

  it("403: quem não participa da viagem não altera", async () => {
    naoMembro()

    const resposta = await PATCH(requisicao("PATCH", { visited: true }), contexto())

    expect(resposta.status).toBe(403)
    expect(h.updates).toHaveLength(0)
  })

  it("400: visited que não é booleano", async () => {
    logado()

    const resposta = await PATCH(requisicao("PATCH", { visited: "sim" }), contexto())

    expect(resposta.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("400: corpo vazio", async () => {
    logado()

    const resposta = await PATCH(requisicao("PATCH", {}), contexto())

    expect(resposta.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("404: lugar que não pertence a esta viagem", async () => {
    logado()
    h.linha = null

    const resposta = await PATCH(requisicao("PATCH", { visited: true }), contexto())

    expect(resposta.status).toBe(404)
  })

  it("filtra por trip_id e id, e descarta name/trip_id/user_id do corpo (sem mass-assignment)", async () => {
    logado()

    await PATCH(
      requisicao("PATCH", {
        visited: true,
        name: "Outro nome",
        trip_id: "outra-viagem",
        user_id: "outra-pessoa",
        id: "id-forjado",
      }),
      contexto(),
    )

    expect(h.filtros).toEqual([
      ["trip_id", TRIP_ID],
      ["id", PLACE_ID],
    ])
    expect(h.updates).toEqual([{ visited: true }])
  })
})

describe("DELETE /api/trips/[tripId]/places/[placeId]", () => {
  it("200: membro exclui o lugar", async () => {
    logado()

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(200)
    expect(h.deletes).toBe(1)
    expect(h.filtros).toEqual([
      ["trip_id", TRIP_ID],
      ["id", PLACE_ID],
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

  it("404: lugar que não pertence a esta viagem", async () => {
    logado()
    h.linha = null

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(404)
  })
})
