import { test, expect, type Browser, type Locator, type Page } from "@playwright/test"

/**
 * @RF09.3 @RF09.4 @RF13.2 as solicitações para seguir na central de
 * Notificações (S05-M-solicitacoes): o sino com a bolinha no canto superior
 * direito da aba, aprovar e recusar.
 *
 * O Bruno do seed (perfil privado) recebe as solicitações; quem pede é o Davi,
 * usuário do seed reservado aos specs de perfil, numa segunda sessão do
 * navegador. No fim, o Davi desfaz o vínculo que criou, pela própria rota: os
 * testes de RLS contam com o Bruno sem vínculos com o Davi.
 */

const BRUNO = "teste.b@viajamais.local"
const DAVI = "teste.d@viajamais.local"

async function entrar(page: Page, email: string) {
  await page.goto("/auth/login")
  await page.fill("#email", email)
  await page.fill("#password", "viajamais123")
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")
}

/** Quem pede numa sessão própria, que não se mistura com a do Bruno. */
async function sessao(browser: Browser, email: string) {
  const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, locale: "pt-BR" })
  const pagina = await contexto.newPage()
  await entrar(pagina, email)
  return pagina
}

const sessaoDoDavi = (browser: Browser) => sessao(browser, DAVI)

/** Pede para seguir o Bruno com a sessão de quem pede. */
async function pedeAoBruno(quem: Page) {
  const resposta = await quem.request.post("/api/social/perfis/bruno/seguir")
  expect(resposta.ok(), "precisa conseguir pedir para seguir o Bruno").toBeTruthy()
}

/** Desfaz o vínculo com o Bruno, pela própria rota, com a sessão de quem pediu. */
async function desfazComOBruno(quem: Page) {
  const resposta = await quem.request.delete("/api/social/perfis/bruno/seguir")
  expect(resposta.ok(), "o vínculo com o Bruno precisa sair no fim").toBeTruthy()
}

async function daviPede(davi: Page) {
  const resposta = await davi.request.post("/api/social/perfis/bruno/seguir")
  expect(resposta.ok(), "o Davi precisa conseguir pedir para seguir o Bruno").toBeTruthy()
  expect((await resposta.json()).perfil.vinculo).toBe("solicitado")
}

async function daviDesfaz(davi: Page) {
  // Só com a sessão do Davi: sem ela o DELETE daria 401 e esconderia a falha real.
  const resposta = await davi.request.delete("/api/social/perfis/bruno/seguir")
  expect(resposta.ok(), "o vínculo do Davi com o Bruno precisa sair no fim").toBeTruthy()
}

/** Quantos seguidores o Bruno tem, pela rota do perfil. */
async function seguidoresDoBruno(page: Page) {
  const resposta = await page.request.get("/api/social/perfis/bruno")
  expect(resposta.ok()).toBeTruthy()
  return (await resposta.json()).perfil.seguidores as number
}

function sino(page: Page) {
  return page.getByRole("link", { name: /^Notificações/ })
}

/** O sino fica no canto superior direito: encostado à direita e acima do título da página. */
async function noCantoSuperiorDireito(page: Page, link: Locator) {
  const caixa = (await link.boundingBox())!
  const titulo = (await page.getByRole("heading", { level: 1 }).boundingBox())!
  const largura = page.viewportSize()!.width
  expect(caixa.x + caixa.width, "o sino encosta na direita da tela").toBeGreaterThan(largura - 64)
  expect(caixa.y + caixa.height, "o sino fica acima do título da página").toBeLessThanOrEqual(titulo.y + 1)
}

