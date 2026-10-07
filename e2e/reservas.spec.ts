import { test, expect } from "@playwright/test"

/**
 * @RF07.1 adicionar reserva · @RF07.5 editar reserva · @RF07.6 excluir reserva · @RF07.7 visualizar reservas
 * Fluxo pela UI, com o usuário A do seed, entrando pela aba Reservas da viagem.
 */

test("membro cria, edita e exclui reserva a partir da aba da viagem", async ({ page }) => {
  await page.goto("/auth/login")
  await page.fill("#email", "teste.a@viajamais.local")
  await page.fill("#password", "viajamais123")
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")

  // Só a viagem é criada pela API (o Destino de "Nova Viagem" depende do Google
  // Places). A reserva é criada pela tela: provar o ponto de entrada é o objetivo.
  const sufixo = Date.now()
  const viagem = await page.request.post("/api/trips", {
    data: {
      title: `Viagem com reservas ${sufixo}`,
      destination: "Recife",
      start_date: "2026-12-01",
      end_date: "2026-12-10",
      currency: "BRL",
      status: "planning",
    },
  })
  expect(viagem.ok()).toBeTruthy()
  const tripId: string = (await viagem.json()).data[0].id

  await page.goto(`/dashboard/trips/${tripId}`)
  await page.getByRole("tab", { name: "Reservas" }).click()
  await expect(page.getByText("Nenhuma reserva cadastrada")).toBeVisible()

  // Criar
  await page.getByRole("link", { name: "Adicionar Reserva" }).click()
  await page.waitForURL(/\/bookings\/new$/)
  const titulo = `Voo GRU-REC ${sufixo}`
  await page.fill("#title", titulo)
  await page.fill("#provider", "LATAM")
  await page.fill("#confirmation_number", "ABC123")
  await page.fill("#start_date", "2026-12-01T10:00")
  await page.fill("#end_date", "2026-12-01T13:05")
  await page.fill("#price", "890.50")
  await page.getByRole("button", { name: "Salvar Reserva" }).click()

  // Volta direto na aba Reservas, com a hora exatamente como foi digitada.
  await page.waitForURL(/\/dashboard\/trips\/[^/]+\?aba=reservas$/)
  await expect(page.getByRole("heading", { name: titulo })).toBeVisible()
  await expect(page.getByText("01/12/2026 10:00 - 01/12/2026 13:05")).toBeVisible()

  const projeto = test.info().project.name
  await page.screenshot({ path: `docs/pfc/evidencias/S05-A-reservas-criada-${projeto}.png`, fullPage: true })

  // Editar — pelo href, porque a página também tem o "Editar" da própria viagem.
  await page.locator(`a[href*="/bookings/"][href$="/edit"]`).click()
  await page.waitForURL(/\/bookings\/[^/]+\/edit$/)
  await expect(page.locator("#title")).toHaveValue(titulo)
  await expect(page.locator("#start_date")).toHaveValue("2026-12-01T10:00")
  const novoTitulo = `Voo remarcado ${sufixo}`
  await page.fill("#title", novoTitulo)
  await page.locator("#status").click()
  await page.getByRole("option", { name: "Pendente" }).click()
  await page.getByRole("button", { name: "Salvar alterações" }).click()
  await page.waitForURL(/\?aba=reservas$/)
  await expect(page.getByRole("heading", { name: novoTitulo })).toBeVisible()
  await expect(page.getByText("Pendente", { exact: true })).toBeVisible()

  // Excluir: cancelar no modal mantém a reserva; confirmar remove.
  await page.getByRole("button", { name: "Excluir" }).click()
  const modal = page.getByRole("alertdialog")
  await expect(modal).toBeVisible()
  await modal.getByRole("button", { name: "Cancelar" }).click()
  await expect(page.getByRole("heading", { name: novoTitulo })).toBeVisible()

  await page.getByRole("button", { name: "Excluir" }).click()
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click()
  await expect(page.getByRole("heading", { name: novoTitulo })).toHaveCount(0)
  await expect(page.getByText("Nenhuma reserva cadastrada")).toBeVisible()

  await page.screenshot({ path: `docs/pfc/evidencias/S05-A-reservas-excluida-${projeto}.png`, fullPage: true })
})
