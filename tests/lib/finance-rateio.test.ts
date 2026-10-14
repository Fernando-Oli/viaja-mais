import { describe, it, expect } from "vitest"
import {
  avaliarRateio,
  calcularRateio,
  centavosParaReais,
  conferirValorExato,
  dividirIgual,
  dividirPorPeso,
  dividirPorValorExato,
  ErroRateio,
  formatarCentavos,
  pesoParaCentesimos,
  reaisParaCentavos,
  type ParticipanteFormulario,
  type Parte,
} from "@/lib/finance/rateio"

/**
 * Regra do rateio: a soma das partes fecha com o total no centavo, sempre
 * (RNF-08.1), inclusive com centavo quebrado.
 *
 * @RF06.9 @RF06.10
 */

const soma = (partes: Parte[]) => partes.reduce((a, p) => a + p.centavos, 0)
const centavos = (partes: Parte[]) => partes.map((p) => p.centavos)

describe("reaisParaCentavos", () => {
  it.each([
    ["10", 1000],
    ["10.5", 1050],
    ["10,05", 1005],
    ["0.01", 1],
    ["0", 0],
    [" 3.34 ", 334],
    [80, 8000],
    [0.1, 10],
    [10.05, 1005],
  ])("converte %j em %i centavos sem erro de ponto flutuante", (entrada, esperado) => {
    expect(reaisParaCentavos(entrada)).toBe(esperado)
  })

  it.each([["" ], ["abc"], ["-1"], ["1.005"], ["1e3"], [-5], [Number.NaN], [Infinity], [10.005], [null], [undefined]])(
    "recusa %j",
    (entrada) => {
      expect(reaisParaCentavos(entrada as string)).toBeNull()
    },
  )

  it("recusa valor fora do inteiro seguro", () => {
    expect(reaisParaCentavos("9".repeat(20))).toBeNull()
  })
})

describe("formatação", () => {
  it("volta para reais e formata em BRL", () => {
    expect(centavosParaReais(334)).toBe(3.34)
    expect(formatarCentavos(334)).toMatch(/R\$\s3,34/)
  })

  it("não quebra com código de moeda desconhecido", () => {
    expect(formatarCentavos(150, "XX1")).toBe("XX1 1.50")
  })
})

describe("pesoParaCentesimos", () => {
  it("aceita peso positivo com até duas casas", () => {
    expect(pesoParaCentesimos("2")).toBe(200)
    expect(pesoParaCentesimos(1.5)).toBe(150)
    expect(pesoParaCentesimos("9999.99")).toBe(999999)
  })

  it.each([["0"], ["-1"], [""], ["abc"], ["10000"], ["0.001"]])("recusa %j", (peso) => {
    expect(pesoParaCentesimos(peso)).toBeNull()
  })
})

describe("dividirIgual", () => {
  it("R$ 10,00 entre 3 pessoas: 3,34 + 3,33 + 3,33, somando exatamente 10,00", () => {
    const partes = dividirIgual(1000, ["a", "b", "c"])
    expect(centavos(partes)).toEqual([334, 333, 333])
    expect(soma(partes)).toBe(1000)
    expect(partes.every((p) => p.peso === null)).toBe(true)
  })

  it("divisão exata não gera centavo extra", () => {
    expect(centavos(dividirIgual(900, ["a", "b", "c"]))).toEqual([300, 300, 300])
  })

  it("total menor que o número de pessoas: centavos para os primeiros, zero para os demais", () => {
    expect(centavos(dividirIgual(2, ["a", "b", "c"]))).toEqual([1, 1, 0])
  })

  it("uma pessoa leva o total inteiro", () => {
    expect(centavos(dividirIgual(12345, ["a"]))).toEqual([12345])
  })

  it("a soma fecha para qualquer total entre 1 e 7 pessoas", () => {
    for (let n = 1; n <= 7; n++) {
      const ids = Array.from({ length: n }, (_, i) => `u${i}`)
      for (const total of [1, 7, 100, 999, 1001, 33333, 9_999_999_999]) {
        const partes = dividirIgual(total, ids)
        expect(soma(partes)).toBe(total)
        expect(Math.max(...centavos(partes)) - Math.min(...centavos(partes))).toBeLessThanOrEqual(1)
      }
    }
  })

  it.each([[0], [-100], [1.5], [Number.NaN]])("recusa total %j", (total) => {
    expect(() => dividirIgual(total, ["a"])).toThrow(ErroRateio)
  })

  it("recusa lista vazia e participante repetido", () => {
    expect(() => dividirIgual(100, [])).toThrow("Selecione ao menos um participante")
    expect(() => dividirIgual(100, ["a", "a"])).toThrow("Participante repetido")
  })
})