test("o sino mostra a solicitação, e aprovar faz do Davi um seguidor", async ({ page, browser }) => {
  // Nada sai do navegador direto para a tabela (regra 1 do CLAUDE.md).
  const direto: string[] = []
  page.on("request", (pedido) => {
    if (/\/rest\/v1\/follows/.test(pedido.url())) direto.push(`${pedido.method()} ${pedido.url()}`)
  })

  const davi = await sessaoDoDavi(browser)
  try {
    await daviPede(davi)
    await entrar(page, BRUNO)
    const antes = await seguidoresDoBruno(page)

    // Em qualquer página da aba, o sino no canto superior direito, com a bolinha.
    for (const endereco of ["/pesquisar", "/feed"]) {
      await page.goto(endereco)
      await expect(sino(page)).toHaveAccessibleName("Notificações: 1 solicitação pendente")
      await expect(page.getByTestId("bolinha-notificacoes")).toHaveText("1")
      await noCantoSuperiorDireito(page, sino(page))
    }
    const projeto = test.info().project.name
    await page.screenshot({ path: `docs/pfc/evidencias/S05-M-solicitacoes-sino-${projeto}.png`, fullPage: true })

    await sino(page).click()
    await page.waitForURL("/notificacoes")
    await noCantoSuperiorDireito(page, sino(page))
    const titulo = page.getByRole("heading", { name: "Solicitações para seguir (1)" })
    await expect(titulo).toBeVisible()
    const lista = page.getByRole("list", { name: "Solicitações para seguir" })
    await expect(lista.getByRole("link", { name: /Davi/ })).toHaveAttribute("href", "/u/davi")
    // Regressão: no celular, os botões ao lado espremiam o nome e o @ até sumirem.
    await expect(lista.getByText("@davi")).toBeVisible()
    await expect(lista.getByText("Davi Teste")).toBeVisible()
    await page.screenshot({ path: `docs/pfc/evidencias/S05-M-solicitacoes-pendente-${projeto}.png`, fullPage: true })

    await page.getByRole("button", { name: "Aprovar @davi" }).click()
    await expect(page.getByRole("heading", { name: "Solicitações para seguir (0)" })).toBeFocused()
    await expect(page.getByText("Nenhuma solicitação pendente.")).toBeVisible()
    await expect(page.getByRole("status").filter({ hasText: "@davi agora segue você." })).toBeAttached()
    await expect(sino(page)).toHaveAccessibleName("Notificações")
    await expect(page.getByTestId("bolinha-notificacoes")).toHaveCount(0)
    await page.screenshot({ path: `docs/pfc/evidencias/S05-M-solicitacoes-vazio-${projeto}.png`, fullPage: true })

    // O Davi passou a seguir o Bruno: o contador do perfil subiu.
    await page.goto("/u/bruno")
    const perfil = page.getByRole("region", { name: "Perfil de @bruno" })
    await expect(perfil.getByText(`${antes + 1} ${antes + 1 === 1 ? "seguidor" : "seguidores"}`)).toBeVisible()
    expect((await (await davi.request.get("/api/social/perfis/bruno")).json()).perfil.vinculo).toBe("seguindo")

    expect(direto, "nenhuma requisição do navegador a /rest/v1/follows").toEqual([])
  } finally {
    await daviDesfaz(davi)
    await davi.context().close()
  }
})

test("recusar tira a solicitação em silêncio, e o Davi pode pedir de novo", async ({ page, browser }) => {
  const davi = await sessaoDoDavi(browser)
  try {
    await daviPede(davi)
    await entrar(page, BRUNO)
    const antes = await seguidoresDoBruno(page)

    await page.goto("/notificacoes")
    await page.getByRole("button", { name: "Recusar @davi" }).click()
    await expect(page.getByRole("heading", { name: "Solicitações para seguir (0)" })).toBeFocused()
    await expect(page.getByRole("status").filter({ hasText: "A solicitação de @davi foi recusada." })).toBeAttached()
    await expect(page.getByTestId("bolinha-notificacoes")).toHaveCount(0)

    expect(await seguidoresDoBruno(page)).toBe(antes)
    // Para o Davi, nada aconteceu além de o pedido sumir: ele pode pedir de novo.
    expect((await (await davi.request.get("/api/social/perfis/bruno")).json()).perfil.vinculo).toBe("nenhum")
    await daviPede(davi)
  } finally {
    await daviDesfaz(davi)
    await davi.context().close()
  }
})

test("sem solicitações, a central diz que não há nenhuma e o sino fica sem bolinha", async ({ page }) => {
  await entrar(page, BRUNO)
  await page.goto("/notificacoes")

  await expect(page.getByRole("heading", { name: "Solicitações para seguir (0)" })).toBeVisible()
  await expect(page.getByText("Nenhuma solicitação pendente.")).toBeVisible()
  await expect(sino(page)).toHaveAccessibleName("Notificações")
  await expect(sino(page)).toHaveAttribute("aria-current", "page")
  await expect(page.getByTestId("bolinha-notificacoes")).toHaveCount(0)
})

