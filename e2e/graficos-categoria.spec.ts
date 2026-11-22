import { test, expect, idDe } from "./fixtures/contas"
import { semRolagemHorizontal, texto, vigiarDialogos } from "./fixtures/financeiro"
import type { APIRequestContext, Page } from "@playwright/test"

/**
 * @RF06.5 visualizar gastos por categoria
 *
 * Relatório por categoria da área financeira (`/dashboard/finances`, aba
 * "Por Categoria"): gráfico de barras do Recharts e tabela, um bloco por
 * moeda. A conta é recém-cadastrada (fixture `convidado`), para o relatório
 * conter só o que o teste lançou — e para provar o estado vazio antes.
 *
 * Duas viagens, uma em real e outra em dólar, para o cenário multi-moeda:
 *   BRL: Hotel Hospedagem 300 · Jantar Alimentação 100 · Ônibus Transporte 50
 *   USD: Hostel Hospedagem 100
 * Hospedagem aparece nas duas moedas e não pode virar "400".
 *
 * Viagem e despesas entram pela API: o que está sob teste é o relatório, e o
 * lançamento pela tela já tem spec própria (`rateio-despesa`, `financeiro-jornada`).
 */

const projeto = () => test.info().project.name
const evidencia = (cenario: string) => `docs/pfc/evidencias/S09-Ab-graficos-${cenario}-${projeto()}.png`

async function criarViagem(api: APIRequestContext, titulo: string, moeda: string) {
  const resposta = await api.post("/api/trips", {
    data: {
      title: titulo,
      destination: "Pirenópolis",
      start_date: "2026-12-01",
      end_date: "2026-12-05",
      currency: moeda,
      status: "planning",
    },
  })
  expect(resposta.ok(), `viagem ${titulo}`).toBeTruthy()
  return (await resposta.json()).data[0].id as string
}

async function lancar(
  api: APIRequestContext,
  tripId: string,
  eu: string,
  despesa: { titulo: string; valor: number; moeda: string; categoria: string },
) {
  const resposta = await api.post(`/api/trips/${tripId}/expenses`, {
    data: {
      title: despesa.titulo,
      amount: despesa.valor,
      currency: despesa.moeda,
      category: despesa.categoria,
      date: "2026-12-02",
      rateio: { tipo: "equal", participantes: [{ user_id: eu }] },
    },
  })
  expect(resposta.status(), `despesa ${despesa.titulo}`).toBe(200)
}

async function abrirPorCategoria(page: Page) {
  await page.goto("/dashboard/finances")
  await expect(page.getByRole("heading", { name: "Controle Financeiro" })).toBeVisible()
  await page.getByRole("tab", { name: "Por Categoria" }).click()
  await expect(page.getByRole("tab", { name: "Por Categoria" })).toHaveAttribute("aria-selected", "true")
}

async function linhasDaTabela(bloco: ReturnType<Page["getByTestId"]>) {
  const linhas = bloco.getByTestId("linha-categoria")
  const n = await linhas.count()
  const resultado: string[][] = []
  for (let i = 0; i < n; i++) {
    // Só as células visíveis: a coluna "Despesas" some no celular.
    const celulas = linhas.nth(i).locator("th:visible, td:visible")
    resultado.push((await celulas.allTextContents()).map((t) => texto(t) ?? ""))
  }
  return resultado
}

