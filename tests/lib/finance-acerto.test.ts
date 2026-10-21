import { describe, it, expect } from "vitest"
import { montarAcerto, type Acerto, type DespesaLida, type MembroLido, type ParteLida } from "@/lib/finance/acerto"
import { paraCentavos } from "@/lib/finance/balances"

/**
 * @RF06.11 saldo por membro · @RF06.13 transferências sugeridas
 *
 * `montarAcerto()` só adapta e rotula: a conta é de `lib/finance/balances.ts`.
 * Por isso cada cenário confere, além do valor esperado, as duas invariantes do
 * acerto — a soma dos saldos é zero e aplicar as transferências zera todo mundo.
 */

const ANA = "aaaaaaaa-0000-4000-8000-000000000001"
const BRUNO = "bbbbbbbb-0000-4000-8000-000000000002"
const CARLA = "cccccccc-0000-4000-8000-000000000003"
const DIEGO = "dddddddd-0000-4000-8000-000000000004"
const EX1 = "eeeeeeee-0000-4000-8000-000000000005"
const EX2 = "ffffffff-0000-4000-8000-000000000006"

const MEMBROS: MembroLido[] = [
  { user_id: CARLA, role: "member" },
  { user_id: BRUNO, role: "member" },
  { user_id: ANA, role: "owner" },
]

const despesa = (id: string, paid_by: string, currency: string | null = "BRL"): DespesaLida => ({ id, paid_by, currency })
const parte = (expense_id: string, user_id: string, amount: number | string, settled_at: string | null = null): ParteLida => ({
  expense_id,
  user_id,
  amount,
  settled_at,
})

/** Cenário do roteiro manual: Hotel 90 (Ana, entre 3) e Jantar 30 (Bruno, entre Ana e Bruno). */
const CENARIO = {
  despesas: [despesa("hotel", ANA), despesa("jantar", BRUNO)],
  partes: [
    parte("hotel", ANA, 30),
    parte("hotel", BRUNO, 30),
    parte("hotel", CARLA, 30),
    parte("jantar", ANA, 15),
    parte("jantar", BRUNO, "15.00"),
  ],
  membros: MEMBROS,
}

const saldoDe = (acerto: Acerto, userId: string, grupo = 0) =>
  acerto.grupos[grupo].saldos.find((s) => s.userId === userId)?.valor

/** Soma dos saldos em centavos: tem de ser exatamente zero. */
const somaCentavos = (acerto: Acerto, grupo = 0) =>
  acerto.grupos[grupo].saldos.reduce((a, s) => a + paraCentavos(s.valor), 0)

/** Aplica as transferências sobre os saldos e devolve o que sobrou de cada um, em centavos. */
function residuos(acerto: Acerto, grupo = 0) {
  const resto = new Map(acerto.grupos[grupo].saldos.map((s) => [s.userId, paraCentavos(s.valor)]))
  for (const t of acerto.grupos[grupo].transferencias) {
    resto.set(t.de.userId, (resto.get(t.de.userId) ?? 0) + paraCentavos(t.valor))
    resto.set(t.para.userId, (resto.get(t.para.userId) ?? 0) - paraCentavos(t.valor))
  }
  return [...resto.values()]
}

function conferirInvariantes(acerto: Acerto) {
  acerto.grupos.forEach((_, i) => {
    expect(somaCentavos(acerto, i)).toBe(0)
    expect(residuos(acerto, i).every((c) => c === 0)).toBe(true)
  })
}