test("acima de 9, a bolinha mostra 9+, e o nome do sino diz quantas são", async ({ page }) => {
  await entrar(page, BRUNO)
  // Doze solicitações simuladas no navegador: o pedido nem chega ao servidor.
  await page.route(
    (url) => url.pathname === "/api/social/solicitacoes",
    (rota) => rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ solicitacoes: [], total: 12 }) }),
  )
  try {
    await page.goto("/feed")
    await expect(page.getByTestId("bolinha-notificacoes")).toHaveText("9+")
    await expect(sino(page)).toHaveAccessibleName("Notificações: 12 solicitações pendentes")
  } finally {
    await page.unrouteAll()
  }
})

test("se aprovar falha, a solicitação fica e o erro aparece", async ({ page, browser }) => {
  const davi = await sessaoDoDavi(browser)
  try {
    await daviPede(davi)
    await entrar(page, BRUNO)
    await page.route("**/api/social/solicitacoes/davi", (rota) =>
      rota.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Erro interno do servidor" }) }),
    )
    await page.goto("/notificacoes")
    await page.getByRole("button", { name: "Aprovar @davi" }).click()

    await expect(page.getByText("Não foi possível aprovar agora. Tente de novo.").first()).toBeVisible()
    await expect(page.getByRole("button", { name: "Aprovar @davi" })).toBeEnabled()
    await expect(page.getByRole("heading", { name: "Solicitações para seguir (1)" })).toBeVisible()
  } finally {
    await page.unrouteAll()
    await daviDesfaz(davi)
    await davi.context().close()
  }
})

test("com a sessão vencida, aprovar oferece entrar de novo", async ({ page, browser }) => {
  const davi = await sessaoDoDavi(browser)
  try {
    await daviPede(davi)
    await entrar(page, BRUNO)
    await page.goto("/notificacoes")
    await expect(page.getByRole("button", { name: "Aprovar @davi" })).toBeVisible()

    // A sessão acaba com a página aberta; o pedido de aprovar volta 401.
    await page.context().clearCookies()
    await page.getByRole("button", { name: "Aprovar @davi" }).click()

    const aviso = page.getByRole("alert").filter({ hasText: "Sua sessão expirou." })
    await expect(aviso).toBeVisible()
    await expect(aviso.getByRole("link", { name: "Entrar de novo" })).toHaveAttribute("href", "/auth/login")
    // O 401 não aprovou nada.
    expect((await (await davi.request.get("/api/social/perfis/bruno")).json()).perfil.vinculo).toBe("solicitado")
  } finally {
    await daviDesfaz(davi)
    await davi.context().close()
  }
})

test("ações seguidas em pessoas diferentes: os botões de quem espera ficam travados, e a contagem fecha (regressão)", async ({
  page,
  browser,
}) => {
  const outros = await Promise.all([sessaoDoDavi(browser), sessao(browser, "teste.a@viajamais.local"), sessao(browser, "teste.c@viajamais.local")])
  // O aprovar do Davi fica parado até o teste soltar; o resto segue normal.
  let soltar!: () => void
  const solto = new Promise<void>((r) => (soltar = r))
  try {
    for (const quem of outros) await pedeAoBruno(quem)
    await entrar(page, BRUNO)
    await page.route(
      (url) => url.pathname === "/api/social/solicitacoes/davi",
      async (rota) => {
        await solto
        await rota.continue()
      },
    )
    await page.goto("/notificacoes")
    await expect(page.getByRole("heading", { name: "Solicitações para seguir (3)" })).toBeVisible()

    await page.getByRole("button", { name: "Aprovar @davi" }).click()
    await page.getByRole("button", { name: "Aprovar @ana" }).click()
    await expect(page.getByRole("heading", { name: "Solicitações para seguir (2)" })).toBeVisible()
    // Regressão: terminar o pedido da Ana liberava os botões do Davi, ainda em andamento.
    await expect(page.getByRole("button", { name: "Recusar @davi" })).toBeDisabled()
    await expect(page.getByRole("button", { name: "Aprovar @davi" })).toBeDisabled()

    soltar()
    await expect(page.getByRole("heading", { name: "Solicitações para seguir (1)" })).toBeVisible()
    const lista = page.getByRole("list", { name: "Solicitações para seguir" })
    await expect(lista.getByText("@carla")).toBeVisible()
    await expect(lista.getByText("@davi")).toHaveCount(0)
    await expect(page.getByTestId("bolinha-notificacoes")).toHaveText("1")
  } finally {
    soltar()
    await page.unrouteAll({ behavior: "ignoreErrors" })
    for (const quem of outros) {
      await desfazComOBruno(quem)
      await quem.context().close()
    }
  }
})

