import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF06.2 editar despesa · @RF06.3 excluir despesa
 *
 * Mesma técnica de `tests/api/booking-item-route.test.ts`: cliente falso
 * ramificado por tabela, com os filtros `.eq()` registrados para provar que
 * toda operação escopa por `trip_id` **e** `id`.
 *
 * Diferença do molde de reservas: aqui existe uma segunda porta de autorização
 * além de `exigirMembro` — `exigirAutorOuDono`, verificada com os testes
 * "membro que não é autor nem dono".
 */

type Linha = Record<string, unknown> | null

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  papel: { data: { role: "member" } as { role: string } | null, error: null as { message: string } | null },
  // O que o banco "encontra" com os filtros aplicados: null simula despesa de outra viagem.
  linha: { id: "expense-1", title: "Jantar", user_id: "user-1" } as Record<string, unknown> | null,
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

import { GET, PATCH, DELETE } from "@/app/api/trips/[tripId]/expenses/[expenseId]/route"

const TRIP_ID = "11111111-1111-1111-1111-111111111111"
const EXPENSE_ID = "33333333-3333-3333-3333-333333333333"

function requisicao(method: string, body?: unknown) {
  return new Request(`http://localhost/api/trips/${TRIP_ID}/expenses/${EXPENSE_ID}`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

function contexto() {
  return { params: Promise.resolve({ tripId: TRIP_ID, expenseId: EXPENSE_ID }) }
}

// `user-1` é o autor da despesa fake (ver `h.linha`).
const logadoComoAutor = () => h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })

const naoMembro = () => {
  h.getUser.mockResolvedValue({ data: { user: { id: "user-9" } } })
  h.papel = { data: null, error: null }
}

// Membro da viagem, mas nem autor da despesa nem dono da viagem.
const membroQueNaoEAutorNemDono = () => {
  h.getUser.mockResolvedValue({ data: { user: { id: "user-2" } } })
  h.papel = { data: { role: "member" }, error: null }
}

const donoDaViagem = () => {
  h.getUser.mockResolvedValue({ data: { user: { id: "user-owner" } } })
  h.papel = { data: { role: "owner" }, error: null }
}

beforeEach(() => {
  h.getUser.mockReset()
  h.papel = { data: { role: "member" }, error: null }
  h.linha = { id: EXPENSE_ID, title: "Jantar", user_id: "user-1" }
  h.updates.length = 0
  h.deletes = 0
  h.filtros.length = 0
})

