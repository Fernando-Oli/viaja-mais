import { test, expect, type Browser, type Page, type APIRequestContext } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import { exigirLocal } from "../tests/rls/guarda-ambiente"

/**
 * @RF06.11 visualizar o saldo por membro (quem deve a quem)
 * @RF06.13 sugerir transferências para acerto de contas
 *
 * Acerto de contas pela tela, com viagens de três membros reais: Ana (seed,
 * dona), Bruno (seed) e uma terceira conta criada pelo cadastro. Os membros
 * entram pelo fluxo de convite da aplicação — a dona convida por
 * `POST /api/invitations` e cada convidado aceita por
 * `POST /api/invitations/[id]/accept` — e as despesas são lançadas pela API de
 * despesas com a sessão de quem pagou, porque `paid_by` é quem registra.
 *
 * Cenários:
 *   - "Acerto": Hotel R$ 90 (Ana, entre os três) e Jantar R$ 30 (Bruno, entre
 *     Ana e Bruno) → Ana +45, Bruno −15, Carla −30; Carla paga 30 e Bruno
 *     paga 15 para Ana.
 *   - "Quite": cada um paga R$ 30 entre os três → todos zerados.
 *   - "Vazia": viagem sem despesa.
 */

const SENHA = "viajamais123"
const ANA = "teste.a@viajamais.local"
const BRUNO = "teste.b@viajamais.local"

const viagens = { acerto: "", quite: "", vazia: "" }
let emailC = ""

const projeto = () => test.info().project.name
const evidencia = (cenario: string) => `docs/pfc/evidencias/S07-Ab-acerto-contas-${cenario}-${projeto()}.png`

async function entrar(page: Page, email: string) {
  await page.goto("/auth/login")
  await page.fill("#email", email)
  await page.fill("#password", SENHA)
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")
}

/** Uma sessão por pessoa, para as chamadas de API saírem com o usuário certo. */
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

/** Convite pela rota da aplicação e aceite pela rota do convidado. */
async function convidar(dona: APIRequestContext, convidado: APIRequestContext, email: string, tripId: string) {
  const convite = await dona.post("/api/invitations", { data: { email, tripId } })
  expect(convite.status(), `convite para ${email}`).toBe(200)

  const pendentes = await convidado.get("/api/invitations")
  expect(pendentes.ok()).toBeTruthy()
  const { invitations } = (await pendentes.json()) as { invitations: { id: string; trip_id: string }[] }
  const meu = invitations.find((i) => i.trip_id === tripId)
  expect(meu, `convite pendente de ${email}`).toBeTruthy()

  const aceite = await convidado.post(`/api/invitations/${meu!.id}/accept`)
  expect(aceite.status(), `aceite de ${email}`).toBe(200)
}

async function membrosDaViagem(api: APIRequestContext, tripId: string) {
  const resposta = await api.get(`/api/trips/${tripId}`)
  const { trip } = (await resposta.json()) as { trip: { trip_members: { user_id: string }[] } }
  return trip.trip_members.map((m) => m.user_id)
}

/** Despesa com rateio igual entre `participantes`, lançada por quem pagou. */
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