describe("montarAcerto — viagem com despesas", () => {
  const acerto = montarAcerto({ ...CENARIO, usuarioAtualId: BRUNO })

  it("saldo positivo para quem tem a receber e negativo para quem deve", () => {
    expect(saldoDe(acerto, ANA)).toBe(45)
    expect(saldoDe(acerto, BRUNO)).toBe(-15)
    expect(saldoDe(acerto, CARLA)).toBe(-30)
  })

  it("sugere as transferências que quitam os saldos", () => {
    expect(acerto.grupos[0].transferencias.map((t) => [t.de.userId, t.para.userId, t.valor])).toEqual([
      [CARLA, ANA, 30],
      [BRUNO, ANA, 15],
    ])
  })

  it("a soma dos saldos é zero e aplicar as transferências zera todo mundo", () => {
    conferirInvariantes(acerto)
  })

  it("conta as despesas e não marca como acertado enquanto alguém deve", () => {
    expect(acerto.totalDespesas).toBe(2)
    expect(acerto.despesasSemRateio).toBe(0)
    expect(acerto.tudoAcertado).toBe(false)
    expect(acerto.grupos).toHaveLength(1)
    expect(acerto.grupos[0].moeda).toBe("BRL")
  })
})

describe("montarAcerto — rótulos e ordem", () => {
  it('"Você" primeiro, depois o dono, depois os demais por id, como "Participante N"', () => {
    const acerto = montarAcerto({ ...CENARIO, usuarioAtualId: CARLA })
    expect(acerto.grupos[0].saldos.map((s) => [s.rotulo, s.papel])).toEqual([
      ["Você", "member"],
      ["Participante 2", "owner"],
      ["Participante 3", "member"],
    ])
    expect(acerto.grupos[0].saldos.map((s) => s.userId)).toEqual([CARLA, ANA, BRUNO])
  })

  it("as transferências carregam os mesmos rótulos dos saldos", () => {
    const acerto = montarAcerto({ ...CENARIO, usuarioAtualId: CARLA })
    const [primeira] = acerto.grupos[0].transferencias
    expect(primeira.de).toEqual({ userId: CARLA, rotulo: "Você", papel: "member" })
    expect(primeira.para).toEqual({ userId: ANA, rotulo: "Participante 2", papel: "owner" })
  })

  it("a ordem não depende da ordem de entrada das linhas", () => {
    const a = montarAcerto({ ...CENARIO, usuarioAtualId: ANA })
    const b = montarAcerto({
      despesas: [...CENARIO.despesas].reverse(),
      partes: [...CENARIO.partes].reverse(),
      membros: [...MEMBROS].reverse(),
      usuarioAtualId: ANA,
    })
    expect(b).toEqual(a)
  })

  it("quem consulta sendo o dono aparece como Você, e os demais seguem por id", () => {
    const acerto = montarAcerto({ ...CENARIO, usuarioAtualId: ANA })
    expect(acerto.grupos[0].saldos.map((s) => s.rotulo)).toEqual(["Você", "Participante 2", "Participante 3"])
    expect(acerto.grupos[0].saldos.map((s) => s.userId)).toEqual([ANA, BRUNO, CARLA])
  })
})

describe("montarAcerto — membros sem movimento e ex-participantes", () => {
  it("membro sem movimento aparece com saldo zero", () => {
    const acerto = montarAcerto({
      ...CENARIO,
      membros: [...MEMBROS, { user_id: DIEGO, role: "member" }],
      usuarioAtualId: ANA,
    })
    expect(saldoDe(acerto, DIEGO)).toBe(0)
    expect(acerto.grupos[0].saldos).toHaveLength(4)
    conferirInvariantes(acerto)
  })

  it("membro que pagou só a própria parte fica zerado", () => {
    const acerto = montarAcerto({
      despesas: [despesa("cafe", CARLA)],
      partes: [parte("cafe", CARLA, 12)],
      membros: MEMBROS,
      usuarioAtualId: ANA,
    })
    expect(saldoDe(acerto, CARLA)).toBe(0)
    expect(acerto.grupos[0].transferencias).toEqual([])
    expect(acerto.tudoAcertado).toBe(true)
  })

  it("quem saiu da viagem com dívida em aberto continua no acerto, como Ex-participante", () => {
    const acerto = montarAcerto({
      despesas: [despesa("taxi", ANA)],
      partes: [parte("taxi", ANA, 20), parte("taxi", EX1, 20)],
      membros: MEMBROS,
      usuarioAtualId: ANA,
    })
    const ex = acerto.grupos[0].saldos.find((s) => s.userId === EX1)
    expect(ex).toMatchObject({ rotulo: "Ex-participante", papel: "ex", valor: -20 })
    // Depois dos membros.
    expect(acerto.grupos[0].saldos.at(-1)?.userId).toBe(EX1)
    expect(acerto.grupos[0].transferencias[0].de.rotulo).toBe("Ex-participante")
    conferirInvariantes(acerto)
  })

  it("mais de um ex-participante recebe número, para a frase não ficar ambígua", () => {
    const acerto = montarAcerto({
      despesas: [despesa("barco", ANA)],
      partes: [parte("barco", EX2, 10), parte("barco", EX1, 10)],
      membros: MEMBROS,
      usuarioAtualId: ANA,
    })
    const ex = acerto.grupos[0].saldos.filter((s) => s.papel === "ex")
    expect(ex.map((s) => [s.userId, s.rotulo])).toEqual([
      [EX1, "Ex-participante 1"],
      [EX2, "Ex-participante 2"],
    ])
  })
})

