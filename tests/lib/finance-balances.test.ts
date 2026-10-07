import { describe, it, expect } from "vitest"
import {
  calcularSaldos,
  minimizarTransferencias,
  paraCentavos,
  paraReais,
  type DespesaDividida,
  type Saldo,
} from "@/lib/finance/balances"

/**
 * `lib/finance/balances.ts` é função pura: sem Supabase, sem fetch, sem React.
 * Estes testes provam isso por construção — nenhum mock de I/O existe aqui,
 * porque não há nada para mockar.
 *
 * @RF06.11 saldo por membro · @RF06.13 minimização de transferências
 */

const A = "user-a"
const B = "user-b"
const C = "user-c"
const D = "user-d"

/** A soma de todos os saldos tem que fechar em zero — é o invariante central do módulo. */
function somaSaldos(saldos: Saldo[]): number {
  return saldos.reduce((soma, s) => soma + paraCentavos(s.valor), 0)
}

describe("paraCentavos / paraReais", () => {
  it("convertem reais para centavos e de volta sem acumular erro de ponto flutuante", () => {
    expect(paraCentavos(10)).toBe(1000)
    expect(paraCentavos(0.1)).toBe(10)
    expect(paraCentavos(0.2)).toBe(20)
    // 0.1 + 0.2 em float dá 0.30000000000000004; em centavos inteiros isso não existe.
    expect(paraCentavos(0.1) + paraCentavos(0.2)).toBe(30)
    expect(paraReais(1033)).toBe(10.33)
  })

  it("arredonda para o centavo mais próximo quando o valor tem mais de duas casas decimais", () => {
    expect(paraCentavos(3.333)).toBe(333)
    expect(paraCentavos(3.336)).toBe(334)
    expect(paraCentavos(14.2857)).toBe(1429)
  })
})

describe("calcularSaldos — casos de borda", () => {
  it("devolve lista vazia para nenhuma despesa", () => {
    expect(calcularSaldos([])).toEqual([])
  })

  it("valor zero: despesa de R$0,00 não gera dívida nenhuma", () => {
    const despesas: DespesaDividida[] = [
      { pagadorId: A, partes: [{ participanteId: B, valor: 0 }] },
    ]
    const saldos = calcularSaldos(despesas)
    expect(saldos.find((s) => s.participanteId === A)?.valor).toBe(0)
    expect(saldos.find((s) => s.participanteId === B)?.valor).toBe(0)
    expect(somaSaldos(saldos)).toBe(0)
  })

  it("ninguém deve nada: despesa paga e consumida só pelo próprio pagador", () => {
    const despesas: DespesaDividida[] = [{ pagadorId: A, partes: [{ participanteId: A, valor: 50 }] }]
    const saldos = calcularSaldos(despesas)
    expect(saldos).toEqual([{ participanteId: A, valor: 0 }])
  })

  it("apenas uma pessoa na viagem: ela paga e consome tudo, saldo zero", () => {
    const despesas: DespesaDividida[] = [
      { pagadorId: A, partes: [{ participanteId: A, valor: 120.5 }] },
      { pagadorId: A, partes: [{ participanteId: A, valor: 30 }] },
    ]
    const saldos = calcularSaldos(despesas)
    expect(saldos).toEqual([{ participanteId: A, valor: 0 }])
  })

  it("R$ 10,00 divididos entre 3 pessoas, com o centavo de resto no primeiro: a soma fecha em zero", () => {
    // 10,00 / 3 = 3,333...; a política de arredondamento (decidida no plano) dá
    // o centavo de resto a um dos participantes: 3,34 + 3,33 + 3,33 = 10,00.
    const despesas: DespesaDividida[] = [
      {
        pagadorId: A,
        partes: [
          { participanteId: A, valor: 3.34 },
          { participanteId: B, valor: 3.33 },
          { participanteId: C, valor: 3.33 },
        ],
      },
    ]
    const saldos = calcularSaldos(despesas)

    expect(saldos.find((s) => s.participanteId === A)?.valor).toBe(6.66)
    expect(saldos.find((s) => s.participanteId === B)?.valor).toBe(-3.33)
    expect(saldos.find((s) => s.participanteId === C)?.valor).toBe(-3.33)
    expect(somaSaldos(saldos)).toBe(0)
  })

  it("mais casos de arredondamento: R$ 100,00 entre 7 pessoas", () => {
    // 100 / 7 = 14,2857...; em centavos, 1428 * 7 = 9996, faltam 4 centavos —
    // dão 1 centavo extra para os 4 primeiros.
    const partes = Array.from({ length: 7 }, (_, i) => ({
      participanteId: `p${i}`,
      valor: i < 4 ? 14.29 : 14.28,
    }))
    const despesas: DespesaDividida[] = [{ pagadorId: "pagador", partes }]
    const saldos = calcularSaldos(despesas)

    const totalPartes = partes.reduce((soma, p) => soma + paraCentavos(p.valor), 0)
    expect(totalPartes).toBe(10000) // bate com os R$ 100,00 originais, no centavo

    expect(somaSaldos(saldos)).toBe(0)
    for (let i = 0; i < 4; i++) {
      expect(saldos.find((s) => s.participanteId === `p${i}`)?.valor).toBe(-14.29)
    }
    for (let i = 4; i < 7; i++) {
      expect(saldos.find((s) => s.participanteId === `p${i}`)?.valor).toBe(-14.28)
    }
  })
})

