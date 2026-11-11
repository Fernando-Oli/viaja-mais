import { describe, it, expect } from "vitest"
import { montarAcerto, type Acerto, type PagamentoLido } from "@/lib/finance/acerto"
import { paraCentavos } from "@/lib/finance/balances"
import { ErroTransferencia, validarTransferencia, type PedidoTransferencia } from "@/lib/finance/transferencia"
import { registrarTransferenciaSchema } from "@/lib/schemas/transferencia"

/**
 * @RF06.13 registrar como paga uma transferência do acerto
 *
 * `validarTransferencia()` compara o pagamento pedido com o acerto já montado.
 * O acerto daqui sai de `montarAcerto()` de verdade — não de um objeto escrito
 * à mão —, para que o teste prove a regra contra o mesmo saldo que a rota usa.
 *
 * Cenário: Hotel R$ 90 (Ana, entre os três) e Jantar R$ 30 (Bruno, entre Ana e
 * Bruno) → Ana +45, Bruno −15, Carla −30.
 */

const ANA = "aaaaaaaa-0000-4000-8000-000000000001"
const BRUNO = "bbbbbbbb-0000-4000-8000-000000000002"
const CARLA = "cccccccc-0000-4000-8000-000000000003"
const DIEGO = "dddddddd-0000-4000-8000-000000000004"
const EX = "eeeeeeee-0000-4000-8000-000000000005"
const CHAVE = "99999999-0000-4000-8000-000000000009"

function acertoBase(pagamentos: PagamentoLido[] = [], comEx = false): Acerto {
  return montarAcerto({
    despesas: [
      { id: "hotel", paid_by: ANA, currency: "BRL" },
      { id: "jantar", paid_by: BRUNO, currency: "BRL" },
      ...(comEx ? [{ id: "taxi", paid_by: ANA, currency: "BRL" }] : []),
    ],
    partes: [
      { expense_id: "hotel", user_id: ANA, amount: 30, settled_at: null },
      { expense_id: "hotel", user_id: BRUNO, amount: 30, settled_at: null },
      { expense_id: "hotel", user_id: CARLA, amount: 30, settled_at: null },
      { expense_id: "jantar", user_id: ANA, amount: 15, settled_at: null },
      { expense_id: "jantar", user_id: BRUNO, amount: 15, settled_at: null },
      ...(comEx ? [{ expense_id: "taxi", user_id: EX, amount: 8, settled_at: null }] : []),
    ],
    membros: [
      { user_id: ANA, role: "owner" },
      { user_id: BRUNO, role: "member" },
      { user_id: CARLA, role: "member" },
      { user_id: DIEGO, role: "member" },
    ],
    usuarioAtualId: CARLA,
    pagamentos,
  })
}

const pedido = (p: Partial<PedidoTransferencia> = {}): PedidoTransferencia => ({
  de: CARLA,
  para: ANA,
  valorCentavos: 3000,
  moeda: "BRL",
  ...p,
})

function motivo(acerto: Acerto, p: PedidoTransferencia) {
  try {
    validarTransferencia(acerto, p)
  } catch (erro) {
    expect(erro).toBeInstanceOf(ErroTransferencia)
    return (erro as ErroTransferencia).motivo
  }
  return null
}

/** Aplica o pagamento como a rota faria (gravar e montar de novo) e devolve o novo acerto. */
const depoisDe = (p: PedidoTransferencia, anteriores: PagamentoLido[] = []) =>
  acertoBase([...anteriores, { from_user_id: p.de, to_user_id: p.para, amount: p.valorCentavos / 100, currency: p.moeda }])

const somaCentavos = (acerto: Acerto) =>
  acerto.grupos.map((g) => g.saldos.reduce((a, s) => a + paraCentavos(s.valor), 0))

