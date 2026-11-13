import { test, expect, type Browser, type Page, type APIRequestContext } from "@playwright/test"
import { cadastrar, convidar, entrar, idDe } from "./fixtures/contas"

/**
 * @RF06.13 registrar como paga uma transferência do acerto
 *
 * Registro de pagamento pela tela de acerto de contas, com três membros reais:
 * Ana (seed, dona), Bruno (seed) e uma terceira conta criada pelo cadastro
 * (Carla). Membros entram pelo convite da aplicação e as despesas são lançadas
 * pela API com a sessão de quem pagou — o mesmo preparo de
 * `e2e/acerto-contas.spec.ts`.
 *
 * Cenário de saldo (viagens "Pagamentos" e "Erro"): Hotel R$ 90 (Ana, entre os
 * três) e Jantar R$ 30 (Bruno, entre Ana e Bruno) → Ana +45, Bruno −15,
 * Carla −30.
 *
 * Fluxo provado, em ordem, na viagem "Pagamentos":
 *   1. Carla registra R$ 10,00 de R$ 30,00 (parcial) → deve R$ 20,00.
 *   2. Carla registra o restante sugerido → a transferência dela some.
 *   3. Bruno registra R$ 15,00 → "Tudo acertado".
 */

const ANA = "teste.a@viajamais.local"
const BRUNO = "teste.b@viajamais.local"

const viagens = { pagamentos: "", erro: "" }
let emailC = ""
let idCarla = ""

const projeto = () => test.info().project.name
const evidencia = (cenario: string) => `docs/pfc/evidencias/S08-Ab-transferencias-${cenario}-${projeto()}.png`

async function sessao(browser: Browser, email: string) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await entrar(page, email)
  return { ctx, api: page.request }
}

async function criarViagem(api: APIRequestContext, titulo: string) {
  const resposta = await api.post("/api/trips", {
    data: {
      title: titulo,
      destination: "Pirenópolis",
      start_date: "2026-12-01",
      end_date: "2026-12-05",
      currency: "BRL",
      status: "planning",
    },
  })
  expect(resposta.ok()).toBeTruthy()
  return (await resposta.json()).data[0].id as string
}

async function lancar(api: APIRequestContext, tripId: string, titulo: string, valor: number, participantes: string[]) {
  const resposta = await api.post(`/api/trips/${tripId}/expenses`, {
    data: {
      title: titulo,
      amount: valor,
      currency: "BRL",
      category: "food",
      date: "2026-12-02",
      rateio: { tipo: "equal", participantes: participantes.map((user_id) => ({ user_id })) },
    },
  })
  expect(resposta.status(), `despesa ${titulo}`).toBe(200)
}

async function prepararViagens(browser: Browser) {
  const sufixo = Date.now()
  emailC = `pagamento.c.${sufixo}@viajamais.local`

  const ctxC = await browser.newContext()
  const pageC = await ctxC.newPage()
  await cadastrar(pageC, "Carla Pagamento", emailC)
  const carla = { ctx: ctxC, api: pageC.request }

  const ana = await sessao(browser, ANA)
  const bruno = await sessao(browser, BRUNO)

  viagens.pagamentos = await criarViagem(ana.api, `Pagamentos S08 ${sufixo}`)
  viagens.erro = await criarViagem(ana.api, `Erro S08 ${sufixo}`)

  const [idAna, idBruno, idC] = await Promise.all([idDe(ANA), idDe(BRUNO), idDe(emailC)])
  idCarla = idC

  for (const tripId of Object.values(viagens)) {
    await convidar(ana.api, bruno.api, BRUNO, tripId)
    await convidar(ana.api, carla.api, emailC, tripId)
    await lancar(ana.api, tripId, "Hotel", 90, [idAna, idBruno, idCarla])
    await lancar(bruno.api, tripId, "Jantar", 30, [idAna, idBruno])
  }

  await Promise.all([ana.ctx.close(), bruno.ctx.close(), ctxC.close()])
}