describe("calcularSaldos — múltiplos participantes e múltiplas despesas", () => {
  it("acumula saldo de várias despesas para o mesmo participante", () => {
    const despesas: DespesaDividida[] = [
      { pagadorId: A, partes: [{ participanteId: B, valor: 30 }] },
      { pagadorId: A, partes: [{ participanteId: B, valor: 20 }] },
      { pagadorId: C, partes: [{ participanteId: B, valor: 10 }] },
    ]
    const saldos = calcularSaldos(despesas)

    expect(saldos.find((s) => s.participanteId === A)?.valor).toBe(50)
    expect(saldos.find((s) => s.participanteId === C)?.valor).toBe(10)
    expect(saldos.find((s) => s.participanteId === B)?.valor).toBe(-60)
    expect(somaSaldos(saldos)).toBe(0)
  })

  it("quatro participantes, despesas cruzadas — a soma continua fechando em zero", () => {
    const despesas: DespesaDividida[] = [
      {
        pagadorId: A,
        partes: [
          { participanteId: A, valor: 25 },
          { participanteId: B, valor: 25 },
          { participanteId: C, valor: 25 },
          { participanteId: D, valor: 25 },
        ],
      },
      {
        pagadorId: B,
        partes: [
          { participanteId: C, valor: 15 },
          { participanteId: D, valor: 15 },
        ],
      },
      {
        pagadorId: D,
        partes: [{ participanteId: A, valor: 8.5 }],
      },
    ]
    const saldos = calcularSaldos(despesas)
    expect(somaSaldos(saldos)).toBe(0)

    // A: +75 (pagou p/ 3 outros) - 8,50 (parte que D cobriu) = 66,50
    expect(saldos.find((s) => s.participanteId === A)?.valor).toBeCloseTo(66.5, 2)
    // B: +30 (cobriu C e D) - 25 (parte da despesa de A) = 5,00
    expect(saldos.find((s) => s.participanteId === B)?.valor).toBeCloseTo(5, 2)
    // C: -25 (despesa de A) - 15 (despesa de B) = -40,00
    expect(saldos.find((s) => s.participanteId === C)?.valor).toBeCloseTo(-40, 2)
    // D: +8,50 (cobriu A) - 25 (despesa de A) - 15 (despesa de B) = -31,50
    expect(saldos.find((s) => s.participanteId === D)?.valor).toBeCloseTo(-31.5, 2)
  })
})

