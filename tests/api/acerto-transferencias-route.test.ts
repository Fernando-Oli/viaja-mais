import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF06.13 registrar como paga uma transferência do acerto
 * @RNF02.9 settlements graváveis só por membros, e só em nome próprio
 *
 * `POST /api/trips/[tripId]/acerto/transferencias`. Mesma técnica de
 * `tests/api/acerto-route.test.ts`: cliente falso ramificado por tabela,
 * anotando consultas e escritas para provar que nada é gravado antes da
 * autorização e da conferência de saldo, e que o `insert` leva só os campos
 * do contrato.
 */

type Resultado = { data: unknown; error: { message: string; code?: string } | null }

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  papel: { data: { role: "member" } as { role: string } | null, error: null as { message: string } | null },
  despesas: { data: [], error: null } as Resultado,
  partes: { data: [], error: null } as Resultado,
  membros: { data: [], error: null } as Resultado,
  pagamentos: { data: [], error: null } as Resultado,
  /** Resposta da busca por chave de idempotência, em ordem de chamada. */
  porChave: [] as Resultado[],
  insercao: { data: null, error: null } as Resultado,
  consultas: [] as { tabela: string; colunas: string }[],
  inseridos: [] as Record<string, unknown>[],
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from(tabela: string) {
      return {
        select(colunas: string) {
          h.consultas.push({ tabela, colunas })

          if (tabela === "trip_members" && colunas === "role") {
            return { eq: () => ({ eq: () => ({ maybeSingle: async () => h.papel }) }) }
          }

          const resultado =
            tabela === "expenses"
              ? h.despesas
              : tabela === "expense_shares"
                ? h.partes
                : tabela === "settlements"
                  ? h.pagamentos
                  : h.membros

          // Leitura do acerto: `.eq()` e pronto (thenable). Busca por chave:
          // `.eq().eq().eq().maybeSingle()`.
          const cadeia = {
            eq: () => cadeia,
            maybeSingle: async () => h.porChave.shift() ?? { data: null, error: null },
            then: (ok: (r: Resultado) => unknown, erro?: (e: unknown) => unknown) =>
              Promise.resolve(resultado).then(ok, erro),
          }
          return cadeia
        },
        insert(linha: Record<string, unknown>) {
          h.inseridos.push(linha)
          return { select: () => ({ single: async () => h.insercao }) }
        },
      }
    },
  }),
}))

import { POST } from "@/app/api/trips/[tripId]/acerto/transferencias/route"

const TRIP_ID = "11111111-1111-4111-8111-111111111111"
const ANA = "aaaaaaaa-0000-4000-8000-000000000001"
const BRUNO = "bbbbbbbb-0000-4000-8000-000000000002"
const CARLA = "cccccccc-0000-4000-8000-000000000003"
const CHAVE = "99999999-0000-4000-8000-000000000009"

const MEMBROS = [
  { user_id: ANA, role: "owner" },
  { user_id: BRUNO, role: "member" },
  { user_id: CARLA, role: "member" },
]

/** Hotel 90 (Ana, entre os três) e Jantar 30 (Bruno, entre Ana e Bruno): Ana +45, Bruno −15, Carla −30. */
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
      { expense_id: "hotel", user_id: ANA, amount: 30, settled_at: null },
      { expense_id: "hotel", user_id: BRUNO, amount: 30, settled_at: null },
      { expense_id: "hotel", user_id: CARLA, amount: 30, settled_at: null },
      { expense_id: "jantar", user_id: ANA, amount: 15, settled_at: null },
      { expense_id: "jantar", user_id: BRUNO, amount: 15, settled_at: null },
    ],
    error: null,
  }
}

const corpoValido = (c: Record<string, unknown> = {}) => ({
  de: CARLA,
  para: ANA,
  valor: "30,00",
  moeda: "BRL",
  chave: CHAVE,
  ...c,
})

async function chamar(corpo: unknown = corpoValido(), tripId = TRIP_ID) {
  const resposta = await POST(
    new Request(`http://localhost/api/trips/${tripId}/acerto/transferencias`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    }),
    { params: Promise.resolve({ tripId }) },
  )
  return { status: resposta.status, corpo: await resposta.json() }
}

const logado = (id = CARLA) => h.getUser.mockResolvedValue({ data: { user: { id } } })

const gravado = (c: Record<string, unknown> = {}) => ({
  id: "77777777-0000-4000-8000-000000000007",
  trip_id: TRIP_ID,
  from_user_id: CARLA,
  to_user_id: ANA,
  amount: 30,
  currency: "BRL",
  created_at: "2026-11-11T12:00:00Z",
  ...c,
})

