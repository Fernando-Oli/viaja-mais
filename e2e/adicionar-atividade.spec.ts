import { test, expect } from "@playwright/test"

/** @RF05.1 adicionar atividade ao itinerário — fluxo pela UI, com o usuário A do seed. */

test("membro adiciona atividade ao itinerário da viagem", async ({ page }) => {
  await page.goto("/auth/login")
  await page.fill("#email", "teste.a@viajamais.local")
  await page.fill("#password", "viajamais123")
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")

  // Pré-condição pela API, pelo mesmo motivo de editar-viagem.spec.ts: o Destino
  // de "Nova Viagem" depende do Google Places.
  const sufixo = Date.now()
  const criada = await page.request.post("/api/trips", {
    data: {
      title: `Viagem com roteiro ${sufixo}`,
      destination: "Recife",
      start_date: "2026-12-01",
      end_date: "2026-12-10",
      currency: "BRL",
      status: "planning",
    },
  })
  expect(criada.ok()).toBeTruthy()
  const { data } = await criada.json()
  const tripId: string = data[0].id

  await page.goto(`/dashboard/trips/${tripId}`)
  await page.getByRole("link", { name: "Adicionar Atividade" }).click()
  await page.waitForURL(/\/itinerary\/new$/)

  const atividade = `Praia de Boa Viagem ${sufixo}`
  await page.fill("#title", atividade)
  await page.fill("#date", "2026-12-02")
  await page.fill("#start_time", "09:00")
  await page.fill("#end_time", "12:00")
  await page.fill("#location", "Av. Boa Viagem, Recife")
  await page.getByRole("button", { name: "Salvar Atividade" }).click()

  await page.waitForURL(/\/dashboard\/trips\/[^/]+$/)
  await expect(page.getByRole("heading", { name: atividade })).toBeVisible()

  const projeto = test.info().project.name
  await page.screenshot({ path: `docs/pfc/evidencias/S03-A-adicionar-atividade-${projeto}.png`, fullPage: true })
})
