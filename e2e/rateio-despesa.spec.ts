import { test, expect, type Browser, type Page, type Response } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import { exigirLocal } from "../tests/rls/guarda-ambiente"

/**
 * @RF06.9 tipo de rateio: igual, por peso ou por valor exato
 * @RF06.10 valor devido por membro (`expense_shares`)
 *
 * Rateio na criação da despesa, pela tela, com uma viagem de três membros
 * reais: Ana (seed, dona), Bruno (seed) e uma terceira conta criada pelo
 * cadastro — o seed só tem duas, e "R$ 10,00 entre 3" precisa de três.
 * Bruno e a terceira conta entram como membros pela dona (ver `adicionarMembros`).
 *
 * Cada cenário confere a prévia na tela E o que o servidor gravou: as partes
 * devolvidas pelo POST são as recalculadas no servidor, não as do navegador.
 */

const SENHA = "viajamais123"
let tripId = ""

async function entrar(page: Page, email: string) {
  await page.goto("/auth/login")
  await page.fill("#email", email)
  await page.fill("#password", SENHA)
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")
}

/** Cliente Supabase com a sessão de quem entrou, sob RLS — como nos testes de RLS. */
async function logar(email: string) {
  const url = exigirLocal(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", "NEXT_PUBLIC_SUPABASE_URL")
  const cliente = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await cliente.auth.signInWithPassword({ email, password: SENHA })
  if (error) throw new Error(`falha ao logar como ${email}: ${error.message}`)
  return { cliente, id: data.user.id }
}

/**
 * Os membros entram pela dona, direto em `trip_members` sob a policy
 * `trip_members_insert` (`is_trip_owner`) — o mesmo preparo de
 * `tests/rls/02-rateio.test.ts`. O caminho do convite não serve aqui:
 * `POST /api/invitations/[id]/accept` lê o convite com `trips!inner`, e quem
 * ainda não é membro não enxerga a viagem pela RLS de `trips`, então o aceite
 * devolve 404 (PGRST116). Isso é defeito do RF04, fora do escopo do rateio.
 */
async function adicionarMembros(emails: string[]) {
  const ana = await logar("teste.a@viajamais.local")
  for (const email of emails) {
    const { id } = await logar(email)
    const { error } = await ana.cliente.from("trip_members").insert({ trip_id: tripId, user_id: id, role: "member" })
    if (error) throw new Error(`Ana não conseguiu adicionar ${email}: ${error.message}`)
  }
}

async function montarViagemComTresMembros(browser: Browser) {
  const sufixo = Date.now()
  const emailC = `rateio.c.${sufixo}@viajamais.local`

  // Terceira conta pelo cadastro (sem confirmação de e-mail no ambiente local):
  // o seed só tem duas e o rateio precisa de três pessoas reais.
  const ctxC = await browser.newContext()
  const pageC = await ctxC.newPage()
  await pageC.goto("/auth/sign-up")
  await pageC.fill("#fullName", "Carla Rateio")
  await pageC.fill("#email", emailC)
  await pageC.fill("#password", SENHA)
  await pageC.fill("#confirmPassword", SENHA)
  await pageC.click('button[type="submit"]')
  await pageC.waitForURL("/dashboard")

  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()
  await entrar(pageA, "teste.a@viajamais.local")
  const viagem = await pageA.request.post("/api/trips", {
    data: {
      title: `Viagem com rateio ${sufixo}`,
      destination: "Pirenópolis",
      start_date: "2026-12-01",
      end_date: "2026-12-05",
      currency: "BRL",
      status: "planning",
    },
  })
  expect(viagem.ok()).toBeTruthy()
  tripId = (await viagem.json()).data[0].id

  await adicionarMembros(["teste.b@viajamais.local", emailC])

  await Promise.all([ctxA.close(), ctxC.close()])
}

/** Abre a nova despesa como Ana e falha o teste se surgir qualquer diálogo nativo. */
async function abrirNovaDespesa(page: Page) {
  const dialogos: string[] = []
  page.on("dialog", async (d) => {
    dialogos.push(`${d.type()}: ${d.message()}`)
    await d.dismiss()
  })

  await entrar(page, "teste.a@viajamais.local")
  await page.goto(`/dashboard/trips/${tripId}?aba=despesas`)
  await page.getByRole("link", { name: "Adicionar Despesa" }).click()
  await page.waitForURL(/\/expenses\/new$/)
  await expect(page.getByTestId("participante-rateio")).toHaveCount(3)
  return dialogos
}

async function preencher(page: Page, titulo: string, valor: string) {
  await page.fill("#title", titulo)
  await page.fill("#amount", valor)
}

const partes = (page: Page) => page.getByTestId("parte-rateio")
const salvar = (page: Page) => page.getByRole("button", { name: "Salvar Despesa" })
const projeto = () => test.info().project.name

async function salvarEConferir(page: Page, esperado: number[], total: number) {
  const respostaPost = page.waitForResponse(
    (r: Response) => r.url().endsWith(`/api/trips/${tripId}/expenses`) && r.request().method() === "POST",
  )
  await salvar(page).click()
  const resposta = await respostaPost
  expect(resposta.status()).toBe(200)

  const { shares } = (await resposta.json()) as { shares: { amount: number }[] }
  const gravado = shares.map((s) => Number(s.amount))
  expect(gravado).toEqual(esperado)
  expect(Math.round(gravado.reduce((a, b) => a + b, 0) * 100)).toBe(Math.round(total * 100))

  await page.waitForURL(/\?aba=despesas$/)
  await expect(page.getByText("Despesa adicionada").first()).toBeVisible()
}

test.describe.serial("rateio na criação da despesa", () => {
  test.beforeAll(async ({ browser }) => {
    await montarViagemComTresMembros(browser)
  })

  test("divisão igual: R$ 10,00 entre 3 fecha em 3,34 + 3,33 + 3,33", async ({ page }) => {
    const dialogos = await abrirNovaDespesa(page)
    await preencher(page, "Pizza do grupo", "10.00")

    await expect(page.getByRole("radio", { name: "Igual" })).toBeChecked()
    await expect(partes(page)).toHaveText([/R\$\s3,34/, /R\$\s3,33/, /R\$\s3,33/])
    await expect(page.getByTestId("rateio-soma")).toHaveText(/R\$\s10,00/)
    await expect(page.getByText("A soma das partes fecha com o total.")).toBeVisible()
    await expect(salvar(page)).toBeEnabled()

    await page.screenshot({ path: `docs/pfc/evidencias/S06-Ab-rateio-ui-igual-${projeto()}.png`, fullPage: true })

    await salvarEConferir(page, [3.34, 3.33, 3.33], 10)
    expect(dialogos).toEqual([])
  })

  test("divisão por peso: peso zero bloqueia; pesos 2, 1, 1 dividem R$ 100,00 em 50, 25, 25", async ({ page }) => {
    const dialogos = await abrirNovaDespesa(page)
    await preencher(page, "Quarto de hotel", "100")
    await page.getByRole("radio", { name: "Por peso" }).click()

    const pesoVoce = page.getByLabel("Peso de Você")
    await pesoVoce.fill("0")
    await expect(pesoVoce).toHaveAttribute("aria-invalid", "true")
    await expect(page.locator("#rateio-status")).toContainText("peso maior que zero")
    await expect(salvar(page)).toBeDisabled()

    await pesoVoce.fill("2")
    await expect(partes(page)).toHaveText([/R\$\s50,00/, /R\$\s25,00/, /R\$\s25,00/])
    await expect(page.getByTestId("rateio-soma")).toHaveText(/R\$\s100,00/)
    await expect(salvar(page)).toBeEnabled()

    await page.screenshot({ path: `docs/pfc/evidencias/S06-Ab-rateio-ui-peso-${projeto()}.png`, fullPage: true })

    await salvarEConferir(page, [50, 25, 25], 100)
    expect(dialogos).toEqual([])
  })

  test("divisão por valor exato: mostra falta e excesso e só envia quando fecha", async ({ page }) => {
    const dialogos = await abrirNovaDespesa(page)
    await preencher(page, "Passeio de barco", "100")
    await page.getByRole("radio", { name: "Valor exato" }).click()

    await page.getByLabel("Valor de Você").fill("50")
    await page.getByLabel("Valor de Participante 2").fill("30")
    await expect(page.getByTestId("rateio-soma")).toHaveText(/R\$\s80,00/)
    await expect(page.getByText("Falta", { exact: true })).toBeVisible()
    await expect(page.getByTestId("rateio-diferenca")).toHaveText(/R\$\s20,00/)
    await expect(salvar(page)).toBeDisabled()

    await page.getByLabel("Valor de Participante 3").fill("30")
    await expect(page.getByText("Excedeu", { exact: true })).toBeVisible()
    await expect(page.getByTestId("rateio-diferenca")).toHaveText(/R\$\s10,00/)
    await expect(page.locator("#rateio-status")).toContainText("excede o total")
    await expect(salvar(page)).toBeDisabled()

    await page.screenshot({
      path: `docs/pfc/evidencias/S06-Ab-rateio-ui-exato-nao-fecha-${projeto()}.png`,
      fullPage: true,
    })

    await page.getByLabel("Valor de Participante 3").fill("20")
    await expect(page.getByTestId("rateio-diferenca")).toHaveText(/R\$\s0,00/)
    await expect(salvar(page)).toBeEnabled()

    await page.screenshot({ path: `docs/pfc/evidencias/S06-Ab-rateio-ui-exato-${projeto()}.png`, fullPage: true })

    await salvarEConferir(page, [50, 30, 20], 100)
    expect(dialogos).toEqual([])
  })

  test("carregamento e erro ao buscar os participantes, com nova tentativa", async ({ page }) => {
    const dialogos: string[] = []
    page.on("dialog", async (d) => {
      dialogos.push(d.type())
      await d.dismiss()
    })
    await entrar(page, "teste.a@viajamais.local")

    // Segura a resposta para ver o carregamento; depois devolve 500.
    let liberar: () => void = () => {}
    const segurada = new Promise<void>((r) => (liberar = r))
    await page.route(`**/api/trips/${tripId}`, async (route) => {
      await segurada
      await route.fulfill({ status: 500, json: { error: "Erro interno do servidor" } })
    })

    await page.goto(`/dashboard/trips/${tripId}/expenses/new`)
    await expect(page.getByText("Carregando participantes...")).toBeVisible()
    await expect(salvar(page)).toBeDisabled()

    liberar()
    await expect(page.getByRole("alert").filter({ hasText: "Não foi possível carregar os participantes" })).toBeVisible()
    await expect(salvar(page)).toBeDisabled()

    await page.screenshot({ path: `docs/pfc/evidencias/S06-Ab-rateio-ui-erro-${projeto()}.png`, fullPage: true })

    await page.unroute(`**/api/trips/${tripId}`)
    await page.getByRole("button", { name: "Tentar novamente" }).click()
    await expect(page.getByTestId("participante-rateio")).toHaveCount(3)
    expect(dialogos).toEqual([])
  })
})