describe("montarAcerto — despesas sem rateio, quitadas e moedas", () => {
  it("despesa sem expense_shares não gera dívida e é contada à parte", () => {
    const acerto = montarAcerto({
      despesas: [...CENARIO.despesas, despesa("antiga", CARLA)],
      partes: CENARIO.partes,
      membros: MEMBROS,
      usuarioAtualId: ANA,
    })
    expect(acerto.despesasSemRateio).toBe(1)
    expect(acerto.totalDespesas).toBe(3)
    expect(saldoDe(acerto, CARLA)).toBe(-30)
  })

  it("parte quitada não entra no saldo de nenhum dos dois lados", () => {
    const acerto = montarAcerto({
      ...CENARIO,
      partes: CENARIO.partes.map((p) =>
        p.expense_id === "hotel" && p.user_id === CARLA ? { ...p, settled_at: "2026-10-20T12:00:00Z" } : p,
      ),
      usuarioAtualId: ANA,
    })
    expect(saldoDe(acerto, CARLA)).toBe(0)
    expect(saldoDe(acerto, ANA)).toBe(15)
    expect(saldoDe(acerto, BRUNO)).toBe(-15)
    conferirInvariantes(acerto)
  })

  it("tudo quitado: acertado, e a despesa não é contada como sem rateio", () => {
    const acerto = montarAcerto({
      ...CENARIO,
      partes: CENARIO.partes.map((p) => ({ ...p, settled_at: "2026-10-20T12:00:00Z" })),
      usuarioAtualId: ANA,
    })
    expect(acerto.tudoAcertado).toBe(true)
    expect(acerto.despesasSemRateio).toBe(0)
    expect(acerto.grupos[0].saldos.every((s) => s.valor === 0)).toBe(true)
  })

  it("parte de despesa que não está na lista é ignorada", () => {
    const acerto = montarAcerto({
      ...CENARIO,
      partes: [...CENARIO.partes, parte("de-outra-viagem", CARLA, 999)],
      usuarioAtualId: ANA,
    })
    expect(saldoDe(acerto, CARLA)).toBe(-30)
  })

  it("duas moedas geram dois grupos, sem somar entre si", () => {
    const acerto = montarAcerto({
      despesas: [despesa("hotel", ANA, "BRL"), despesa("museu", CARLA, "EUR")],
      partes: [parte("hotel", ANA, 50), parte("hotel", BRUNO, 50), parte("museu", CARLA, 10), parte("museu", BRUNO, 10)],
      membros: MEMBROS,
      usuarioAtualId: ANA,
    })
    expect(acerto.grupos.map((g) => g.moeda)).toEqual(["BRL", "EUR"])
    expect(saldoDe(acerto, BRUNO, 0)).toBe(-50)
    expect(saldoDe(acerto, BRUNO, 1)).toBe(-10)
    expect(saldoDe(acerto, CARLA, 0)).toBe(0)
    expect(saldoDe(acerto, CARLA, 1)).toBe(10)
    // Todo membro aparece em todo grupo.
    expect(acerto.grupos.every((g) => g.saldos.length === 3)).toBe(true)
    conferirInvariantes(acerto)
  })

  it("despesa sem moeda cai no BRL", () => {
    const acerto = montarAcerto({
      despesas: [despesa("x", ANA, null)],
      partes: [parte("x", BRUNO, 5)],
      membros: MEMBROS,
      usuarioAtualId: ANA,
    })
    expect(acerto.grupos[0].moeda).toBe("BRL")
  })
})

