import { test, expect, entrar } from "./fixtures/contas"

/**
 * @RNF04.4 falha vira mensagem compreensível, nunca tela em branco
 * @RNF02.4 o 404 não revela se a viagem existe
 *
 * As telas de "não encontrado" do Next, montadas de verdade (S07-F). Antes:
 * endereço inexistente caía na página padrão do Next, em inglês, e viagem
 * inexistente ou alheia mandava de volta para a lista sem explicar nada.
 *
 * A tela de erro inesperado (error.tsx) não tem como ser disparada de fora
 * sem quebrar o banco; o que ela mostra é provado em
 * tests/components/estado-erro.test.tsx.
 */

const projeto = () => test.info().project.name

test("sem sessão, endereço que não existe vai para o login (lista branca do proxy)", async ({ page }) => {
  await page.goto("/esse-endereco-nao-existe")

  await expect(page).toHaveURL(/\/auth\/login$/)
})

test("com sessão, endereço que não existe: 404 em português, com caminho de volta", async ({ dona }) => {
  const { page } = dona

  const resposta = await page.goto("/esse-endereco-nao-existe")

  expect(resposta?.status()).toBe(404)
  await expect(page.getByText("Página não encontrada")).toBeVisible()
  await expect(page.getByText(/não existe, ou você não tem acesso/)).toBeVisible()
  await page.getByRole("link", { name: "Ir para o início" }).click()
  await expect(page).not.toHaveURL(/esse-endereco-nao-existe/)
})

test("viagem que não existe: 404 dentro do dashboard, sem perder a navegação", async ({ dona }) => {
  const { page } = dona

  await page.goto("/dashboard/trips/00000000-0000-4000-8000-000000000000")

  await expect(page.getByText("Página não encontrada")).toBeVisible()
  // O layout do dashboard continua: a barra lateral está lá.
  await expect(page.getByRole("link", { name: "Minhas Viagens" }).first()).toBeVisible()
  await page.screenshot({ path: `docs/pfc/evidencias/S07-F-nao-encontrado-${projeto()}.png`, fullPage: true })

  await page.getByRole("link", { name: "Ver minhas viagens" }).click()
  await expect(page).toHaveURL("/dashboard/trips")
})

test("viagem de outra pessoa: o mesmo 404, sem revelar que ela existe", async ({ dona, browser }) => {
  const viagem = await dona.page.request.post("/api/trips", {
    data: {
      title: `Viagem só da Ana ${Date.now()}`,
      destination: "Pirenópolis",
      start_date: "2026-12-01",
      end_date: "2026-12-05",
      currency: "BRL",
      status: "planning",
    },
  })
  expect(viagem.ok()).toBeTruthy()
  const tripId: string = (await viagem.json()).data[0].id

  const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "pt-BR" })
  const bruno = await contexto.newPage()
  await entrar(bruno, "teste.b@viajamais.local")

  await bruno.goto(`/dashboard/trips/${tripId}`)

  await expect(bruno.getByText("Página não encontrada")).toBeVisible()
  await expect(bruno.getByText("Viagem só da Ana")).toHaveCount(0)
  await contexto.close()
})