test("quem pediu troca de username com a lista aberta: a solicitação continua, com o nome novo (regressão)", async ({
  page,
  browser,
}) => {
  const davi = await sessaoDoDavi(browser)
  try {
    await daviPede(davi)
    await entrar(page, BRUNO)
    await page.goto("/notificacoes")
    await expect(page.getByRole("button", { name: "Aprovar @davi" })).toBeVisible()

    const trocou = await davi.request.patch("/api/social/perfil", { data: { username: "davi_e2e" } })
    expect(trocou.ok(), "o Davi precisa conseguir trocar de username").toBeTruthy()
    // O endereço antigo não existe mais: o aprovar volta "perfil não encontrado".
    await page.getByRole("button", { name: "Aprovar @davi" }).click()

    // Regressão: a solicitação sumia como se tivesse sido resolvida, sem ter sido.
    const lista = page.getByRole("list", { name: "Solicitações para seguir" })
    await expect(lista.getByText("@davi_e2e")).toBeVisible()
    await expect(page.getByRole("heading", { name: "Solicitações para seguir (1)" })).toBeVisible()
    await expect(page.getByTestId("bolinha-notificacoes")).toHaveText("1")
    await expect(page.getByRole("status").filter({ hasText: "já tinha sido resolvida" })).toHaveCount(0)
    expect((await (await davi.request.get("/api/social/perfis/bruno")).json()).perfil.vinculo).toBe("solicitado")
  } finally {
    const restaurado = await davi.request.patch("/api/social/perfil", { data: { username: "davi" } })
    expect(restaurado.ok(), "o username do Davi precisa voltar a ser davi").toBeTruthy()
    await daviDesfaz(davi)
    await davi.context().close()
  }
})

test("com a sessão vencida, o sino deixa de mostrar a contagem antiga (regressão)", async ({ page, browser }) => {
  const davi = await sessaoDoDavi(browser)
  try {
    await daviPede(davi)
    await entrar(page, BRUNO)
    await page.goto("/feed")
    await expect(page.getByTestId("bolinha-notificacoes")).toHaveText("1")

    // A sessão acaba com a página aberta; ao voltar para a janela, o sino conta de novo e recebe 401.
    await page.context().clearCookies()
    await page.evaluate(() => window.dispatchEvent(new Event("focus")))

    await expect(page.getByTestId("bolinha-notificacoes")).toHaveCount(0)
    await expect(sino(page)).toHaveAccessibleName("Notificações")
  } finally {
    await daviDesfaz(davi)
    await davi.context().close()
  }
})

test("com a sessão vencida dentro das Notificações, a bolinha também some (regressão)", async ({ page, browser }) => {
  const davi = await sessaoDoDavi(browser)
  try {
    await daviPede(davi)
    await entrar(page, BRUNO)
    await page.goto("/notificacoes")
    await expect(page.getByTestId("bolinha-notificacoes")).toHaveText("1")

    // A sessão acaba com a página aberta; o aprovar volta 401.
    await page.context().clearCookies()
    await page.getByRole("button", { name: "Aprovar @davi" }).click()

    await expect(page.getByRole("alert").filter({ hasText: "Sua sessão expirou." })).toBeVisible()
    // Regressão: a página avisava da sessão, mas a bolinha continuava com a contagem antiga.
    await expect(page.getByTestId("bolinha-notificacoes")).toHaveCount(0)
    await expect(sino(page)).toHaveAccessibleName("Notificações")
  } finally {
    await daviDesfaz(davi)
    await davi.context().close()
  }
})