describe("dividirPorPeso", () => {
  it("distribui proporcionalmente ao peso: R$ 100,00 com pesos 2, 1, 1", () => {
    const partes = dividirPorPeso(10000, [
      { userId: "a", peso: 2 },
      { userId: "b", peso: 1 },
      { userId: "c", peso: 1 },
    ])
    expect(centavos(partes)).toEqual([5000, 2500, 2500])
    expect(partes.map((p) => p.peso)).toEqual([2, 1, 1])
  })

  it("R$ 10,00 com pesos iguais se comporta como a divisão igual", () => {
    const partes = dividirPorPeso(1000, [
      { userId: "a", peso: 1 },
      { userId: "b", peso: 1 },
      { userId: "c", peso: 1 },
    ])
    expect(centavos(partes)).toEqual([334, 333, 333])
  })

  it("o centavo que sobra vai para quem teve a maior fração descartada", () => {
    // 1000 * 1/6 = 166,67 · 1000 * 2/6 = 333,33 · 1000 * 3/6 = 500
    const partes = dividirPorPeso(1000, [
      { userId: "a", peso: 1 },
      { userId: "b", peso: 2 },
      { userId: "c", peso: 3 },
    ])
    expect(centavos(partes)).toEqual([167, 333, 500])
    expect(soma(partes)).toBe(1000)
  })

  it("aceita peso decimal", () => {
    const partes = dividirPorPeso(1000, [
      { userId: "a", peso: 1.5 },
      { userId: "b", peso: 0.5 },
    ])
    expect(centavos(partes)).toEqual([750, 250])
  })

  it("não estoura com total e pesos no teto das colunas", () => {
    const total = 9_999_999_999
    const partes = dividirPorPeso(total, [
      { userId: "a", peso: 9999.99 },
      { userId: "b", peso: 0.01 },
      { userId: "c", peso: 3333.33 },
    ])
    expect(soma(partes)).toBe(total)
  })

  it.each([[0], [-1], [10000], [1.234], [Number.NaN]])("recusa peso %j", (peso) => {
    expect(() =>
      dividirPorPeso(1000, [
        { userId: "a", peso: 1 },
        { userId: "b", peso },
      ]),
    ).toThrow("Peso inválido")
  })
})

describe("valor exato", () => {
  it("conferirValorExato informa soma, falta e excesso", () => {
    expect(conferirValorExato(1000, [500, 300])).toEqual({ somaCentavos: 800, diferencaCentavos: 200, fecha: false })
    expect(conferirValorExato(1000, [500, 600])).toEqual({ somaCentavos: 1100, diferencaCentavos: -100, fecha: false })
    expect(conferirValorExato(1000, [500, 500])).toEqual({ somaCentavos: 1000, diferencaCentavos: 0, fecha: true })
  })

  it("aceita partes que fecham, inclusive uma parte zero", () => {
    const partes = dividirPorValorExato(1000, [
      { userId: "a", centavos: 1000 },
      { userId: "b", centavos: 0 },
    ])
    expect(centavos(partes)).toEqual([1000, 0])
  })

  it("recusa soma que falta ou excede", () => {
    expect(() => dividirPorValorExato(1000, [{ userId: "a", centavos: 999 }])).toThrow(/faltam/)
    expect(() => dividirPorValorExato(1000, [{ userId: "a", centavos: 1001 }])).toThrow(/excede/)
  })

  it("recusa valor negativo ou fracionário de centavo", () => {
    expect(() =>
      dividirPorValorExato(1000, [
        { userId: "a", centavos: 1100 },
        { userId: "b", centavos: -100 },
      ]),
    ).toThrow("Valor inválido")
    expect(() => dividirPorValorExato(1000, [{ userId: "a", centavos: 999.5 }])).toThrow("Valor inválido")
  })
})

