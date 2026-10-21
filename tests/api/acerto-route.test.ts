import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF06.11 saldo por membro · @RF06.13 transferências sugeridas
 *
 * `GET /api/trips/[tripId]/acerto`. Mesma técnica de
 * `tests/api/expense-item-route.test.ts`: cliente falso ramificado por tabela,
 * anotando as consultas para provar que nada é lido antes da autorização e que
 * toda leitura escopa pela viagem da URL.
 */

type Resultado = { data: unknown; error: { message: string } | null }

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  papel: { data: { role: "member" } as { role: string } | null, error: null as { message: string } | null },
  despesas: { data: [], error: null } as Resultado,
  partes: { data: [], error: null } as Resultado,
  membros: { data: [], error: null } as Resultado,
  consultas: [] as { tabela: string; colunas: string; filtros: [string, string][] }[],
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from(tabela: string) {
      return {
        select(colunas: string) {
          const consulta = { tabela, colunas, filtros: [] as [string, string][] }
          h.consultas.push(consulta)

          // Checagem de papel de `exigirMembro`: `.eq().eq().maybeSingle()`.
          if (tabela === "trip_members" && colunas === "role") {
            return {
              eq: () => ({ eq: () => ({ maybeSingle: async () => h.papel }) }),
            }
          }

          const resultado =
            tabela === "expenses" ? h.despesas : tabela === "expense_shares" ? h.partes : h.membros
          return {
            eq(coluna: string, valor: string) {
              consulta.filtros.push([coluna, valor])
              return Promise.resolve(resultado)
            },
          }
        },
      }
    },
  }),
}))

import { GET } from "@/app/api/trips/[tripId]/acerto/route"

const TRIP_ID = "11111111-1111-4111-8111-111111111111"
const ANA = "aaaaaaaa-0000-4000-8000-000000000001"
const BRUNO = "bbbbbbbb-0000-4000-8000-000000000002"
const CARLA = "cccccccc-0000-4000-8000-000000000003"

const MEMBROS = [
  { user_id: ANA, role: "owner" },
  { user_id: BRUNO, role: "member" },
  { user_id: CARLA, role: "member" },
]

async function chamar(tripId = TRIP_ID) {
  const resposta = await GET(new Request(`http://localhost/api/trips/${tripId}/acerto`), {
    params: Promise.resolve({ tripId }),
  })
  return { status: resposta.status, corpo: await resposta.json() }
}

const logado = (id = BRUNO) => h.getUser.mockResolvedValue({ data: { user: { id } } })

/** Hotel 90 pago pela Ana entre os três; Jantar 30 pago pelo Bruno entre Ana e Bruno. */
function cenarioComDespesas() {
  h.despesas = {
    data: [
      { id: "hotel", paid_by: ANA, currency: "BRL" },
      { id: "jantar", paid_by: BRUNO, currency: "BRL" },
    ],
    error: null,
  }
  h.partes = {
    data: [
      { expense_id: "hotel", user_id: ANA, amount: 30, settled_at: null, expenses: { trip_id: TRIP_ID } },
      { expense_id: "hotel", user_id: BRUNO, amount: 30, settled_at: null, expenses: { trip_id: TRIP_ID } },
      { expense_id: "hotel", user_id: CARLA, amount: 30, settled_at: null, expenses: { trip_id: TRIP_ID } },
      { expense_id: "jantar", user_id: ANA, amount: 15, settled_at: null, expenses: { trip_id: TRIP_ID } },
      { expense_id: "jantar", user_id: BRUNO, amount: 15, settled_at: null, expenses: { trip_id: TRIP_ID } },
    ],
    error: null,
  }
}

type SaldoResposta = { userId: string; rotulo: string; papel: string; valor: number }
type TransferenciaResposta = { de: { userId: string; rotulo: string }; para: { userId: string; rotulo: string }; valor: number }

const saldos = (corpo: { grupos: { saldos: SaldoResposta[] }[] }) =>
  Object.fromEntries(corpo.grupos[0].saldos.map((s) => [s.userId, s.valor]))

beforeEach(() => {
  h.getUser.mockReset()
  h.papel = { data: { role: "member" }, error: null }
  h.despesas = { data: [], error: null }
  h.partes = { data: [], error: null }
  h.membros = { data: MEMBROS, error: null }
  h.consultas.length = 0
})

