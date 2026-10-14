import { test, expect } from "@playwright/test"

/**
 * @RF08.4 marcar visitado · @RF08.6 excluir lugar
 * Fluxo pela UI, com o usuário A do seed, entrando pela aba Lugares da viagem.
 */

test("membro marca lugar como visitado, o estado persiste, e exclui o lugar", async ({ page }) => {
  await page.goto("/auth/login")
  await page.fill("#email", "teste.a@viajamais.local")
  await page.fill("#password", "viajamais123")
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")

  // Viagem e lugar são criados pela API: a busca de lugares depende do Google
  // Places, que não carrega com a chave de teste. O que se prova aqui é a tela.
  const sufixo = Date.now()
  const viagem = await page.request.post("/api/trips", {
    data: {
      title: `Viagem com lugares ${sufixo}`,
      destination: "Recife",
      start_date: "2026-12-01",
      end_date: "2026-12-10",
      currency: "BRL",
      status: "planning",
    },
  })
  expect(viagem.ok()).toBeTruthy()
  const tripId: string = (await viagem.json()).data[0].id

  const nome = `Marco Zero ${sufixo}`
  const lugar = await page.request.post(`/api/trips/${tripId}/places`, {
    data: {
      name: nome,
      address: "Praça Rio Branco, Recife - PE",
      latitude: -8.0631,
      longitude: -34.8711,
      category: "Ponto turístico",
      notes: "Ir no fim da tarde",
    },
  })
  expect(lugar.ok()).toBeTruthy()

  await page.goto(`/dashboard/trips/${tripId}?aba=lugares`)
  const item = page.getByRole("listitem").filter({ hasText: nome })
  await expect(item).toBeVisible()
  await expect(item.getByText("Visitado", { exact: true })).toHaveCount(0)

  // Marcar visitado: o selo aparece e um toast confirma.
  await item.getByRole("button", { name: "Marcar visitado" }).click()
  await expect(page.getByText("Lugar marcado como visitado").first()).toBeVisible()
  await expect(item.getByText("Visitado", { exact: true })).toBeVisible()

  // Persiste: depois de recarregar, o selo continua lá.
  await page.reload()
  await expect(item.getByText("Visitado", { exact: true })).toBeVisible()
  await expect(item.getByRole("button", { name: "Desmarcar visitado" })).toHaveAttribute("aria-pressed", "true")

  const projeto = test.info().project.name
  await page.screenshot({ path: `docs/pfc/evidencias/S06-A-lugares-visitado-${projeto}.png`, fullPage: true })

  // A tela "Lugares da Viagem" mostra o mesmo estado, lido pela API.
  await page.getByRole("link", { name: "Adicionar Lugar" }).click()
  await page.waitForURL(/\/places$/)
  const naTela = page.getByRole("listitem").filter({ hasText: nome })
  await expect(naTela.getByText("Visitado", { exact: true })).toBeVisible()

  // Desmarcar também persiste.
  await naTela.getByRole("button", { name: "Desmarcar visitado" }).click()
  await expect(naTela.getByText("Visitado", { exact: true })).toHaveCount(0)
  await page.reload()
  await expect(naTela.getByRole("button", { name: "Marcar visitado" })).toBeVisible()

  // Excluir: cancelar no modal mantém o lugar; confirmar remove.
  await naTela.getByRole("button", { name: `Excluir ${nome}` }).click()
  const modal = page.getByRole("alertdialog")
  await expect(modal).toBeVisible()
  await modal.getByRole("button", { name: "Cancelar" }).click()
  await expect(naTela).toBeVisible()

  await naTela.getByRole("button", { name: `Excluir ${nome}` }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click()
  await expect(page.getByText("Lugar removido").first()).toBeVisible()
  await expect(page.getByRole("listitem").filter({ hasText: nome })).toHaveCount(0)
  await expect(page.getByText("Nenhum lugar salvo")).toBeVisible()

  await page.screenshot({ path: `docs/pfc/evidencias/S06-A-lugares-excluido-${projeto}.png`, fullPage: true })
})