describe("minimizarTransferencias", () => {
  it("nenhum saldo: nenhuma transferência", () => {
    expect(minimizarTransferencias([])).toEqual([])
  })

  it("todo mundo quite (saldo zero): nenhuma transferência", () => {
    const saldos: Saldo[] = [
      { participanteId: A, valor: 0 },
      { participanteId: B, valor: 0 },
    ]
    expect(minimizarTransferencias(saldos)).toEqual([])
  })

  it("dois participantes: uma única transferência do devedor para o credor", () => {
    const saldos: Saldo[] = [
      { participanteId: A, valor: 50 },
      { participanteId: B, valor: -50 },
    ]
    expect(minimizarTransferencias(saldos)).toEqual([{ de: B, para: A, valor: 50 }])
  })

  it("R$ 10,00 entre 3 pessoas: duas transferências fecham a conta (não três)", () => {
    const saldos: Saldo[] = [
      { participanteId: A, valor: 6.66 },
      { participanteId: B, valor: -3.33 },
      { participanteId: C, valor: -3.33 },
    ]
    const transferencias = minimizarTransferencias(saldos)

    expect(transferencias).toHaveLength(2)
    expect(transferencias.every((t) => t.para === A)).toBe(true)
    expect(transferencias.reduce((soma, t) => soma + paraCentavos(t.valor), 0)).toBe(666)
  })

  it("colapsa cadeia de dívida: A deve a B, B deve a C vira A paga C direto", () => {
    // A deve 100 a B; B deve 100 a C. Sem minimização seriam 2 transferências
    // (A->B, B->C) com B no meio só repassando — o saldo de B já é zero.
    const saldos: Saldo[] = [
      { participanteId: A, valor: -100 },
      { participanteId: B, valor: 0 },
      { participanteId: C, valor: 100 },
    ]
    const transferencias = minimizarTransferencias(saldos)

    expect(transferencias).toEqual([{ de: A, para: C, valor: 100 }])
  })

  it("várias pessoas: o total transferido bate com o total devido, e tudo fecha com saldo zero", () => {
    const saldos: Saldo[] = [
      { participanteId: A, valor: 66.5 },
      { participanteId: B, valor: 5 },
      { participanteId: C, valor: -40 },
      { participanteId: D, valor: -31.5 },
    ]
    const transferencias = minimizarTransferencias(saldos)

    const totalTransferidoCentavos = transferencias.reduce((soma, t) => soma + paraCentavos(t.valor), 0)
    const totalDevidoCentavos = saldos
      .filter((s) => s.valor < 0)
      .reduce((soma, s) => soma - paraCentavos(s.valor), 0)
    expect(totalTransferidoCentavos).toBe(totalDevidoCentavos)

    // Aplica as transferências de volta sobre os saldos originais: tem que fechar tudo em zero.
    const restante = new Map(saldos.map((s) => [s.participanteId, paraCentavos(s.valor)]))
    for (const t of transferencias) {
      restante.set(t.de, (restante.get(t.de) ?? 0) + paraCentavos(t.valor))
      restante.set(t.para, (restante.get(t.para) ?? 0) - paraCentavos(t.valor))
    }
    for (const valor of restante.values()) {
      expect(valor).toBe(0)
    }
  })

  it("devedor único para múltiplos credores: soma das transferências dele bate com a dívida", () => {
    const saldos: Saldo[] = [
      { participanteId: A, valor: 30 },
      { participanteId: B, valor: 20 },
      { participanteId: C, valor: -50 },
    ]
    const transferencias = minimizarTransferencias(saldos)

    expect(transferencias.every((t) => t.de === C)).toBe(true)
    expect(transferencias.reduce((soma, t) => soma + paraCentavos(t.valor), 0)).toBe(5000)
  })

  it("entrada que não fecha em zero não inventa transferência para a diferença", () => {
    // Uso indevido (saldos não vêm de calcularSaldos): só documenta o comportamento.
    const saldos: Saldo[] = [
      { participanteId: A, valor: 100 },
      { participanteId: B, valor: -40 },
    ]
    const transferencias = minimizarTransferencias(saldos)

    expect(transferencias).toEqual([{ de: B, para: A, valor: 40 }])
  })
})

describe("calcularSaldos + minimizarTransferencias — ponta a ponta", () => {
  it("o resultado de calcularSaldos alimenta minimizarTransferencias e fecha tudo em zero", () => {
    const despesas: DespesaDividida[] = [
      {
        pagadorId: A,
        partes: [
          { participanteId: A, valor: 34 },
          { participanteId: B, valor: 33 },
          { participanteId: C, valor: 33 },
        ],
      },
      {
        pagadorId: B,
        partes: [
          { participanteId: A, valor: 10 },
          { participanteId: C, valor: 10 },
        ],
      },
    ]

    const saldos = calcularSaldos(despesas)
    expect(somaSaldos(saldos)).toBe(0)

    const transferencias = minimizarTransferencias(saldos)

    const restante = new Map(saldos.map((s) => [s.participanteId, paraCentavos(s.valor)]))
    for (const t of transferencias) {
      restante.set(t.de, (restante.get(t.de) ?? 0) + paraCentavos(t.valor))
      restante.set(t.para, (restante.get(t.para) ?? 0) - paraCentavos(t.valor))
    }
    for (const valor of restante.values()) {
      expect(valor).toBe(0)
    }
  })
})