describe("PATCH /api/trips/[tripId]/expenses/[expenseId]", () => {
  it("200: autor da despesa edita título e valor", async () => {
    logadoComoAutor()

    const resposta = await PATCH(requisicao("PATCH", { title: "Jantar remarcado", amount: "120" }), contexto())

    expect(resposta.status).toBe(200)
    expect(h.updates).toEqual([expect.objectContaining({ title: "Jantar remarcado", amount: 120 })])
  })

  it("200: dono da viagem edita despesa registrada por outro membro", async () => {
    donoDaViagem()

    const resposta = await PATCH(requisicao("PATCH", { title: "Corrigido pelo dono" }), contexto())

    expect(resposta.status).toBe(200)
    expect(h.updates).toEqual([expect.objectContaining({ title: "Corrigido pelo dono" })])
  })

  it("401: sem sessão não chega a atualizar", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await PATCH(requisicao("PATCH", { title: "Jantar remarcado" }), contexto())

    expect(resposta.status).toBe(401)
    expect(h.updates).toHaveLength(0)
  })

  it("403: quem não participa da viagem não altera", async () => {
    naoMembro()

    const resposta = await PATCH(requisicao("PATCH", { title: "Jantar remarcado" }), contexto())

    expect(resposta.status).toBe(403)
    expect(h.updates).toHaveLength(0)
  })

  it("403: membro da viagem que não registrou a despesa e não é dono não altera", async () => {
    membroQueNaoEAutorNemDono()

    const resposta = await PATCH(requisicao("PATCH", { title: "Jantar remarcado" }), contexto())

    expect(resposta.status).toBe(403)
    expect(h.updates).toHaveLength(0)
  })

  it("400: payload inválido (valor zero)", async () => {
    logadoComoAutor()

    const resposta = await PATCH(requisicao("PATCH", { amount: "0" }), contexto())

    expect(resposta.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("400: categoria fora da lista permitida", async () => {
    logadoComoAutor()

    const resposta = await PATCH(requisicao("PATCH", { category: "cassino" }), contexto())

    expect(resposta.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("400: corpo vazio", async () => {
    logadoComoAutor()

    const resposta = await PATCH(requisicao("PATCH", {}), contexto())

    expect(resposta.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("404: despesa que não pertence a esta viagem", async () => {
    logadoComoAutor()
    h.linha = null

    const resposta = await PATCH(requisicao("PATCH", { title: "Jantar remarcado" }), contexto())

    expect(resposta.status).toBe(404)
  })

  it("filtra por trip_id e id, e descarta trip_id/user_id/id do corpo (sem mass-assignment)", async () => {
    logadoComoAutor()

    await PATCH(
      requisicao("PATCH", { title: "Nova", trip_id: "outra-viagem", user_id: "outra-pessoa", id: "id-forjado" }),
      contexto(),
    )

    // Duas consultas passam pelo filtro: a leitura em `buscarDespesa` (para checar
    // autoria) e o `update` propriamente dito — cada uma escopada por trip_id e id.
    expect(h.filtros).toEqual([
      ["trip_id", TRIP_ID],
      ["id", EXPENSE_ID],
      ["trip_id", TRIP_ID],
      ["id", EXPENSE_ID],
    ])
    expect(h.updates[0]).not.toHaveProperty("trip_id")
    expect(h.updates[0]).not.toHaveProperty("user_id")
    expect(h.updates[0]).not.toHaveProperty("id")
  })
})

describe("DELETE /api/trips/[tripId]/expenses/[expenseId]", () => {
  it("200: autor exclui a própria despesa", async () => {
    logadoComoAutor()

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(200)
    expect(h.deletes).toBe(1)
    // Idem ao PATCH: leitura em `buscarDespesa` e o `delete`, cada um escopado.
    expect(h.filtros).toEqual([
      ["trip_id", TRIP_ID],
      ["id", EXPENSE_ID],
      ["trip_id", TRIP_ID],
      ["id", EXPENSE_ID],
    ])
  })

  it("200: dono da viagem exclui despesa registrada por outro membro", async () => {
    donoDaViagem()

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(200)
    expect(h.deletes).toBe(1)
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

  it("403: membro da viagem que não registrou a despesa e não é dono não exclui", async () => {
    membroQueNaoEAutorNemDono()

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(403)
    expect(h.deletes).toBe(0)
  })

  it("404: despesa que não pertence a esta viagem", async () => {
    logadoComoAutor()
    h.linha = null

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(404)
  })
})

describe("GET /api/trips/[tripId]/expenses/[expenseId]", () => {
  it("200: autor carrega a própria despesa para editar", async () => {
    logadoComoAutor()

    const resposta = await GET(requisicao("GET"), contexto())

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ expense: { id: EXPENSE_ID, title: "Jantar", user_id: "user-1" } })
  })

  it("403: quem não participa não carrega", async () => {
    naoMembro()

    const resposta = await GET(requisicao("GET"), contexto())

    expect(resposta.status).toBe(403)
  })

  it("403: membro da viagem que não registrou a despesa e não é dono não carrega", async () => {
    membroQueNaoEAutorNemDono()

    const resposta = await GET(requisicao("GET"), contexto())

    expect(resposta.status).toBe(403)
  })

  it("404: despesa que não pertence a esta viagem", async () => {
    logadoComoAutor()
    h.linha = null

    const resposta = await GET(requisicao("GET"), contexto())

    expect(resposta.status).toBe(404)
  })
})