describe("calcularRateio", () => {
  it("encaminha cada tipo para a sua regra", () => {
    expect(centavos(calcularRateio(1000, { tipo: "equal", participantes: [{ user_id: "a" }, { user_id: "b" }, { user_id: "c" }] }))).toEqual([334, 333, 333])
    expect(
      centavos(
        calcularRateio(1000, {
          tipo: "weight",
          participantes: [
            { user_id: "a", peso: 3 },
            { user_id: "b", peso: 1 },
          ],
        }),
      ),
    ).toEqual([750, 250])
    expect(
      centavos(
        calcularRateio(1000, {
          tipo: "exact",
          participantes: [
            { user_id: "a", valor: "6.66" },
            { user_id: "b", valor: 3.34 },
          ],
        }),
      ),
    ).toEqual([666, 334])
  })

  it("valor exato ilegível vira erro de valor, não zero", () => {
    expect(() => calcularRateio(1000, { tipo: "exact", participantes: [{ user_id: "a", valor: "abc" }] })).toThrow(
      "Valor inválido",
    )
  })
})

describe("avaliarRateio (formulário)", () => {
  const p = (userId: string, extra: Partial<ParticipanteFormulario> = {}): ParticipanteFormulario => ({
    userId,
    selecionado: true,
    peso: "1",
    valor: "",
    ...extra,
  })

  it("sem valor da despesa não é válido", () => {
    const r = avaliarRateio("", "equal", [p("a")])
    expect(r.valido).toBe(false)
    expect(r.erro).toBe("Informe o valor da despesa")
  })

  it("sem participante selecionado não é válido", () => {
    const r = avaliarRateio("10", "equal", [p("a", { selecionado: false })])
    expect(r.valido).toBe(false)
    expect(r.erro).toBe("Selecione ao menos um participante")
  })

  it("igual: prévia de 10,00 / 3 e soma igual ao total", () => {
    const r = avaliarRateio("10.00", "equal", [p("a"), p("b"), p("c"), p("d", { selecionado: false })])
    expect(r.valido).toBe(true)
    expect(centavos(r.partes)).toEqual([334, 333, 333])
    expect(r.somaCentavos).toBe(1000)
    expect(r.diferencaCentavos).toBe(0)
  })

  it("peso: marca o participante com peso inválido e bloqueia", () => {
    const r = avaliarRateio("100", "weight", [p("a", { peso: "2" }), p("b", { peso: "0" }), p("c", { peso: "" })])
    expect(r.valido).toBe(false)
    expect(r.invalidos).toEqual(["b", "c"])
    expect(r.erro).toMatch(/peso maior que zero/)
  })

  it("peso: calcula a parte de cada um", () => {
    const r = avaliarRateio("100", "weight", [p("a", { peso: "2" }), p("b", { peso: "1" }), p("c", { peso: "1" })])
    expect(r.valido).toBe(true)
    expect(centavos(r.partes)).toEqual([5000, 2500, 2500])
    expect(r.somaCentavos).toBe(10000)
  })

  it("exato: mostra quanto falta", () => {
    const r = avaliarRateio("100", "exact", [p("a", { valor: "50" }), p("b", { valor: "30" })])
    expect(r.valido).toBe(false)
    expect(r.somaCentavos).toBe(8000)
    expect(r.diferencaCentavos).toBe(2000)
    expect(r.erro).toMatch(/Faltam R\$\s20,00/)
  })

  it("exato: mostra quanto excede", () => {
    const r = avaliarRateio("100", "exact", [p("a", { valor: "70" }), p("b", { valor: "40" })])
    expect(r.valido).toBe(false)
    expect(r.diferencaCentavos).toBe(-1000)
    expect(r.erro).toMatch(/excede o total em R\$\s10,00/)
  })

  it("exato: valor negativo ou com três casas é inválido", () => {
    const r = avaliarRateio("100", "exact", [p("a", { valor: "110" }), p("b", { valor: "-10" })])
    expect(r.valido).toBe(false)
    expect(r.invalidos).toEqual(["b"])
    expect(r.erro).toMatch(/Valor inválido/)
    expect(avaliarRateio("1", "exact", [p("a", { valor: "1.005" })]).invalidos).toEqual(["a"])
  })

  it("exato: fecha quando a soma é igual ao total", () => {
    const r = avaliarRateio("10", "exact", [p("a", { valor: "3.34" }), p("b", { valor: "3.33" }), p("c", { valor: "3.33" })])
    expect(r.valido).toBe(true)
    expect(r.erro).toBeNull()
    expect(r.somaCentavos).toBe(1000)
  })

  it("usa a moeda informada na mensagem", () => {
    const r = avaliarRateio("10", "exact", [p("a", { valor: "5" })], "USD")
    expect(r.erro).toMatch(/US\$\s5,00/)
  })
})
