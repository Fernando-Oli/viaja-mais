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
  /** Quem participa da viagem além de quem chama; ausente = todo mundo. */
  membros?: string[]
  sharesError?: { message: string } | null
  onInsertShares?: (linhas: Record<string, unknown>[]) => void
  onDelete?: (id: string) => void
}

function fakeSupabase(opts: FakeOpts = {}) {
  const {
    user = { id: "user-1" },
    papel = "member",
    insertError = null,
    expenses = [],
    onInsert,
    membros,
    sharesError = null,
    onInsertShares,
    onDelete,
  } = opts
  return {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(tabela: string) {
      if (tabela === "trip_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: (_coluna: string, userId: string) => ({
                maybeSingle: async () => {
                  const participa = userId === user?.id ? !!papel : !membros || membros.includes(userId)
                  return { data: participa ? { role: userId === user?.id ? papel : "member" } : null, error: null }
                },
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
          delete: () => ({
            eq: async (_coluna: string, id: string) => {
              onDelete?.(id)
              return { error: null }
            },
          }),
        }
      }
      if (tabela === "expense_shares") {
        return {
          insert: (linhas: Record<string, unknown>[]) => {
            onInsertShares?.(linhas)
            return {
              select: async () => ({ data: sharesError ? null : linhas, error: sharesError }),
            }
          },
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

/**
 * Rateio gravado junto da despesa. As partes são recalculadas no servidor; a
 * soma tem de fechar com o total e todo participante tem de ser membro.
 *
 * @RF06.9 @RF06.10
 */
describe("POST /api/trips/[tripId]/expenses — rateio", () => {
  const A = "11111111-1111-4111-8111-111111111111"
  const B = "22222222-2222-4222-8222-222222222222"
  const C = "33333333-3333-4333-8333-333333333333"
  const ESTRANHO = "44444444-4444-4444-8444-444444444444"

  const comRateio = (rateio: unknown, amount = "10.00") => ({ ...corpoValido, amount, rateio })
  const valoresDe = (linhas?: Record<string, unknown>[]) => linhas?.map((l) => l.amount)

  it("divisão igual: R$ 10,00 entre 3 grava 3,34 + 3,33 + 3,33 e split_type equal", async () => {
    let despesa: Record<string, unknown> | undefined
    let partes: Record<string, unknown>[] | undefined
    usarFake({ user: { id: A }, onInsert: (p) => (despesa = p), onInsertShares: (l) => (partes = l) })

    const res = await POST(
      requisicao(comRateio({ tipo: "equal", participantes: [{ user_id: A }, { user_id: B }, { user_id: C }] })),
      { params },
    )

    expect(res.status).toBe(200)
    expect(despesa).toMatchObject({ amount: 10, split_type: "equal" })
    expect(partes).toEqual([
      { expense_id: "exp-1", user_id: A, amount: 3.34, weight: null },
      { expense_id: "exp-1", user_id: B, amount: 3.33, weight: null },
      { expense_id: "exp-1", user_id: C, amount: 3.33, weight: null },
    ])
    const corpo = await res.json()
    expect(corpo.shares).toHaveLength(3)
  })

  // @RNF08.1 regressão da Issue #36: o centavo seguia a ordem do formulário.
  it("participantes fora de ordem: grava o centavo para o menor user_id, como na edição", async () => {
    const gravadas: Record<string, unknown>[][] = []
    usarFake({ user: { id: A }, onInsertShares: (l) => gravadas.push(l) })

    for (const ordem of [[C, A, B], [B, C, A], [A, B, C]]) {
      const res = await POST(
        requisicao(comRateio({ tipo: "equal", participantes: ordem.map((user_id) => ({ user_id })) })),
        { params },
      )
      expect(res.status).toBe(200)
    }

    // A lista sai na ordem enviada; o valor de cada um, não.
    expect(gravadas[0].map((l) => l.user_id)).toEqual([C, A, B])
    for (const linhas of gravadas) {
      expect(Object.fromEntries(linhas.map((l) => [l.user_id, l.amount]))).toEqual({ [A]: 3.34, [B]: 3.33, [C]: 3.33 })
    }
  })

  it("divisão por peso: grava o peso e as partes proporcionais", async () => {
    let partes: Record<string, unknown>[] | undefined
    usarFake({ user: { id: A }, onInsertShares: (l) => (partes = l) })

    const res = await POST(
      requisicao(
        comRateio(
          {
            tipo: "weight",
            participantes: [
              { user_id: A, peso: "2" },
              { user_id: B, peso: "1" },
              { user_id: C, peso: "1" },
            ],
          },
          "100",
        ),
      ),
      { params },
    )

    expect(res.status).toBe(200)
    expect(valoresDe(partes)).toEqual([50, 25, 25])
    expect(partes?.map((l) => l.weight)).toEqual([2, 1, 1])
  })

  it("divisão por valor exato que fecha: grava os valores informados", async () => {
    let partes: Record<string, unknown>[] | undefined
    usarFake({ user: { id: A }, onInsertShares: (l) => (partes = l) })

    const res = await POST(
      requisicao(
        comRateio({
          tipo: "exact",
          participantes: [
            { user_id: A, valor: "7.50" },
            { user_id: B, valor: "2.50" },
          ],
        }),
      ),
      { params },
    )

    expect(res.status).toBe(200)
    expect(valoresDe(partes)).toEqual([7.5, 2.5])
  })

  it("valor exato que não fecha: 400 e nada é gravado", async () => {
    let gravou = false
    usarFake({ user: { id: A }, onInsert: () => (gravou = true), onInsertShares: () => (gravou = true) })

    const res = await POST(
      requisicao(
        comRateio({
          tipo: "exact",
          participantes: [
            { user_id: A, valor: "5" },
            { user_id: B, valor: "3" },
          ],
        }),
      ),
      { params },
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/não fecha: faltam R\$\s2,00/)
    expect(gravou, "rateio inválido não pode deixar despesa gravada").toBe(false)
  })

  it("participante que não é membro da viagem: 400 e nada é gravado", async () => {
    let gravou = false
    usarFake({ user: { id: A }, membros: [B], onInsert: () => (gravou = true) })

    const res = await POST(
      requisicao(comRateio({ tipo: "equal", participantes: [{ user_id: A }, { user_id: ESTRANHO }] })),
      { params },
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Todo participante do rateio precisa ser membro da viagem")
    expect(gravou).toBe(false)
  })

  it("peso inválido: 400 pelo schema", async () => {
    usarFake({ user: { id: A } })
    const res = await POST(
      requisicao(comRateio({ tipo: "weight", participantes: [{ user_id: A, peso: 0 }] })),
      { params },
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("Dados inválidos")
  })

  it("401 sem sessão e 403 para quem não participa, mesmo com rateio válido", async () => {
    const corpo = comRateio({ tipo: "equal", participantes: [{ user_id: A }] })

    usarFake({ user: null })
    expect((await POST(requisicao(corpo), { params })).status).toBe(401)

    usarFake({ user: { id: A }, papel: null })
    expect((await POST(requisicao(corpo), { params })).status).toBe(403)
  })

  it("se gravar as partes falhar, desfaz a despesa e não vaza a mensagem do banco", async () => {
    let removida: string | undefined
    usarFake({
      user: { id: A },
      sharesError: { message: "a soma das partes (9.99) não fecha com o valor da despesa (10.00)" },
      onDelete: (id) => (removida = id),
    })

    const res = await POST(requisicao(comRateio({ tipo: "equal", participantes: [{ user_id: A }] })), { params })
    const corpo = await res.json()

    expect(res.status).toBe(400)
    expect(corpo.error).toBe("Não foi possível salvar o rateio da despesa")
    expect(JSON.stringify(corpo)).not.toContain("9.99")
    expect(removida).toBe("exp-1")
  })

  it("sem rateio, mantém o comportamento anterior: não grava partes nem split_type", async () => {
    let despesa: Record<string, unknown> | undefined
    let gravouPartes = false
    usarFake({ user: { id: A }, onInsert: (p) => (despesa = p), onInsertShares: () => (gravouPartes = true) })

    const res = await POST(requisicao(corpoValido), { params })

    expect(res.status).toBe(200)
    expect(despesa).not.toHaveProperty("split_type")
    expect(gravouPartes).toBe(false)
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
