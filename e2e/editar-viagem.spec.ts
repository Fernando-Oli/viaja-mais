import { test, expect } from "@playwright/test"

/** @RF03.2 editar viagem — fluxo completo pela UI, com o usuário A do seed. */

test("dono edita título e destino da viagem", async ({ page }) => {
  await page.goto("/auth/login")
  await page.fill("#email", "teste.a@viajamais.local")
  await page.fill("#password", "viajamais123")
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")

  // Pré-condição criada pela API, não pela tela: o campo Destino de "Nova Viagem"
  // é o autocomplete do Google Places, que não responde com a chave placeholder
  // do ambiente local/CI. O que este teste prova é a edição, feita toda pela UI.
  // Título único por execução: uma rodada que falhe no meio não deixa homônimo.
  const sufixo = Date.now()
  const criada = await page.request.post("/api/trips", {
    data: {
      title: `Viagem para editar ${sufixo}`,
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
  await page.getByRole("link", { name: "Editar" }).click()
  await page.waitForURL(/\/edit$/)

  await page.fill("#title", `Viagem editada ${sufixo}`)
  await page.fill("#destination", "Salvador")
  await page.getByRole("button", { name: "Salvar alterações" }).click()

  await page.waitForURL(/\/dashboard\/trips\/[^/]+$/)
  await expect(page.getByRole("heading", { name: `Viagem editada ${sufixo}` })).toBeVisible()
  await expect(page.getByText("Salvador")).toBeVisible()

  // Um arquivo por projeto (chromium, mobile): o mesmo nome faria o segundo sobrescrever o primeiro.
  const projeto = test.info().project.name
  await page.screenshot({ path: `docs/pfc/evidencias/S03-A-editar-viagem-${projeto}.png`, fullPage: true })
})