test.describe("relatório por categoria", () => {
  test.describe.configure({ timeout: 90_000 })

  test("conta sem despesas: estado vazio na aba Por Categoria", async ({ convidado }) => {
    const { page } = convidado
    const dialogos = vigiarDialogos(page)

    await abrirPorCategoria(page)

    await expect(page.getByText("Nenhuma despesa por categoria")).toBeVisible()
    await expect(page.getByText("Registre despesas para ver a distribuição")).toBeVisible()
    await expect(page.getByTestId("grafico-categoria")).toHaveCount(0)
    await expect(page.getByTestId("categoria-principal")).toHaveText("-")
    await semRolagemHorizontal(page)
    await page.screenshot({ path: evidencia("vazio"), fullPage: true })

    expect(dialogos).toEqual([])
  })

  test("gráfico e tabela por moeda, ordenados, sem somar real com dólar", async ({ convidado }) => {
    const { page, email } = convidado
    const dialogos = vigiarDialogos(page)
    const api = page.request
    const eu = await idDe(email)
    const sufixo = Date.now()

    const viagemBRL = await criarViagem(api, `Categorias BRL ${sufixo}`, "BRL")
    const viagemUSD = await criarViagem(api, `Categorias USD ${sufixo}`, "USD")
    await lancar(api, viagemBRL, eu, { titulo: "Ônibus", valor: 50, moeda: "BRL", categoria: "transport" })
    await lancar(api, viagemBRL, eu, { titulo: "Hotel", valor: 300, moeda: "BRL", categoria: "accommodation" })
    await lancar(api, viagemBRL, eu, { titulo: "Jantar", valor: 100, moeda: "BRL", categoria: "food" })
    await lancar(api, viagemUSD, eu, { titulo: "Hostel", valor: 100, moeda: "USD", categoria: "accommodation" })

    await abrirPorCategoria(page)

    const blocos = page.getByTestId("relatorio-moeda")
    await expect(blocos).toHaveCount(2)
    await expect(page.getByText(/Valores separados por moeda/)).toBeVisible()

    // BRL: maior gasto primeiro, valores e participação sobre o total em real.
    const brl = blocos.nth(0)
    await expect(brl.getByRole("heading", { name: "BRL" })).toBeVisible()
    await expect(brl.getByText(/Total\s+R\$\s450,00\s+·\s+3 despesas/)).toBeVisible()
    const celulasBRL = await linhasDaTabela(brl)
    expect(celulasBRL.map((l) => [l[0], ...l.slice(-2)])).toEqual([
      ["Hospedagem", "R$ 300,00", "66,7%"],
      ["Alimentação", "R$ 100,00", "22,2%"],
      ["Transporte", "R$ 50,00", "11,1%"],
    ])

    // O gráfico do Recharts está desenhado: três barras, rótulo com valor e %.
    const graficoBRL = brl.getByTestId("grafico-categoria")
    await expect(graficoBRL.locator("svg.recharts-surface")).toBeVisible()
    await expect(graficoBRL.locator(".recharts-bar-rectangle")).toHaveCount(3)
    const eixo = (await graficoBRL.locator(".recharts-yAxis .recharts-cartesian-axis-tick-value").allTextContents()).map(
      (t) => texto(t),
    )
    expect(eixo).toEqual(["Hospedagem", "Alimentação", "Transporte"])
    const rotulos = (await graficoBRL.locator(".recharts-label-list text").allTextContents()).map((t) => texto(t))
    expect(rotulos).toEqual(["R$ 300,00 · 66,7%", "R$ 100,00 · 22,2%", "R$ 50,00 · 11,1%"])

    // Dica ao passar o ponteiro na maior barra.
    await graficoBRL.locator(".recharts-bar-rectangle").first().hover()
    const dica = graficoBRL.locator(".recharts-tooltip-wrapper")
    await expect(dica).toContainText("Hospedagem")
    await expect(dica).toContainText(/R\$\s300,00/)
    await expect(dica).toContainText("66,7% do total em BRL")

    // USD: bloco próprio, escala própria; Hospedagem em dólar não se soma à de real.
    const usd = blocos.nth(1)
    await expect(usd.getByRole("heading", { name: "USD" })).toBeVisible()
    const celulasUSD = await linhasDaTabela(usd)
    expect(celulasUSD.map((l) => [l[0], ...l.slice(-2)])).toEqual([["Hospedagem", "US$ 100,00", "100,0%"]])
    await expect(usd.getByTestId("grafico-categoria").locator(".recharts-bar-rectangle")).toHaveCount(1)

    await expect(page.getByRole("tabpanel")).not.toContainText(/400,00/)

    // Card "Categoria Principal": a principal de cada moeda.
    await expect(page.getByTestId("categoria-principal")).toHaveText(/Hospedagem\s*BRL\s*Hospedagem\s*USD/)

    await semRolagemHorizontal(page)
    await page.mouse.move(0, 0)
    await page.screenshot({ path: evidencia("categorias"), fullPage: true })

    expect(dialogos).toEqual([])
  })
})