test("uma recarga pedida antes de outra ação terminar não traz de volta quem já foi resolvido (regressão)", async ({
  page,
  browser,
}) => {
  const davi = await sessaoDoDavi(browser)
  const ana = await sessao(browser, "teste.a@viajamais.local")
  let soltarDavi!: () => void
  const daviSolto = new Promise<void>((r) => (soltarDavi = r))
  let soltarCarga!: () => void
  const cargaSolta = new Promise<void>((r) => (soltarCarga = r))
  let cargaBuscada!: () => void
  const buscada = new Promise<void>((r) => (cargaBuscada = r))
  let segurarCarga = false
  try {
    await daviPede(davi)
    await pedeAoBruno(ana)
    await entrar(page, BRUNO)
    // O aprovar do Davi fica parado até o teste soltar.
    await page.route(
      (url) => url.pathname === "/api/social/solicitacoes/davi",
      async (rota) => {
        await daviSolto
        await rota.continue()
      },
    )
    // A recarga da lista (sem ?contagem) busca no servidor na hora, mas só entrega quando o teste soltar.
    await page.route(
      (url) => url.pathname === "/api/social/solicitacoes" && url.search === "",
      async (rota) => {
        if (!segurarCarga) return rota.continue()
        segurarCarga = false
        const resposta = await rota.fetch()
        cargaBuscada()
        await cargaSolta
        await rota.fulfill({ response: resposta })
      },
    )
    await page.goto("/notificacoes")
    await expect(page.getByRole("heading", { name: "Solicitações para seguir (2)" })).toBeVisible()

    await page.getByRole("button", { name: "Aprovar @davi" }).click()
    // A Ana cancela com a tela aberta: o aprovar dela volta 404 e pede a recarga.
    await desfazComOBruno(ana)
    segurarCarga = true
    await page.getByRole("button", { name: "Aprovar @ana" }).click()
    // O servidor respondeu à recarga com o Davi ainda pendente.
    await buscada
    soltarDavi()
    await expect(page.getByRole("status").filter({ hasText: "@davi agora segue você." })).toBeAttached()
    soltarCarga()

    // Regressão: a resposta velha da recarga sobrescrevia a tela e o Davi voltava.
    await expect(page.getByRole("heading", { name: "Solicitações para seguir (0)" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Aprovar @davi" })).toHaveCount(0)
    await expect(page.getByTestId("bolinha-notificacoes")).toHaveCount(0)
    expect((await (await davi.request.get("/api/social/perfis/bruno")).json()).perfil.vinculo).toBe("seguindo")
  } finally {
    soltarDavi()
    soltarCarga()
    await page.unrouteAll({ behavior: "ignoreErrors" })
    await daviDesfaz(davi)
    await desfazComOBruno(ana)
    await davi.context().close()
    await ana.context().close()
  }
})

test("com a sessão vencida na recarga das Notificações, a bolinha some mesmo que o sino tenha contado antes (regressão)", async ({
  page,
  browser,
}) => {
  const davi = await sessaoDoDavi(browser)
  try {
    await daviPede(davi)
    await entrar(page, BRUNO)
    // O sino contou 1 antes de a sessão acabar: a contagem dele fica fixa, e só a carga da lista vê o 401.
    await page.route(
      (url) => url.pathname === "/api/social/solicitacoes" && url.search === "?contagem=1",
      (rota) => rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 1 }) }),
    )
    await page.goto("/notificacoes")
    await expect(page.getByRole("button", { name: "Aprovar @davi" })).toBeVisible()
    await expect(page.getByTestId("bolinha-notificacoes")).toHaveText("1")

    // A sessão acaba; o aprovar volta 404 (já resolvida, simulado), e a recarga da lista volta 401.
    await page.context().clearCookies()
    await page.route(
      (url) => url.pathname === "/api/social/solicitacoes/davi",
      (rota) =>
        rota.fulfill({
          status: 404,
          contentType: "application/json",
          body: JSON.stringify({ error: "Solicitação não encontrada", codigo: "sem_pendente" }),
        }),
    )
    await page.getByRole("button", { name: "Aprovar @davi" }).click()

    await expect(page.getByRole("alert").filter({ hasText: "Sua sessão expirou." })).toBeVisible()
    await expect(page.getByTestId("bolinha-notificacoes")).toHaveCount(0)
  } finally {
    await page.unrouteAll({ behavior: "ignoreErrors" })
    await daviDesfaz(davi)
    await davi.context().close()
  }
})