describe("validarTransferencia — aceita", () => {
  it("transferência total: zera a dívida do pagador e o crédito cai o mesmo valor", () => {
    const resultado = validarTransferencia(acertoBase(), pedido())
    expect(resultado).toEqual({ saldoPagadorCentavos: 0, saldoRecebedorCentavos: 1500 })

    const depois = depoisDe(pedido())
    const saldo = (id: string) => depois.grupos[0].saldos.find((s) => s.userId === id)?.valor
    expect(saldo(CARLA)).toBe(0)
    expect(saldo(ANA)).toBe(15)
    expect(depois.grupos[0].transferencias.some((t) => t.de.userId === CARLA)).toBe(false)
  })

  it("transferência parcial: aceita valor menor e a sugestão diminui", () => {
    const p = pedido({ valorCentavos: 1001 })
    expect(validarTransferencia(acertoBase(), p)).toEqual({ saldoPagadorCentavos: -1999, saldoRecebedorCentavos: 3499 })

    const depois = depoisDe(p)
    const daCarla = depois.grupos[0].transferencias.find((t) => t.de.userId === CARLA)
    expect(daCarla?.valor).toBe(19.99)
  })

  it("um centavo é um pagamento válido", () => {
    expect(motivo(acertoBase(), pedido({ valorCentavos: 1 }))).toBeNull()
  })

  it("aceita pagar a quem não é o par sugerido, se cabe na dívida e no crédito", () => {
    // Bruno deve 15 e Ana tem 45 a receber: Bruno → Ana é o par sugerido, mas
    // a regra é de saldo, não de sugestão.
    expect(motivo(acertoBase(), pedido({ de: BRUNO, valorCentavos: 1500 }))).toBeNull()
  })

  it("a soma dos saldos continua zero depois do pagamento, inclusive em sequência", () => {
    const primeiro = pedido({ valorCentavos: 1234 })
    const depois1 = depoisDe(primeiro)
    expect(somaCentavos(depois1)).toEqual([0])

    const anteriores: PagamentoLido[] = [{ from_user_id: CARLA, to_user_id: ANA, amount: 12.34, currency: "BRL" }]
    const segundo = pedido({ valorCentavos: 3000 - 1234 })
    expect(motivo(depois1, segundo)).toBeNull()
    const depois2 = depoisDe(segundo, anteriores)
    expect(somaCentavos(depois2)).toEqual([0])
    expect(depois2.grupos[0].saldos.find((s) => s.userId === CARLA)?.valor).toBe(0)
  })

  it("ex-participante com dívida aberta pode ser pagador no acerto", () => {
    expect(motivo(acertoBase([], true), pedido({ de: EX, valorCentavos: 800 }))).toBeNull()
  })
})

