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
const porUsuario = (partes: Parte[]) => Object.fromEntries(partes.map((p) => [p.userId, p.centavos]))

/** Todas as ordens possíveis da lista. */
function permutacoes<T>(lista: T[]): T[][] {
  if (lista.length <= 1) return [lista]
  return lista.flatMap((item, i) => permutacoes([...lista.slice(0, i), ...lista.slice(i + 1)]).map((resto) => [item, ...resto]))
}

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

  // @RNF08.1 regressão da Issue #36: o centavo seguia a ordem de entrada, e a
  // criação e a edição da mesma despesa o davam a pessoas diferentes.
  describe("centavo extra determinístico (Issue #36)", () => {
    it("participantes fora de ordem: o centavo vai para o menor user_id, e a lista mantém a ordem de entrada", () => {
      const partes = dividirIgual(1000, ["c", "a", "b"])
      expect(porUsuario(partes)).toEqual({ a: 334, b: 333, c: 333 })
      expect(partes.map((p) => p.userId)).toEqual(["c", "a", "b"])
    })

    it("toda permutação da lista dá o mesmo valor para cada participante", () => {
      for (const total of [1000, 1001, 2, 9_999_999_999]) {
        const esperado = porUsuario(dividirIgual(total, ["a", "b", "c", "d"]))
        for (const ordem of permutacoes(["a", "b", "c", "d"])) {
          expect(porUsuario(dividirIgual(total, ordem))).toEqual(esperado)
        }
      }
    })

    it("com mais de um centavo de resto, os extras seguem a ordem crescente de user_id", () => {
      // 1002 / 4 = 250 com resto 2: os dois menores ids levam 251.
      expect(porUsuario(dividirIgual(1002, ["d", "b", "c", "a"]))).toEqual({ a: 251, b: 251, c: 250, d: 250 })
    })

    it("a soma continua exatamente igual ao total em qualquer ordem", () => {
      for (const ordem of permutacoes(["u3", "u1", "u2", "u0"])) {
        for (const total of [1, 7, 999, 1001, 33333]) {
          expect(soma(dividirIgual(total, ordem))).toBe(total)
        }
      }
    })

    it("compara user_id como string simples, sem depender de locale", () => {
      // Com `localeCompare`, "B" e "a" sairiam em ordem alfabética; por code
      // unit, maiúscula vem antes. UUIDs reais são minúsculos e não mudam nada.
      expect(porUsuario(dividirIgual(1001, ["a", "B"]))).toEqual({ B: 501, a: 500 })
      const uuidMaior = "f0000000-0000-4000-8000-000000000000"
      const uuidMenor = "0a000000-0000-4000-8000-000000000000"
      expect(porUsuario(dividirIgual(1001, [uuidMaior, uuidMenor]))).toEqual({ [uuidMenor]: 501, [uuidMaior]: 500 })
    })
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

  // @RNF08.1 regressão da Issue #36: empate de fração era decidido pela ordem de entrada.
  describe("empate de fração resolvido por user_id (Issue #36)", () => {
    it("empate entre todos: o centavo vai para o menor user_id, qualquer que seja a ordem", () => {
      const partes = dividirPorPeso(1000, [
        { userId: "c", peso: 1 },
        { userId: "a", peso: 1 },
        { userId: "b", peso: 1 },
      ])
      expect(porUsuario(partes)).toEqual({ a: 334, b: 333, c: 333 })
      expect(partes.map((p) => p.userId)).toEqual(["c", "a", "b"])
    })

    it("empate só entre parte dos participantes: desempata pelo menor user_id entre os empatados", () => {
      // 1002 com pesos 1, 2, 1: 250,5 · 501 · 250,5 — sobra 1 centavo, empate entre a e c.
      const partes = dividirPorPeso(1002, [
        { userId: "c", peso: 1 },
        { userId: "b", peso: 2 },
        { userId: "a", peso: 1 },
      ])
      expect(porUsuario(partes)).toEqual({ a: 251, b: 501, c: 250 })
      expect(soma(partes)).toBe(1002)
    })

    it("o maior resto continua mandando: o id só desempata", () => {
      // 1001 com pesos 2, 1, 1: 500,5 · 250,25 · 250,25 — o centavo vai para c, mesmo com o maior id.
      const partes = dividirPorPeso(1001, [
        { userId: "c", peso: 2 },
        { userId: "b", peso: 1 },
        { userId: "a", peso: 1 },
      ])
      expect(porUsuario(partes)).toEqual({ a: 250, b: 250, c: 501 })
    })

    it("toda permutação da entrada dá o mesmo valor e o mesmo peso para cada participante", () => {
      const entradas = [
        { userId: "a", peso: 1 },
        { userId: "b", peso: 1.5 },
        { userId: "c", peso: 1 },
        { userId: "d", peso: 1.5 },
      ]
      for (const total of [1000, 1001, 1003, 7]) {
        const esperado = dividirPorPeso(total, entradas)
        for (const ordem of permutacoes(entradas)) {
          const partes = dividirPorPeso(total, ordem)
          expect(porUsuario(partes)).toEqual(porUsuario(esperado))
          expect(Object.fromEntries(partes.map((p) => [p.userId, p.peso]))).toEqual({ a: 1, b: 1.5, c: 1, d: 1.5 })
          expect(soma(partes)).toBe(total)
        }
      }
    })
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