describe("montarAcerto — centavos", () => {
  it("R$ 10,00 entre 3 (3,34 + 3,33 + 3,33): saldos fecham em zero no centavo", () => {
    const acerto = montarAcerto({
      despesas: [despesa("pizza", ANA)],
      partes: [parte("pizza", ANA, 3.34), parte("pizza", BRUNO, 3.33), parte("pizza", CARLA, 3.33)],
      membros: MEMBROS,
      usuarioAtualId: ANA,
    })
    expect(saldoDe(acerto, ANA)).toBe(6.66)
    expect(saldoDe(acerto, BRUNO)).toBe(-3.33)
    expect(saldoDe(acerto, CARLA)).toBe(-3.33)
    conferirInvariantes(acerto)
  })

  it("várias despesas quebradas, pagas por pessoas diferentes, ainda fecham", () => {
    const acerto = montarAcerto({
      despesas: [despesa("d1", ANA), despesa("d2", BRUNO), despesa("d3", CARLA)],
      partes: [
        parte("d1", ANA, 0.34),
        parte("d1", BRUNO, 0.33),
        parte("d1", CARLA, 0.33),
        parte("d2", ANA, 33.34),
        parte("d2", CARLA, 33.33),
        parte("d2", BRUNO, 33.33),
        parte("d3", ANA, 0.01),
        parte("d3", BRUNO, 0.01),
      ],
      membros: MEMBROS,
      usuarioAtualId: CARLA,
    })
    conferirInvariantes(acerto)
  })
})

describe("montarAcerto — viagem sem despesas e saldos zerados", () => {
  it("sem despesas: um grupo em BRL com todos os membros em zero e nenhuma transferência", () => {
    const acerto = montarAcerto({ despesas: [], partes: [], membros: MEMBROS, usuarioAtualId: ANA })
    expect(acerto.totalDespesas).toBe(0)
    expect(acerto.tudoAcertado).toBe(false)
    expect(acerto.grupos).toHaveLength(1)
    expect(acerto.grupos[0].moeda).toBe("BRL")
    expect(acerto.grupos[0].saldos.map((s) => s.valor)).toEqual([0, 0, 0])
    expect(acerto.grupos[0].transferencias).toEqual([])
  })

  it("só despesas sem rateio: usa a moeda delas e não diz que está tudo acertado", () => {
    const acerto = montarAcerto({
      despesas: [despesa("antiga", ANA, "USD")],
      partes: [],
      membros: MEMBROS,
      usuarioAtualId: ANA,
    })
    expect(acerto.grupos[0].moeda).toBe("USD")
    expect(acerto.despesasSemRateio).toBe(1)
    expect(acerto.tudoAcertado).toBe(false)
  })

  it("cada um pagou R$ 30 entre os três: todos zerados e tudo acertado", () => {
    const acerto = montarAcerto({
      despesas: [despesa("a", ANA), despesa("b", BRUNO), despesa("c", CARLA)],
      partes: ["a", "b", "c"].flatMap((id) => [parte(id, ANA, 10), parte(id, BRUNO, 10), parte(id, CARLA, 10)]),
      membros: MEMBROS,
      usuarioAtualId: ANA,
    })
    expect(acerto.grupos[0].saldos.map((s) => s.valor)).toEqual([0, 0, 0])
    expect(acerto.grupos[0].transferencias).toEqual([])
    expect(acerto.tudoAcertado).toBe(true)
  })
})