beforeEach(() => {
  h.getUser.mockReset()
  h.papel = { data: { role: "member" }, error: null }
  h.despesas = { data: [], error: null }
  h.partes = { data: [], error: null }
  h.membros = { data: MEMBROS, error: null }
  h.pagamentos = { data: [], error: null }
  h.porChave = []
  h.insercao = { data: gravado(), error: null }
  h.consultas.length = 0
  h.inseridos.length = 0
})

describe("POST /api/trips/[tripId]/acerto/transferencias — sucesso", () => {
  it("201 pagamento total: grava só os campos do contrato, com o pagador da sessão", async () => {
    logado(CARLA)
    cenarioComDespesas()

    const { status, corpo } = await chamar(corpoValido({ trip_id: "outra", from_user_id: BRUNO, id: "x" }))

    expect(status).toBe(201)
    expect(corpo.transferencia).toMatchObject({ from_user_id: CARLA, to_user_id: ANA, amount: 30 })
    expect(h.inseridos).toEqual([
      {
        trip_id: TRIP_ID,
        from_user_id: CARLA,
        to_user_id: ANA,
        amount: 30,
        currency: "BRL",
        idempotency_key: CHAVE,
      },
    ])
  })

  it("201 pagamento parcial: valor menor que a dívida, convertido sem erro de float", async () => {
    logado(CARLA)
    cenarioComDespesas()
    h.insercao = { data: gravado({ amount: 10.1 }), error: null }

    const { status } = await chamar(corpoValido({ valor: "10,10" }))

    expect(status).toBe(201)
    expect(h.inseridos[0].amount).toBe(10.1)
  })

  it("confere contra o saldo que já inclui os pagamentos registrados", async () => {
    logado(CARLA)
    cenarioComDespesas()
    h.pagamentos = {
      data: [{ from_user_id: CARLA, to_user_id: ANA, amount: "20.00", currency: "BRL" }],
      error: null,
    }

    // Carla ainda deve 10: 10 passa, 10,01 não.
    expect((await chamar(corpoValido({ valor: "10,00" }))).status).toBe(201)
    h.inseridos.length = 0
    const acima = await chamar(corpoValido({ valor: "10,01", chave: "99999999-0000-4000-8000-00000000000a" }))
    expect(acima.status).toBe(422)
    expect(h.inseridos).toHaveLength(0)
  })

  it("200 ao reenviar a mesma chave: devolve o pagamento existente sem gravar outro", async () => {
    logado(CARLA)
    cenarioComDespesas()
    h.porChave = [{ data: gravado(), error: null }]

    const { status, corpo } = await chamar()

    expect(status).toBe(200)
    expect(corpo.transferencia.id).toBe(gravado().id)
    expect(h.inseridos).toHaveLength(0)
  })

  it("200 quando dois envios com a mesma chave chegam juntos e o unique decide", async () => {
    logado(CARLA)
    cenarioComDespesas()
    h.porChave = [{ data: null, error: null }, { data: gravado(), error: null }]
    h.insercao = { data: null, error: { message: "duplicate key value", code: "23505" } }

    const { status, corpo } = await chamar()

    expect(status).toBe(200)
    expect(corpo.transferencia.id).toBe(gravado().id)
  })

  it("409 se o unique recusou e o registro não é visível", async () => {
    logado(CARLA)
    cenarioComDespesas()
    h.insercao = { data: null, error: { message: "duplicate key value", code: "23505" } }

    const { status, corpo } = await chamar()

    expect(status).toBe(409)
    expect(corpo.error).toBe("Este pagamento já foi enviado")
  })
})

describe("POST /api/trips/[tripId]/acerto/transferencias — autenticação e autorização", () => {
  it("401 sem sessão: nada é consultado nem gravado", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const { status, corpo } = await chamar()

    expect(status).toBe(401)
    expect(corpo).toEqual({ error: "Não autenticado" })
    expect(h.consultas).toHaveLength(0)
    expect(h.inseridos).toHaveLength(0)
  })

  it("403 para quem não participa da viagem, sem ler saldo nem gravar", async () => {
    logado("99999999-0000-4000-8000-000000000099")
    h.papel = { data: null, error: null }
    cenarioComDespesas()

    const { status, corpo } = await chamar(corpoValido({ de: "99999999-0000-4000-8000-000000000099" }))

    expect(status).toBe(403)
    expect(corpo).toEqual({ error: "Sem permissão para acessar esta viagem" })
    expect(h.consultas.map((c) => c.tabela)).toEqual(["trip_members"])
    expect(h.inseridos).toHaveLength(0)
  })

  it("403 ao tentar registrar o pagamento de outra pessoa", async () => {
    logado(ANA) // Ana é a credora, tentando "quitar" a dívida da Carla.
    cenarioComDespesas()

    const { status, corpo } = await chamar(corpoValido({ de: CARLA, para: ANA }))

    expect(status).toBe(403)
    expect(corpo.error).toBe("Só quem pagou pode registrar o próprio pagamento")
    expect(h.inseridos).toHaveLength(0)
  })
})

