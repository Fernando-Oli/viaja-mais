import { test, expect } from "@playwright/test"
import { cadastrar, emailUnico } from "./fixtures/contas"

/**
 * Jornada completa de uma pessoa nova, do cadastro até a publicação, com um
 * screenshot por passo arquivado em docs/pfc/evidencias/ (S11-A-e2e-completo).
 *
 * @RF01.1 registrar-se · @RF03.1 criar viagem · @RF03.5 detalhes da viagem
 * @RF05.1 adicionar atividade · @RF08.4 marcar lugar visitado · @RF07.1 adicionar reserva
 *
 * Os specs de cada funcionalidade já provam os casos de borda; este prova que
 * as telas se encadeiam para alguém que acabou de criar a conta, sem nenhum
 * dado do seed. A viagem e o lugar entram pela API porque o Destino e a busca
 * de lugares dependem do Google Places, que não carrega com a chave de teste.
 *
 * O último passo abre o diálogo "Publicar viagem" e confere que ele mostra a
 * viagem certa. O botão e o título do diálogo são os mesmos na prévia da main
 * e no componente do Micael (PR #51), então o passo vale antes e depois do merge.
 */

test("pessoa nova se cadastra, monta a viagem e chega à publicação", async ({ page }) => {
  const projeto = test.info().project.name
  const foto = (passo: string) =>
    page.screenshot({ path: `docs/pfc/evidencias/S11-A-e2e-completo-${passo}-${projeto}.png`, fullPage: true })
  const sufixo = Date.now()

  // 1. Cadastro pela tela: cai logada no Painel.
  await cadastrar(page, "Júlia Jornada", emailUnico("jornada"))
  await expect(page).toHaveURL(/\/dashboard$/)
  await foto("01-cadastro")

  // 2. Viagem nova; a lista de viagens já mostra a viagem.
  const titulo = `Jornada Recife ${sufixo}`
  const criada = await page.request.post("/api/trips", {
    data: {
      title: titulo,
      destination: "Recife",
      start_date: "2026-12-01",
      end_date: "2026-12-10",
      currency: "BRL",
      status: "planning",
    },
  })
  expect(criada.ok()).toBeTruthy()
  const tripId: string = (await criada.json()).data[0].id

  await page.goto("/dashboard/trips")
  await expect(page.getByText(titulo).first()).toBeVisible()
  await page.goto(`/dashboard/trips/${tripId}`)
  await expect(page.getByRole("heading", { name: titulo }).first()).toBeVisible()
  await foto("02-viagem")

  // 3. Atividade no itinerário, pela tela.
  const atividade = `Praia de Boa Viagem ${sufixo}`
  await page.getByRole("link", { name: "Adicionar Atividade" }).click()
  await page.waitForURL(/\/itinerary\/new$/)
  await page.fill("#title", atividade)
  await page.fill("#date", "2026-12-02")
  await page.fill("#start_time", "09:00")
  await page.fill("#end_time", "12:00")
  await page.fill("#location", "Av. Boa Viagem, Recife")
  await page.getByRole("button", { name: "Salvar Atividade" }).click()
  await page.waitForURL(/\/dashboard\/trips\/[^/]+$/)
  await expect(page.getByRole("heading", { name: atividade })).toBeVisible()
  await foto("03-itinerario")

  // 4. Lugar salvo e marcado como visitado na aba Lugares.
  const lugar = `Marco Zero ${sufixo}`
  const salvo = await page.request.post(`/api/trips/${tripId}/places`, {
    data: {
      name: lugar,
      address: "Praça Rio Branco, Recife - PE",
      latitude: -8.0631,
      longitude: -34.8711,
      category: "Ponto turístico",
    },
  })
  expect(salvo.ok()).toBeTruthy()
  await page.goto(`/dashboard/trips/${tripId}?aba=lugares`)
  const item = page.getByRole("listitem").filter({ hasText: lugar })
  await item.getByRole("button", { name: "Marcar visitado" }).click()
  await expect(page.getByText("Lugar marcado como visitado").first()).toBeVisible()
  await expect(item.getByText("Visitado", { exact: true })).toBeVisible()
  await foto("04-lugares")

  // 5. Reserva pela tela; volta na aba Reservas.
  await page.getByRole("tab", { name: "Reservas" }).click()
  await page.getByRole("link", { name: "Adicionar Reserva" }).click()
  await page.waitForURL(/\/bookings\/new$/)
  const reserva = `Voo GRU-REC ${sufixo}`
  await page.fill("#title", reserva)
  await page.fill("#provider", "LATAM")
  await page.fill("#confirmation_number", "ABC123")
  await page.fill("#start_date", "2026-12-01T10:00")
  await page.fill("#end_date", "2026-12-01T13:05")
  await page.fill("#price", "890.50")
  await page.getByRole("button", { name: "Salvar Reserva" }).click()
  await page.waitForURL(/\?aba=reservas$/)
  await expect(page.getByRole("heading", { name: reserva })).toBeVisible()
  await foto("05-reservas")

  // 6. Publicar: o diálogo abre com a viagem certa e avisa o que nunca sai.
  await page.getByRole("button", { name: "Publicar", exact: true }).click()
  const dialogo = page.getByRole("dialog", { name: "Publicar viagem" })
  await expect(dialogo).toBeVisible()
  await expect(dialogo.getByText(titulo).first()).toBeVisible()
  await foto("06-publicar")
})
