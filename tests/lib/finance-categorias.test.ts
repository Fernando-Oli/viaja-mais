import { describe, it, expect } from "vitest"
import {
  formatarPercentual,
  relatorioPorCategoria,
  rotuloCategoria,
  ROTULOS_CATEGORIA,
  type DespesaParaRelatorio,
} from "@/lib/finance/categorias"

/**
 * `lib/finance/categorias.ts` é função pura: agrupa despesas por moeda e por
 * categoria para o relatório da área financeira. A regra central é que moedas
 * diferentes nunca se somam — não há conversão cambial.
 *
 * @RF06.5 visualizar gastos por categoria
 */

const d = (amount: number | string, category: string, currency: string | null = "BRL"): DespesaParaRelatorio => ({
  amount,
  category,
  currency,
})

describe("relatorioPorCategoria", () => {
  it("lista vazia devolve nenhum grupo", () => {
    expect(relatorioPorCategoria([])).toEqual([])
  })

  it("soma por categoria em centavos, sem erro de ponto flutuante", () => {
    const [brl] = relatorioPorCategoria([d(0.1, "food"), d(0.2, "food")])
    expect(brl.categorias).toEqual([
      { categoria: "food", rotulo: "Alimentação", centavos: 30, percentual: 100, quantidade: 2 },
    ])
    expect(brl.totalCentavos).toBe(30)
  })

  it("aceita o valor como texto, como o numeric pode chegar do banco", () => {
    const [brl] = relatorioPorCategoria([d("12.34", "food"), d("0.66", "food")])
    expect(brl.totalCentavos).toBe(1300)
  })

  it("valor não numérico conta como zero em vez de envenenar o total com NaN", () => {
    const [brl] = relatorioPorCategoria([d("abc", "food"), d(10, "food")])
    expect(brl.totalCentavos).toBe(1000)
    expect(brl.categorias[0].quantidade).toBe(2)
  })

  it("nunca soma moedas diferentes: Hospedagem BRL 300 + USD 100 são dois grupos", () => {
    const grupos = relatorioPorCategoria([d(300, "accommodation", "BRL"), d(100, "accommodation", "USD")])

    expect(grupos.map((g) => [g.moeda, g.totalCentavos])).toEqual([
      ["BRL", 30000],
      ["USD", 10000],
    ])
    expect(grupos.every((g) => g.categorias[0].percentual === 100)).toBe(true)
    expect(grupos.flatMap((g) => g.categorias).some((c) => c.centavos === 40000)).toBe(false)
  })

  it("moeda nula entra como BRL, como no acerto de contas", () => {
    const grupos = relatorioPorCategoria([d(10, "food", null), d(5, "food", "BRL")])
    expect(grupos).toHaveLength(1)
    expect(grupos[0].moeda).toBe("BRL")
    expect(grupos[0].totalCentavos).toBe(1500)
  })

  it("percentual é sobre o total da moeda, e ordena do maior para o menor", () => {
    const grupos = relatorioPorCategoria([
      d(50, "transport"),
      d(300, "accommodation"),
      d(100, "food"),
      d(999, "shopping", "USD"),
    ])
    const brl = grupos.find((g) => g.moeda === "BRL")!

    expect(brl.categorias.map((c) => c.rotulo)).toEqual(["Hospedagem", "Alimentação", "Transporte"])
    expect(brl.categorias.map((c) => formatarPercentual(c.percentual))).toEqual(["66,7%", "22,2%", "11,1%"])
    expect(brl.totalCentavos).toBe(45000)
    expect(brl.quantidade).toBe(3)
  })

  it("empate no valor desempata pelo rótulo", () => {
    const [brl] = relatorioPorCategoria([d(10, "transport"), d(10, "activities"), d(10, "food")])
    expect(brl.categorias.map((c) => c.rotulo)).toEqual(["Alimentação", "Atividades", "Transporte"])
  })

  it("moedas em ordem alfabética do código", () => {
    const grupos = relatorioPorCategoria([d(1, "food", "USD"), d(1, "food", "EUR"), d(1, "food", "BRL")])
    expect(grupos.map((g) => g.moeda)).toEqual(["BRL", "EUR", "USD"])
  })

  it("conta despesas por categoria", () => {
    const [brl] = relatorioPorCategoria([d(1, "food"), d(1, "food"), d(1, "food"), d(5, "other")])
    expect(brl.categorias.map((c) => [c.categoria, c.quantidade])).toEqual([
      ["other", 1],
      ["food", 3],
    ])
  })

  it("grupo só com despesas de valor zero não divide por zero", () => {
    const [brl] = relatorioPorCategoria([d(0, "food")])
    expect(brl.categorias[0].percentual).toBe(0)
  })
})

describe("rótulos", () => {
  it("as seis categorias têm rótulo pt-BR", () => {
    expect(ROTULOS_CATEGORIA).toEqual({
      accommodation: "Hospedagem",
      transport: "Transporte",
      food: "Alimentação",
      activities: "Atividades",
      shopping: "Compras",
      other: "Outros",
    })
  })

  it("categoria desconhecida aparece com a própria chave", () => {
    expect(rotuloCategoria("souvenir")).toBe("souvenir")
  })
})

describe("formatarPercentual", () => {
  it("uma casa decimal com vírgula", () => {
    expect(formatarPercentual(100)).toBe("100,0%")
    expect(formatarPercentual(1 / 3 * 100)).toBe("33,3%")
  })
})
