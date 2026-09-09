import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * Testes de contrato do route handler de despesas.
 *
 * Nível: handler. Usam um cliente Supabase falso com a mesma forma encadeada do
 * SDK — a mesma técnica de `tests/lib/authz-trip.test.ts` —, então a autorização
 * real (`exigirMembro` → `papelNaViagem`) roda de verdade contra o falso.
 *
 * O que ISTO prova: os quatro caminhos do handler (200/401/403/400) e que
 * `user_id`/`trip_id` nunca vêm do corpo. O que NÃO prova: isolamento por RLS —
 * isso exige `tests/rls/` com Postgres real e as migrations do T0, que ainda não
 * estão na main. Ver docs/plans/S02-Ab-despesas-via-api.md, bloco 6.
 *
 * @RF06.1
 */

import { createClient } from "@/lib/supabase/server"
import { GET, POST } from "@/app/api/trips/[tripId]/expenses/route"

// `vi.mock` é içado para o topo do módulo pelo vitest, então a ordem aqui é só visual.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }))

const TRIP = "trip-abc"

const corpoValido = {
  title: "Jantar",
  amount: "80",
  currency: "BRL",
  category: "food",
  date: "2026-09-08",
  payment_method: null,
  notes: null,
}

type FakeOpts = {
  user?: { id: string } | null
  papel?: string | null
  insertError?: { message: string } | null
  expenses?: unknown[]
  onInsert?: (payload: Record<string, unknown>) => void
}

function fakeSupabase(opts: FakeOpts = {}) {
  const { user = { id: "user-1" }, papel = "member", insertError = null, expenses = [], onInsert } = opts
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(tabela: string) {
      if (tabela === "trip_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: papel ? { role: papel } : null, error: null }),
              }),
            }),
          }),
        }
      }
      if (tabela === "expenses") {
        return {
          insert: (payload: Record<string, unknown>) => {
            onInsert?.(payload)
            return {
              select: () => ({
                single: async () => ({
                  data: insertError ? null : { id: "exp-1", ...payload },
                  error: insertError,
                }),
              }),
            }
          },
          select: () => ({
            eq: () => ({ order: async () => ({ data: expenses, error: null }) }),
          }),
        }
      }
      throw new Error(`tabela inesperada no fake: ${tabela}`)
    },
  }
}

function usarFake(opts: FakeOpts = {}) {
  vi.mocked(createClient).mockResolvedValue(fakeSupabase(opts) as never)
}

function requisicao(corpo: unknown) {
  return new Request(`http://test/api/trips/${TRIP}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  })
}

const params = Promise.resolve({ tripId: TRIP })

beforeEach(() => vi.clearAllMocks())

describe("POST /api/trips/[tripId]/expenses", () => {
  it("cria a despesa e responde 200 quando quem chama é membro da viagem", async () => {
    let capturado: Record<string, unknown> | undefined
    usarFake({ papel: "member", onInsert: (p) => (capturado = p) })

    const res = await POST(requisicao(corpoValido), { params })

    expect(res.status).toBe(200)
    expect(capturado).toMatchObject({ title: "Jantar", amount: 80, category: "food", trip_id: TRIP, user_id: "user-1" })
  })

  it("responde 401 quando não há sessão", async () => {
    usarFake({ user: null })
    const res = await POST(requisicao(corpoValido), { params })
    expect(res.status).toBe(401)
  })

  it("responde 403 para usuário autenticado que não participa da viagem", async () => {
    let chamou = false
    usarFake({ papel: null, onInsert: () => (chamou = true) })

    const res = await POST(requisicao(corpoValido), { params })

    expect(res.status).toBe(403)
    expect(chamou, "não pode nem tentar inserir").toBe(false)
  })

  it("responde 400 para payload inválido (valor zero)", async () => {
    usarFake({ papel: "member" })
    const res = await POST(requisicao({ ...corpoValido, amount: "0" }), { params })
    expect(res.status).toBe(400)
  })

  it("ignora user_id e trip_id enviados no corpo — usa a sessão e a URL", async () => {
    let capturado: Record<string, unknown> | undefined
    usarFake({ papel: "owner", onInsert: (p) => (capturado = p) })

    await POST(
      requisicao({
        ...corpoValido,
        user_id: "hacker",
        trip_id: "outra-viagem",
        id: "forjado",
      }),
      { params },
    )

    expect(capturado?.user_id).toBe("user-1")
    expect(capturado?.trip_id).toBe(TRIP)
    expect(capturado).not.toHaveProperty("id")
  })

  it("converte erro do Postgres em resposta sem vazar a mensagem crua", async () => {
    const cru = 'null value in column "amount" violates not-null constraint'
    usarFake({ papel: "member", insertError: { message: cru } })

    const res = await POST(requisicao(corpoValido), { params })
    const corpo = await res.json()

    expect(res.status).toBe(400)
    expect(JSON.stringify(corpo)).not.toContain("violates")
    expect(JSON.stringify(corpo)).not.toContain("column")
    expect(corpo.error).toBe("Não foi possível salvar a despesa")
  })
})

describe("GET /api/trips/[tripId]/expenses", () => {
  it("responde 401 quando não há sessão", async () => {
    usarFake({ user: null })
    const res = await GET(new Request(`http://test/api/trips/${TRIP}/expenses`), { params })
    expect(res.status).toBe(401)
  })

  it("responde 403 para quem não participa da viagem", async () => {
    usarFake({ papel: null })
    const res = await GET(new Request(`http://test/api/trips/${TRIP}/expenses`), { params })
    expect(res.status).toBe(403)
  })

  it("lista as despesas para um membro", async () => {
    usarFake({ papel: "member", expenses: [{ id: "exp-1", title: "Jantar" }] })
    const res = await GET(new Request(`http://test/api/trips/${TRIP}/expenses`), { params })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ expenses: [{ id: "exp-1", title: "Jantar" }] })
  })
})
