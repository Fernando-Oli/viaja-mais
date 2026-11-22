// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { FinanceCategoryChart } from "@/components/finance-category-chart"
import { relatorioPorCategoria } from "@/lib/finance/categorias"

/**
 * Relatório por categoria da área financeira: estado vazio, um bloco por moeda
 * e a tabela textual na ordem do relatório. O desenho do gráfico depende do
 * tamanho real do contêiner, que o jsdom não tem — ele é provado no E2E. Aqui
 * se prova o contêiner do gráfico, com a descrição acessível, e a tabela.
 *
 * @RF06.5 visualizar gastos por categoria
 */

beforeAll(() => {
  // O ResponsiveContainer do Recharts observa o tamanho do contêiner.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

const espacos = (s: string | null) => s?.replace(/\s+/g, " ").trim()

function linhas(bloco: HTMLElement) {
  return within(bloco)
    .getAllByTestId("linha-categoria")
    .map((tr) => [...tr.querySelectorAll("th, td")].map((c) => espacos(c.textContent)))
}

describe("FinanceCategoryChart", () => {
  it("sem despesas mostra o estado vazio e nenhum gráfico", () => {
    render(<FinanceCategoryChart relatorios={[]} />)

    expect(screen.getByText("Nenhuma despesa por categoria")).toBeInTheDocument()
    expect(screen.getByText("Registre despesas para ver a distribuição")).toBeInTheDocument()
    expect(screen.queryByTestId("grafico-categoria")).toBeNull()
  })

  it("um bloco por moeda, sem somar moedas diferentes", () => {
    const relatorios = relatorioPorCategoria([
      { amount: 300, category: "accommodation", currency: "BRL" },
      { amount: 100, category: "food", currency: "BRL" },
      { amount: 50, category: "transport", currency: "BRL" },
      { amount: 100, category: "accommodation", currency: "USD" },
    ])
    render(<FinanceCategoryChart relatorios={relatorios} />)

    const blocos = screen.getAllByTestId("relatorio-moeda")
    expect(blocos).toHaveLength(2)
    expect(screen.getByText(/Valores separados por moeda/)).toBeInTheDocument()

    const [brl, usd] = blocos
    expect(within(brl).getByRole("heading", { name: "BRL" })).toBeInTheDocument()
    expect(linhas(brl)).toEqual([
      ["Hospedagem", "1", "R$ 300,00", "66,7%"],
      ["Alimentação", "1", "R$ 100,00", "22,2%"],
      ["Transporte", "1", "R$ 50,00", "11,1%"],
    ])
    const total = [...brl.querySelectorAll("tfoot th, tfoot td")].map((c) => espacos(c.textContent))
    expect(total).toEqual(["Total", "3", "R$ 450,00", "100,0%"])

    expect(within(usd).getByRole("heading", { name: "USD" })).toBeInTheDocument()
    expect(linhas(usd)).toEqual([["Hospedagem", "1", "US$ 100,00", "100,0%"]])

    expect(document.body.textContent).not.toMatch(/400,00/)
  })

  it("o gráfico de cada moeda tem descrição com categoria, valor e participação", () => {
    const relatorios = relatorioPorCategoria([
      { amount: 30, category: "food", currency: "EUR" },
      { amount: 10, category: "shopping", currency: "EUR" },
    ])
    render(<FinanceCategoryChart relatorios={relatorios} />)

    const grafico = screen.getByRole("img", { name: /em EUR/ })
    expect(espacos(grafico.getAttribute("aria-label"))).toBe(
      "Gráfico de gastos por categoria em EUR. Alimentação: € 30,00, 75,0%; Compras: € 10,00, 25,0%",
    )
    // Uma moeda só: sem o aviso de separação.
    expect(screen.queryByText(/Valores separados por moeda/)).toBeNull()
  })
})