describe("validarTransferencia — recusa", () => {
  it("valor zero", () => {
    expect(motivo(acertoBase(), pedido({ valorCentavos: 0 }))).toBe("valor-invalido")
  })

  it("valor negativo", () => {
    expect(motivo(acertoBase(), pedido({ valorCentavos: -100 }))).toBe("valor-invalido")
  })

  it("valor que não é centavo inteiro (mais de duas casas)", () => {
    expect(motivo(acertoBase(), pedido({ valorCentavos: 10.5 }))).toBe("valor-invalido")
  })

  it("pagador igual ao recebedor", () => {
    expect(motivo(acertoBase(), pedido({ para: CARLA }))).toBe("mesma-pessoa")
  })

  it("valor acima da dívida do pagador", () => {
    const acerto = acertoBase()
    expect(motivo(acerto, pedido({ valorCentavos: 3001 }))).toBe("acima-da-divida")
    try {
      validarTransferencia(acerto, pedido({ valorCentavos: 3001 }))
    } catch (erro) {
      expect((erro as Error).message).toMatch(/R\$\s30,00/)
    }
  })

  it("valor acima do crédito do recebedor", () => {
    // Ana pagou o almoço de 5 da Carla; Bruno pagou o passeio de 50 da Carla.
    // Carla deve 55, mas a Ana só tem 5 a receber.
    const credorPequeno = montarAcerto({
      despesas: [
        { id: "almoco", paid_by: ANA, currency: "BRL" },
        { id: "passeio", paid_by: BRUNO, currency: "BRL" },
      ],
      partes: [
        { expense_id: "almoco", user_id: CARLA, amount: 5, settled_at: null },
        { expense_id: "passeio", user_id: CARLA, amount: 50, settled_at: null },
      ],
      membros: [
        { user_id: ANA, role: "owner" },
        { user_id: BRUNO, role: "member" },
        { user_id: CARLA, role: "member" },
      ],
      usuarioAtualId: CARLA,
    })
    expect(motivo(credorPequeno, pedido({ valorCentavos: 501 }))).toBe("acima-do-credito")
    expect(motivo(credorPequeno, pedido({ valorCentavos: 500 }))).toBeNull()
  })

  it("moeda diferente da de qualquer grupo de saldo", () => {
    expect(motivo(acertoBase(), pedido({ moeda: "USD" }))).toBe("moeda-sem-saldo")
  })

  it("pagador sem dívida (credor ou quite)", () => {
    expect(motivo(acertoBase(), pedido({ de: DIEGO, valorCentavos: 100 }))).toBe("pagador-sem-divida")
    expect(motivo(acertoBase(), pedido({ de: ANA, para: CARLA, valorCentavos: 100 }))).toBe("pagador-sem-divida")
  })

  it("recebedor sem crédito (devedor ou quite)", () => {
    expect(motivo(acertoBase(), pedido({ para: BRUNO, valorCentavos: 100 }))).toBe("recebedor-sem-credito")
    expect(motivo(acertoBase(), pedido({ para: DIEGO, valorCentavos: 100 }))).toBe("recebedor-sem-credito")
  })

  it("pagador ou recebedor que não está no acerto (nem membro, nem com saldo aberto)", () => {
    const estranho = "12345678-0000-4000-8000-000000000000"
    expect(motivo(acertoBase(), pedido({ de: estranho }))).toBe("pagador-fora-do-acerto")
    expect(motivo(acertoBase(), pedido({ para: estranho }))).toBe("recebedor-fora-do-acerto")
  })

  it("depois de quitado, um novo pagamento do mesmo valor é recusado", () => {
    const quitado = depoisDe(pedido())
    expect(motivo(quitado, pedido())).toBe("pagador-sem-divida")
  })
})

describe("registrarTransferenciaSchema", () => {
  const corpo = (c: Record<string, unknown> = {}) => ({ de: CARLA, para: ANA, valor: "30,00", moeda: "brl", chave: CHAVE, ...c })

  it("aceita valor em texto com vírgula ou número, e normaliza a moeda", () => {
    expect(registrarTransferenciaSchema.parse(corpo())).toMatchObject({ valor: "30,00", moeda: "BRL" })
    expect(registrarTransferenciaSchema.safeParse(corpo({ valor: 12.5 })).success).toBe(true)
  })

  it("descarta campos fora do contrato", () => {
    const r = registrarTransferenciaSchema.parse(corpo({ trip_id: "x", id: "y", created_at: "z" }))
    expect(Object.keys(r).sort()).toEqual(["chave", "de", "moeda", "para", "valor"])
  })

  it.each([
    ["valor zero", { valor: 0 }],
    ["valor negativo", { valor: -5 }],
    ["três casas decimais", { valor: "10,005" }],
    ["valor em texto", { valor: "dez" }],
    ["pagador igual ao recebedor", { para: CARLA }],
    ["pagador que não é UUID", { de: "carla" }],
    ["moeda inválida", { moeda: "REAL" }],
    ["sem chave", { chave: undefined }],
  ])("recusa %s", (_nome, c) => {
    expect(registrarTransferenciaSchema.safeParse(corpo(c)).success).toBe(false)
  })
})