describe("GET /api/trips/[tripId]/acerto — 200", () => {
  it("viagem com despesas: saldo de cada membro e rótulos de quem consulta", async () => {
    logado(BRUNO)
    cenarioComDespesas()

    const { status, corpo } = await chamar()

    expect(status).toBe(200)
    expect(saldos(corpo)).toEqual({ [ANA]: 45, [BRUNO]: -15, [CARLA]: -30 })
    expect(corpo.grupos[0].moeda).toBe("BRL")
    expect(corpo.grupos[0].saldos.map((s: SaldoResposta) => s.rotulo)).toEqual([
      "Você",
      "Participante 2",
      "Participante 3",
    ])
    expect(corpo).toMatchObject({ totalDespesas: 2, despesasSemRateio: 0, tudoAcertado: false })
  })

  it("transferências sugeridas no formato { de, para, valor } e quitando todos os saldos", async () => {
    logado(BRUNO)
    cenarioComDespesas()

    const { corpo } = await chamar()
    const transferencias = corpo.grupos[0].transferencias as TransferenciaResposta[]

    expect(transferencias.map((t) => [t.de.userId, t.para.userId, t.valor])).toEqual([
      [CARLA, ANA, 30],
      [BRUNO, ANA, 15],
    ])
    expect(transferencias[1].de.rotulo).toBe("Você")

    const resto = saldos(corpo)
    for (const t of transferencias) {
      resto[t.de.userId] += t.valor
      resto[t.para.userId] -= t.valor
    }
    expect(Object.values(resto).every((v) => Math.round(v * 100) === 0)).toBe(true)
  })

  it("viagem sem despesas: todos os membros em zero e nenhuma transferência", async () => {
    logado()

    const { status, corpo } = await chamar()

    expect(status).toBe(200)
    expect(corpo.totalDespesas).toBe(0)
    expect(corpo.grupos[0].saldos).toHaveLength(3)
    expect(corpo.grupos[0].saldos.every((s: SaldoResposta) => s.valor === 0)).toBe(true)
    expect(corpo.grupos[0].transferencias).toEqual([])
  })

  it("saldos zerados: cada um pagou a sua parte e ninguém deve nada", async () => {
    logado()
    h.despesas = {
      data: [ANA, BRUNO, CARLA].map((id, i) => ({ id: `d${i}`, paid_by: id, currency: "BRL" })),
      error: null,
    }
    h.partes = {
      data: [0, 1, 2].flatMap((i) =>
        [ANA, BRUNO, CARLA].map((user_id) => ({ expense_id: `d${i}`, user_id, amount: 10, settled_at: null })),
      ),
      error: null,
    }

    const { status, corpo } = await chamar()

    expect(status).toBe(200)
    expect(corpo.grupos[0].saldos.every((s: SaldoResposta) => s.valor === 0)).toBe(true)
    expect(corpo.grupos[0].transferencias).toEqual([])
    expect(corpo.tudoAcertado).toBe(true)
  })

  it("parte com settled_at não entra no cálculo", async () => {
    logado()
    cenarioComDespesas()
    const partes = h.partes.data as { user_id: string; expense_id: string; settled_at: string | null }[]
    partes.find((p) => p.expense_id === "hotel" && p.user_id === CARLA)!.settled_at = "2026-10-20T12:00:00Z"

    const { corpo } = await chamar()

    expect(saldos(corpo)).toEqual({ [ANA]: 15, [BRUNO]: -15, [CARLA]: 0 })
    expect(corpo.grupos[0].transferencias).toHaveLength(1)
  })

  it("toda leitura escopa pela viagem da URL", async () => {
    logado()
    cenarioComDespesas()

    await chamar()

    const filtros = Object.fromEntries(h.consultas.filter((c) => c.colunas !== "role").map((c) => [c.tabela, c.filtros]))
    expect(filtros.expenses).toEqual([["trip_id", TRIP_ID]])
    expect(filtros.expense_shares).toEqual([["expenses.trip_id", TRIP_ID]])
    expect(filtros.trip_members).toEqual([["trip_id", TRIP_ID]])
  })
})

describe("GET /api/trips/[tripId]/acerto — erros", () => {
  it("401 sem sessão: nada é consultado", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const { status, corpo } = await chamar()

    expect(status).toBe(401)
    expect(corpo).toEqual({ error: "Não autenticado" })
    expect(h.consultas).toHaveLength(0)
  })

  it("403 para quem não participa da viagem, sem nenhum dado financeiro", async () => {
    logado("99999999-0000-4000-8000-000000000009")
    h.papel = { data: null, error: null }
    cenarioComDespesas()

    const { status, corpo } = await chamar()

    expect(status).toBe(403)
    expect(corpo).toEqual({ error: "Sem permissão para acessar esta viagem" })
    expect(h.consultas.map((c) => c.tabela)).toEqual(["trip_members"])
  })

  it("400 para tripId que não é UUID, antes de qualquer consulta", async () => {
    logado()

    const { status, corpo } = await chamar("abc")

    expect(status).toBe(400)
    expect(corpo.error).toBe("Dados inválidos")
    expect(h.consultas).toHaveLength(0)
  })

  it("500 genérico quando o banco falha, sem vazar a mensagem interna", async () => {
    logado()
    h.partes = { data: null, error: { message: 'relation "expense_shares" column secreta does not exist' } }

    const { status, corpo } = await chamar()

    expect(status).toBe(500)
    expect(corpo).toEqual({ error: "Erro interno do servidor" })
    expect(JSON.stringify(corpo)).not.toContain("secreta")
  })

  it("500 genérico quando a checagem de participação falha", async () => {
    logado()
    h.papel = { data: null, error: { message: "permission denied for table trip_members" } }

    const { status, corpo } = await chamar()

    expect(status).toBe(500)
    expect(corpo).toEqual({ error: "Erro interno do servidor" })
  })
})