function vigiarDialogos(page: Page) {
  const dialogos: string[] = []
  page.on("dialog", async (d) => {
    dialogos.push(`${d.type()}: ${d.message()}`)
    await d.dismiss()
  })
  return dialogos
}

async function semRolagemHorizontal(page: Page) {
  const { scroll, janela } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    janela: window.innerWidth,
  }))
  expect(scroll).toBeLessThanOrEqual(janela)
}

const texto = (s: string | null) => s?.replace(/\s+/g, " ").trim()

async function saldos(page: Page) {
  return (await page.getByTestId("saldo-membro").allTextContents()).map(texto)
}

async function transferencias(page: Page) {
  return (await page.getByTestId("transferencia").allTextContents()).map(texto)
}

/** Abre o registro na transferência que sai de "Você", ajusta o valor se pedido e confirma. */
async function registrar(page: Page, valor?: string) {
  await page.getByRole("button", { name: "Registrar pagamento" }).click()
  const dialogo = page.getByRole("dialog")
  await expect(dialogo).toBeVisible()
  if (valor !== undefined) await dialogo.getByLabel(/Valor pago/).fill(valor)
  await dialogo.getByRole("button", { name: "Confirmar pagamento" }).click()
  return dialogo
}

test.describe.serial("registrar pagamento do acerto", () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000)
    await prepararViagens(browser)
  })

  test("pagamento parcial reduz o saldo e a sugestão", async ({ page }) => {
    const dialogos = vigiarDialogos(page)
    await entrar(page, emailC)
    await page.goto(`/dashboard/trips/${viagens.pagamentos}/acerto`)

    await expect(page.getByTestId("saldo-membro").first()).toHaveText(/Você\s*Membro\s*deve R\$\s30,00/)
    expect(await transferencias(page)).toContain("Você paga R$ 30,00 para Participante 2")
    // Só a transferência que sai de quem consulta tem o botão.
    await expect(page.getByRole("button", { name: "Registrar pagamento" })).toHaveCount(1)

    await page.getByRole("button", { name: "Registrar pagamento" }).click()
    const dialogo = page.getByRole("dialog")
    await expect(dialogo.getByLabel(/Valor pago/)).toHaveValue("30,00")
    await dialogo.getByLabel(/Valor pago/).fill("10,00")
    await semRolagemHorizontal(page)
    // Só a janela visível: o diálogo é fixo, e na página inteira o fundo
    // escurecido cobriria só a primeira tela. Animação de abertura encerrada.
    await page.screenshot({ path: evidencia("dialogo"), animations: "disabled" })
    await dialogo.getByRole("button", { name: "Confirmar pagamento" }).click()

    await expect(page.getByText("Pagamento registrado", { exact: true })).toBeVisible()
    await expect(dialogo).toBeHidden()
    await expect(page.getByTestId("saldo-membro").first()).toHaveText(/Você\s*Membro\s*deve R\$\s20,00/)
    expect(await saldos(page)).toContain("Participante 2 Dono a receber R$ 35,00")
    expect(await transferencias(page)).toEqual([
      "Você paga R$ 20,00 para Participante 2",
      "Participante 3 paga R$ 15,00 para Participante 2",
    ])

    await semRolagemHorizontal(page)
    await page.screenshot({ path: evidencia("parcial"), fullPage: true })
    expect(dialogos).toEqual([])
  })

  test("pagamento do restante tira a transferência de quem pagou", async ({ page }) => {
    const dialogos = vigiarDialogos(page)
    await entrar(page, emailC)
    await page.goto(`/dashboard/trips/${viagens.pagamentos}/acerto`)
    await expect(page.getByTestId("saldo-membro").first()).toHaveText(/deve R\$\s20,00/)

    const dialogo = await registrar(page)

    await expect(dialogo).toBeHidden()
    await expect(page.getByTestId("saldo-membro").first()).toHaveText(/Você\s*Membro\s*quite R\$\s0,00/)
    await expect(page.getByTestId("transferencia")).toHaveCount(1)
    expect(await transferencias(page)).toEqual(["Participante 3 paga R$ 15,00 para Participante 2"])
    await expect(page.getByRole("button", { name: "Registrar pagamento" })).toHaveCount(0)

    await semRolagemHorizontal(page)
    await page.screenshot({ path: evidencia("registrado"), fullPage: true })
    expect(dialogos).toEqual([])
  })

  test('último pagamento zera todos os saldos: "Tudo acertado"', async ({ page }) => {
    const dialogos = vigiarDialogos(page)
    await entrar(page, BRUNO)
    await page.goto(`/dashboard/trips/${viagens.pagamentos}/acerto`)
    await expect(page.getByTestId("saldo-membro").first()).toHaveText(/Você\s*Membro\s*deve R\$\s15,00/)

    await registrar(page)

    await expect(page.getByText("Tudo acertado: ninguém deve nada a ninguém.")).toBeVisible()
    const linhas = await saldos(page)
    expect(linhas).toHaveLength(3)
    expect(linhas.every((l) => l?.endsWith("quite R$ 0,00"))).toBe(true)
    await expect(page.getByTestId("transferencia")).toHaveCount(0)

    await semRolagemHorizontal(page)
    await page.screenshot({ path: evidencia("quitado"), fullPage: true })
    expect(dialogos).toEqual([])
  })

  test("a credora vê o acerto quitado e não tem o que registrar", async ({ page }) => {
    await entrar(page, ANA)
    await page.goto(`/dashboard/trips/${viagens.pagamentos}/acerto`)

    await expect(page.getByText("Tudo acertado: ninguém deve nada a ninguém.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Registrar pagamento" })).toHaveCount(0)
  })

  test("erro da API ao registrar: toast, diálogo aberto e nova tentativa", async ({ page }) => {
    const dialogos = vigiarDialogos(page)
    await entrar(page, emailC)
    await page.goto(`/dashboard/trips/${viagens.erro}/acerto`)
    await expect(page.getByTestId("saldo-membro").first()).toHaveText(/deve R\$\s30,00/)

    const rota = `**/api/trips/${viagens.erro}/acerto/transferencias`
    await page.route(rota, (route) => route.fulfill({ status: 500, json: { error: "Erro interno do servidor" } }))

    const dialogo = await registrar(page)

    await expect(page.getByText("Erro interno do servidor", { exact: true })).toBeVisible()
    await expect(dialogo).toBeVisible()
    await expect(dialogo.getByRole("button", { name: "Confirmar pagamento" })).toBeEnabled()
    // Nada mudou: o saldo continua o mesmo.
    await expect(page.getByTestId("saldo-membro").first()).toHaveText(/deve R\$\s30,00/)

    await semRolagemHorizontal(page)
    await page.screenshot({ path: evidencia("erro"), animations: "disabled" })

    await page.unroute(rota)
    await dialogo.getByRole("button", { name: "Confirmar pagamento" }).click()

    await expect(dialogo).toBeHidden()
    await expect(page.getByText("Pagamento registrado", { exact: true })).toBeVisible()
    await expect(page.getByTestId("saldo-membro").first()).toHaveText(/Você\s*Membro\s*quite R\$\s0,00/)
    expect(dialogos).toEqual([])
  })

  test("a API recusa pagamento em nome de outra pessoa e acima da dívida", async ({ page }) => {
    await entrar(page, ANA)
    const url = `/api/trips/${viagens.erro}/acerto/transferencias`

    // Ana é credora: não registra pagamento da Carla.
    const emNomeDeOutra = await page.request.post(url, {
      data: { de: idCarla, para: await idDe(ANA), valor: "1,00", moeda: "BRL", chave: crypto.randomUUID() },
    })
    expect(emNomeDeOutra.status()).toBe(403)

    // Bruno ainda deve 15 nesta viagem: 15,01 passa da dívida.
    await page.context().clearCookies()
    await entrar(page, BRUNO)
    const acima = await page.request.post(url, {
      data: { de: await idDe(BRUNO), para: await idDe(ANA), valor: "15,01", moeda: "BRL", chave: crypto.randomUUID() },
    })
    expect(acima.status()).toBe(422)
  })
})
