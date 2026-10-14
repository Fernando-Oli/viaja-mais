import { test, expect } from "@playwright/test"

/**
 * @RF06.1 adicionar despesa · @RF06.2 editar despesa · @RF06.3 excluir despesa
 * Fluxo pela UI, com o usuário A do seed, entrando pela aba Despesas da viagem.
 */

test("membro cria, edita e exclui despesa a partir da aba da viagem", async ({ page }) => {
  await page.goto("/auth/login")
  await page.fill("#email", "teste.a@viajamais.local")
  await page.fill("#password", "viajamais123")
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")

  // Só a viagem é criada pela API (o Destino de "Nova Viagem" depende do Google
  // Places). A despesa é criada pela tela: provar o ponto de entrada é o objetivo.
  const sufixo = Date.now()
  const viagem = await page.request.post("/api/trips", {
    data: {
      title: `Viagem com despesas ${sufixo}`,
      destination: "Natal",
      start_date: "2026-12-01",
      end_date: "2026-12-10",
      currency: "BRL",
      status: "planning",
    },
  })
  expect(viagem.ok()).toBeTruthy()
  const tripId: string = (await viagem.json()).data[0].id

  await page.goto(`/dashboard/trips/${tripId}`)
  await page.getByRole("tab", { name: "Despesas" }).click()
  await expect(page.getByText("Nenhuma despesa registrada")).toBeVisible()

  // Criar
  await page.getByRole("link", { name: "Adicionar Despesa" }).click()
  await page.waitForURL(/\/expenses\/new$/)
  const titulo = `Jantar de boas-vindas ${sufixo}`
  await page.fill("#title", titulo)
  await page.fill("#amount", "95.50")
  await page.fill("#date", "2026-12-02")
  await page.getByRole("button", { name: "Salvar Despesa" }).click()

  // Volta direto na aba Despesas, com o valor exatamente como foi digitado.
  await page.waitForURL(/\/dashboard\/trips\/[^/]+\?tab=expenses$/)
  await page.goto(`/dashboard/trips/${tripId}?aba=despesas`)
  await expect(page.getByRole("heading", { name: titulo })).toBeVisible()
  await expect(page.getByText(/95,50/)).toBeVisible()

  const projeto = test.info().project.name
  await page.screenshot({ path: `docs/pfc/evidencias/S03-Ab-despesa-criada-${projeto}.png`, fullPage: true })

  // Editar — pelo href, porque a página também tem o "Editar" da própria viagem.
  await page.locator(`a[href*="/expenses/"][href$="/edit"]`).click()
  await page.waitForURL(/\/expenses\/[^/]+\/edit$/)
  await expect(page.locator("#title")).toHaveValue(titulo)
  await expect(page.locator("#amount")).toHaveValue("95.5")
  const novoTitulo = `Jantar remarcado ${sufixo}`
  await page.fill("#title", novoTitulo)
  await page.fill("#amount", "120")
  await page.getByRole("button", { name: "Salvar alterações" }).click()
  await page.waitForURL(/\?aba=despesas$/)
  await expect(page.getByRole("heading", { name: novoTitulo })).toBeVisible()
  await expect(page.getByText(/120,00/)).toBeVisible()

  // Excluir: cancelar no modal mantém a despesa; confirmar remove.
  await page.getByRole("button", { name: "Excluir" }).click()
  const modal = page.getByRole("alertdialog")
  await expect(modal).toBeVisible()
  await modal.getByRole("button", { name: "Cancelar" }).click()
  await expect(page.getByRole("heading", { name: novoTitulo })).toBeVisible()

  await page.getByRole("button", { name: "Excluir" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click()
  await expect(page.getByRole("heading", { name: novoTitulo })).toHaveCount(0)
  await expect(page.getByText("Nenhuma despesa registrada")).toBeVisible()

  await page.screenshot({ path: `docs/pfc/evidencias/S03-Ab-despesa-excluida-${projeto}.png`, fullPage: true })
})