/** Id de quem entra, pelo Auth local — o mesmo meio de `e2e/rateio-despesa.spec.ts`. */
async function idDe(email: string) {
  const url = exigirLocal(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", "NEXT_PUBLIC_SUPABASE_URL")
  const cliente = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await cliente.auth.signInWithPassword({ email, password: SENHA })
  if (error) throw new Error(`falha ao logar como ${email}: ${error.message}`)
  return data.user.id
}

async function prepararViagens(browser: Browser) {
  const sufixo = Date.now()
  emailC = `acerto.c.${sufixo}@viajamais.local`

  // Terceira conta pelo cadastro: o seed só tem duas.
  const ctxC = await browser.newContext()
  const pageC = await ctxC.newPage()
  await pageC.goto("/auth/sign-up")
  await pageC.fill("#fullName", "Carla Acerto")
  await pageC.fill("#email", emailC)
  await pageC.fill("#password", SENHA)
  await pageC.fill("#confirmPassword", SENHA)
  await pageC.click('button[type="submit"]')
  await pageC.waitForURL("/dashboard")
  const carla = { ctx: ctxC, api: pageC.request }

  const ana = await sessao(browser, ANA)
  const bruno = await sessao(browser, BRUNO)

  viagens.acerto = await criarViagem(ana.api, `Acerto S07 ${sufixo}`)
  viagens.quite = await criarViagem(ana.api, `Quite S07 ${sufixo}`)
  viagens.vazia = await criarViagem(ana.api, `Vazia S07 ${sufixo}`)

  for (const tripId of Object.values(viagens)) {
    await convidar(ana.api, bruno.api, BRUNO, tripId)
    await convidar(ana.api, carla.api, emailC, tripId)
  }

  // Os três ids têm de ser exatamente os membros que a viagem devolve.
  const ids = await membrosDaViagem(ana.api, viagens.acerto)
  const [idAna, idBruno, idCarla] = await Promise.all([idDe(ANA), idDe(BRUNO), idDe(emailC)])
  const todos = [idAna, idBruno, idCarla]
  expect([...todos].sort()).toEqual([...ids].sort())

  await lancar(ana.api, viagens.acerto, "Hotel", 90, todos)
  await lancar(bruno.api, viagens.acerto, "Jantar", 30, [idAna, idBruno])

  await lancar(ana.api, viagens.quite, "Hotel", 30, todos)
  await lancar(bruno.api, viagens.quite, "Mercado", 30, todos)
  await lancar(carla.api, viagens.quite, "Passeio", 30, todos)

  await Promise.all([ana.ctx.close(), bruno.ctx.close(), ctxC.close()])
}

/** Falha o teste se surgir qualquer diálogo nativo. */
function vigiarDialogos(page: Page) {
  const dialogos: string[] = []
  page.on("dialog", async (d) => {
    dialogos.push(`${d.type()}: ${d.message()}`)
    await d.dismiss()
  })
  return dialogos
}

/** Nada pode passar da largura da janela: sem rolagem horizontal. */
async function semRolagemHorizontal(page: Page) {
  const { scroll, janela } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    janela: window.innerWidth,
  }))
  expect(scroll).toBeLessThanOrEqual(janela)
}

const texto = (s: string | null) => s?.replace(/\s+/g, " ").trim()

