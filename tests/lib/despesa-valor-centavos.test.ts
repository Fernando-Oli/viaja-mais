import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Regressão (S14-Ab-congelamento-ab): o valor da despesa aceitava mais de duas
 * casas decimais e a rota o arredondava em silêncio com `Math.round(amount * 100)`.
 *
 * Efeito: `0.004` passava no `positive()` do schema e era gravado como R$ 0,00 —
 * uma despesa de valor zero, que o próprio schema diz recusar ("o valor deve ser
 * maior que zero"), já que `expenses.amount` não tem CHECK no banco. E `10.005`
 * virava R$ 10,00 sem aviso: o lançamento gravado não era o pedido.
 *
 * O comportamento correto é o mesmo do valor exato do rateio e do pagamento do
 * acerto: até duas casas, ou 400 sem nenhuma escrita.
 *
 * @RF06.1 adicionar despesa com título, valor, categoria e data
 * @RF06.2 editar despesa
 */

import { createClient } from "@/lib/supabase/server"
import { POST } from "@/app/api/trips/[tripId]/expenses/route"
import { atualizarDespesaSchema, criarDespesaSchema } from "@/lib/schemas/despesa"

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

const TRIP = "trip-abc"
const corpo = { title: "Café", currency: "BRL", category: "food", date: "2026-11-20" }

/** Cliente falso mínimo: quem chama é membro; o insert em `expenses` é registrado. */
function usarFake(inserts: Record<string, unknown>[]) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from(tabela: string) {
      if (tabela === "trip_members") {
        return {
          select: () => ({
            eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { role: "member" }, error: null }) }) }),
          }),
        }
      }
      if (tabela === "expenses") {
        return {
          insert: (payload: Record<string, unknown>) => {
            inserts.push(payload)
            return { select: () => ({ single: async () => ({ data: { id: "exp-1", ...payload }, error: null }) }) }
          },
        }
      }
      throw new Error(`tabela inesperada no fake: ${tabela}`)
    },
  } as never)
}

function criar(amount: unknown) {
  return POST(
    new Request(`http://test/api/trips/${TRIP}/expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...corpo, amount }),
    }),
    { params: Promise.resolve({ tripId: TRIP }) },
  )
}

beforeEach(() => vi.clearAllMocks())

describe("POST /api/trips/[tripId]/expenses — valor com mais de duas casas", () => {
  it("0.004 responde 400 e não grava uma despesa de R$ 0,00", async () => {
    const inserts: Record<string, unknown>[] = []
    usarFake(inserts)

    const res = await criar(0.004)

    expect(res.status).toBe(400)
    expect(inserts, "nenhuma despesa pode ser gravada").toEqual([])
  })

  it("10.005 responde 400 em vez de gravar outro valor", async () => {
    const inserts: Record<string, unknown>[] = []
    usarFake(inserts)

    const res = await criar("10.005")

    expect(res.status).toBe(400)
    expect(inserts).toEqual([])
  })

  it("valor com até duas casas continua gravado como enviado", async () => {
    const inserts: Record<string, unknown>[] = []
    usarFake(inserts)

    const res = await criar("10.05")

    expect(res.status).toBe(200)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({ amount: 10.05 })
  })
})

describe("schemas de despesa — mesma regra na criação e na edição", () => {
  it.each([0.004, "0.004", 10.005, "10.999"])("recusa %s", (amount) => {
    expect(criarDespesaSchema.safeParse({ ...corpo, amount }).success).toBe(false)
    expect(atualizarDespesaSchema.safeParse({ amount }).success).toBe(false)
  })

  it.each([0.01, "0.1", 10, "80", 99_999_999.99])("aceita %s", (amount) => {
    expect(criarDespesaSchema.safeParse({ ...corpo, amount }).success).toBe(true)
    expect(atualizarDespesaSchema.safeParse({ amount }).success).toBe(true)
  })
})
