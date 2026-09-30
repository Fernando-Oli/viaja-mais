import { test, expect } from "@playwright/test"

/** @RF05.2 editar/concluir atividade · @RF05.3 excluir atividade — fluxo pela UI, com o usuário A do seed. */

test("membro conclui, edita e exclui atividade do itinerário", async ({ page }) => {
  await page.goto("/auth/login")
  await page.fill("#email", "teste.a@viajamais.local")
  await page.fill("#password", "viajamais123")
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")

  // Pré-condições pela API: criar viagem e atividade já têm E2E próprios
  // (editar-viagem.spec.ts e adicionar-atividade.spec.ts).
  const sufixo = Date.now()
  const viagem = await page.request.post("/api/trips", {
    data: {
      title: `Viagem do roteiro ${sufixo}`,
      destination: "Recife",
      start_date: "2026-12-01",
      end_date: "2026-12-10",
      currency: "BRL",
      status: "planning",
    },
  })
  expect(viagem.ok()).toBeTruthy()
  const tripId: string = (await viagem.json()).data[0].id

  const titulo = `Marco Zero ${sufixo}`
  const atividade = await page.request.post(`/api/trips/${tripId}/itinerary`, {
    data: { title: titulo, date: "2026-12-02", start_time: "09:00", end_time: "11:00", location: "Recife Antigo" },
  })
  expect(atividade.ok()).toBeTruthy()

  await page.goto(`/dashboard/trips/${tripId}`)
  await expect(page.getByRole("heading", { name: titulo })).toBeVisible()

  // Concluir: o item passa a se distinguir (selo, título riscado) e o botão vira "Reabrir".
  await page.getByRole("button", { name: "Concluir" }).click()
  await expect(page.getByText("Concluída", { exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: titulo })).toHaveClass(/line-through/)
  await expect(page.getByRole("button", { name: "Reabrir" })).toBeVisible()

  const projeto = test.info().project.name
  await page.screenshot({ path: `docs/pfc/evidencias/S04-A-itinerario-concluida-${projeto}.png`, fullPage: true })

  await page.getByRole("button", { name: "Reabrir" }).click()
  await expect(page.getByRole("button", { name: "Concluir" })).toBeVisible()
  await expect(page.getByText("Concluída", { exact: true })).toHaveCount(0)

  // Editar — pelo href, porque a página também tem o "Editar" da própria viagem.
  await page.locator(`a[href*="/itinerary/"][href$="/edit"]`).click()
  await page.waitForURL(/\/itinerary\/[^/]+\/edit$/)
  const novoTitulo = `Paço do Frevo ${sufixo}`
  await page.fill("#title", novoTitulo)
  await page.fill("#location", "Praça do Arsenal")
  await page.getByRole("button", { name: "Salvar alterações" }).click()
  await page.waitForURL(/\/dashboard\/trips\/[^/]+$/)
  await expect(page.getByRole("heading", { name: novoTitulo })).toBeVisible()
  await expect(page.getByText("Praça do Arsenal")).toBeVisible()

  // Excluir: cancelar no modal mantém o item; confirmar remove.
  await page.getByRole("button", { name: "Excluir" }).click()
  const modal = page.getByRole("alertdialog")
  await expect(modal).toBeVisible()
  await modal.getByRole("button", { name: "Cancelar" }).click()
  await expect(page.getByRole("heading", { name: novoTitulo })).toBeVisible()

  await page.getByRole("button", { name: "Excluir" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click()
  await expect(page.getByRole("heading", { name: novoTitulo })).toHaveCount(0)
  await expect(page.getByText("Nenhuma atividade planejada")).toBeVisible()

  await page.screenshot({ path: `docs/pfc/evidencias/S04-A-itinerario-excluida-${projeto}.png`, fullPage: true })
})