describe("POST /api/trips/[tripId]/acerto/transferencias — 400", () => {
  it.each([
    ["valor zero", { valor: 0 }],
    ["valor negativo", { valor: "-5" }],
    ["três casas decimais", { valor: "10,005" }],
    ["pagador igual ao recebedor", { para: CARLA }],
    ["recebedor que não é UUID", { para: "ana" }],
    ["moeda inválida", { moeda: "REAL" }],
    ["sem chave de registro", { chave: undefined }],
  ])("%s", async (_nome, c) => {
    logado(CARLA)
    cenarioComDespesas()

    const { status, corpo } = await chamar(corpoValido(c))

    expect(status).toBe(400)
    expect(corpo.error).toBe("Dados inválidos")
    expect(h.inseridos).toHaveLength(0)
  })

  it("corpo que não é JSON", async () => {
    logado(CARLA)
    const { status } = await chamar("isto não é json")
    expect(status).toBe(400)
  })

  it("tripId que não é UUID, antes de qualquer consulta", async () => {
    logado(CARLA)
    const { status } = await chamar(corpoValido(), "abc")
    expect(status).toBe(400)
    expect(h.consultas).toHaveLength(0)
  })
})

describe("POST /api/trips/[tripId]/acerto/transferencias — regra de negócio (422)", () => {
  it.each([
    ["acima da dívida do pagador", { valor: "30,01" }, /dívida atual do pagador/],
    ["moeda sem saldo na viagem", { moeda: "USD" }, /Não há saldo em USD/],
    ["recebedor sem crédito", { para: BRUNO, valor: "1,00" }, /não tem valor a receber/],
    ["recebedor fora do acerto", { para: "12345678-0000-4000-8000-000000000000" }, /não participa do acerto/],
  ])("%s", async (_nome, c, mensagem) => {
    logado(CARLA)
    cenarioComDespesas()

    const { status, corpo } = await chamar(corpoValido(c))

    expect(status).toBe(422)
    expect(corpo.error).toMatch(mensagem)
    expect(h.inseridos).toHaveLength(0)
  })

  it("pagador sem dívida (credor tentando pagar)", async () => {
    logado(ANA)
    cenarioComDespesas()

    const { status, corpo } = await chamar(corpoValido({ de: ANA, para: BRUNO, valor: "1,00" }))

    expect(status).toBe(422)
    expect(corpo.error).toBe("O pagador não tem dívida em aberto nesta moeda")
  })
})

describe("POST /api/trips/[tripId]/acerto/transferencias — 500", () => {
  it("erro do banco no insert responde genérico, sem vazar a mensagem interna", async () => {
    logado(CARLA)
    cenarioComDespesas()
    h.insercao = { data: null, error: { message: 'new row violates "settlements_secreta"', code: "42501" } }

    const { status, corpo } = await chamar()

    expect(status).toBe(500)
    expect(corpo).toEqual({ error: "Erro interno do servidor" })
    expect(JSON.stringify(corpo)).not.toContain("secreta")
  })

  it("erro ao ler o acerto responde genérico e não grava", async () => {
    logado(CARLA)
    cenarioComDespesas()
    h.pagamentos = { data: null, error: { message: "relation settlements secreta" } }

    const { status, corpo } = await chamar()

    expect(status).toBe(500)
    expect(corpo).toEqual({ error: "Erro interno do servidor" })
    expect(h.inseridos).toHaveLength(0)
  })

  it("erro na busca por chave responde genérico e não grava", async () => {
    logado(CARLA)
    cenarioComDespesas()
    h.porChave = [{ data: null, error: { message: "timeout secreto" } }]

    const { status, corpo } = await chamar()

    expect(status).toBe(500)
    expect(corpo).toEqual({ error: "Erro interno do servidor" })
    expect(h.inseridos).toHaveLength(0)
  })
})