test.describe.serial("acerto de contas", () => {
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000)
    await prepararViagens(browser)
  })

  test("saldos e transferências sugeridas, a partir da aba Despesas", async ({ page }) => {
    const dialogos = vigiarDialogos(page)
    await entrar(page, BRUNO)
    await page.goto(`/dashboard/trips/${viagens.acerto}?aba=despesas`)
    await page.getByRole("link", { name: "Acerto de contas" }).click()
    await page.waitForURL(/\/acerto$/)

    const saldos = page.getByTestId("saldo-membro")
    await expect(saldos).toHaveCount(3)
    const linhas = (await saldos.allTextContents()).map(texto)
    expect(linhas[0]).toBe("Você Membro deve R$ 15,00")
    expect(linhas).toContain("Participante 2 Dono a receber R$ 45,00")
    expect(linhas).toContain("Participante 3 Membro deve R$ 30,00")

    const transferencias = (await page.getByTestId("transferencia").allTextContents()).map(texto)
    expect(transferencias).toEqual([
      "Participante 3 paga R$ 30,00 para Participante 2",
      "Você paga R$ 15,00 para Participante 2",
    ])

    await semRolagemHorizontal(page)
    await page.screenshot({ path: evidencia("saldos"), fullPage: true })
    expect(dialogos).toEqual([])
  })

  test("quem tem a receber vê as transferências chegando para si", async ({ page }) => {
    const dialogos = vigiarDialogos(page)
    await entrar(page, ANA)
    await page.goto(`/dashboard/trips/${viagens.acerto}/acerto`)

    await expect(page.getByTestId("saldo-membro").first()).toHaveText(/Você\s*Dono\s*a receber R\$\s45,00/)
    const transferencias = (await page.getByTestId("transferencia").allTextContents()).map(texto)
    expect(transferencias.every((t) => t?.endsWith("para Você"))).toBe(true)
    expect(dialogos).toEqual([])
  })

  test("viagem sem despesas", async ({ page }) => {
    const dialogos = vigiarDialogos(page)
    await entrar(page, ANA)
    await page.goto(`/dashboard/trips/${viagens.vazia}/acerto`)

    await expect(page.getByText("Nenhuma despesa lançada nesta viagem ainda.")).toBeVisible()
    await expect(page.getByTestId("saldo-membro")).toHaveCount(3)
    await expect(page.getByTestId("transferencia")).toHaveCount(0)

    await semRolagemHorizontal(page)
    await page.screenshot({ path: evidencia("sem-despesas"), fullPage: true })
    expect(dialogos).toEqual([])
  })

  test("todos os saldos zerados", async ({ page }) => {
    const dialogos = vigiarDialogos(page)
    await entrar(page, ANA)
    await page.goto(`/dashboard/trips/${viagens.quite}/acerto`)

    await expect(page.getByText("Tudo acertado: ninguém deve nada a ninguém.")).toBeVisible()
    const linhas = (await page.getByTestId("saldo-membro").allTextContents()).map(texto)
    expect(linhas).toHaveLength(3)
    expect(linhas.every((l) => l?.endsWith("quite R$ 0,00"))).toBe(true)
    await expect(page.getByTestId("transferencia")).toHaveCount(0)

    await semRolagemHorizontal(page)
    await page.screenshot({ path: evidencia("quite"), fullPage: true })
    expect(dialogos).toEqual([])
  })

  test("erro da API e recuperação com Tentar novamente", async ({ page }) => {
    const dialogos = vigiarDialogos(page)
    await entrar(page, ANA)

    // Segura a resposta para ver o carregamento; depois devolve 500.
    let liberar: () => void = () => {}
    const segurada = new Promise<void>((r) => (liberar = r))
    const rota = `**/api/trips/${viagens.acerto}/acerto`
    await page.route(rota, async (route) => {
      await segurada
      await route.fulfill({ status: 500, json: { error: "Erro interno do servidor" } })
    })

    await page.goto(`/dashboard/trips/${viagens.acerto}/acerto`)
    await expect(page.getByText("Carregando acerto de contas...")).toBeVisible()

    liberar()
    await expect(
      page.getByRole("alert").filter({ hasText: "Não foi possível carregar o acerto de contas." }),
    ).toBeVisible()
    await expect(page.getByText("Não foi possível carregar o acerto de contas", { exact: true })).toBeVisible()

    await semRolagemHorizontal(page)
    await page.screenshot({ path: evidencia("erro"), fullPage: true })

    await page.unroute(rota)
    await page.getByRole("button", { name: "Tentar novamente" }).click()
    await expect(page.getByTestId("saldo-membro")).toHaveCount(3)
    await expect(page.getByTestId("transferencia")).toHaveCount(2)
    expect(dialogos).toEqual([])
  })

  test("quem não participa da viagem não consulta o acerto", async ({ page, browser }) => {
    // Sem sessão: 401.
    const anonimo = await browser.newContext()
    const semSessao = await anonimo.request.get(`/api/trips/${viagens.acerto}/acerto`)
    expect(semSessao.status()).toBe(401)
    await anonimo.close()

    // Bruno participa de "Acerto", mas não de uma viagem só da Ana.
    await entrar(page, ANA)
    const soDaAna = await criarViagem(page.request, `Só da Ana ${Date.now()}`)
    await page.context().clearCookies()
    await entrar(page, BRUNO)
    const fora = await page.request.get(`/api/trips/${soDaAna}/acerto`)
    expect(fora.status()).toBe(403)
    expect(JSON.stringify(await fora.json())).not.toContain("saldos")
  })
})
