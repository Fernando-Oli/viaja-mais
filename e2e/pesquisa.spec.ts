import { test, expect, type Locator, type Page } from "@playwright/test"

/**
 * @RF09.12 o histórico de pesquisa da aba Rede social (S05-M-pesquisa): com o
 * campo vazio, os recentes; abrir alguém pela pesquisa o põe no topo; o X tira
 * uma entrada; "Limpar tudo" pede confirmação. O histórico é da conta.
 *
 * Quem age é o Davi, usuário do seed reservado aos specs de perfil. O histórico
 * dele começa e termina vazio, pela própria rota.
 */

async function entrarComoDavi(page: Page) {
  await page.goto("/auth/login")
  await page.fill("#email", "teste.d@viajamais.local")
  await page.fill("#password", "viajamais123")
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")
}

async function limparHistorico(page: Page) {
  // Só depois do login: sem sessão o DELETE daria 401 e esconderia a falha real.
  const resposta = await page.request.delete("/api/social/pesquisas")
  expect(resposta.ok(), "o histórico do Davi precisa sair no fim").toBeTruthy()
}

/** Abre a pessoa pela lista e espera o registro no histórico terminar. */
async function abrir(page: Page, lista: Locator, nome: RegExp, endereco: string) {
  const registro = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/social/pesquisas" && r.request().method() === "POST",
  )
  await lista.getByRole("link", { name: nome }).click()
  expect((await registro).ok()).toBeTruthy()
  await page.waitForURL(endereco)
}

test("os recentes: vazio, registro, ordem, o X e o Limpar tudo", async ({ page, browser }) => {
  const direto: string[] = []
  page.on("request", (pedido) => {
    if (pedido.url().includes("/rest/v1/search_history")) direto.push(`${pedido.method()} ${pedido.url()}`)
  })

  await entrarComoDavi(page)
  await limparHistorico(page)
  try {
    await page.goto("/pesquisar")
    const area = page.getByRole("main")
    const campo = area.getByRole("searchbox", { name: "Buscar pessoas" })
    const recentes = area.getByRole("list", { name: "Pesquisas recentes" })
    const encontradas = area.getByRole("list", { name: "Pessoas encontradas" })

    await expect(area.getByText("Nenhuma pesquisa recente.")).toBeVisible()

    // Abre a Carla e volta: o termo continua no campo e no endereço.
    await campo.fill("carla")
    await abrir(page, encontradas, /Carla Teste/, "/u/carla")
    await page.goBack()
    await page.waitForURL("/pesquisar?q=carla")
    await expect(campo).toHaveValue("carla")

    // Com o campo vazio, os recentes no lugar dos resultados.
    await campo.fill("")
    await expect(recentes.getByRole("listitem")).toHaveCount(1)
    await expect(recentes.getByText("Carla Teste")).toBeVisible()
    await expect(encontradas).toHaveCount(0)

    // O Bruno entra no topo.
    await campo.fill("bruno")
    await abrir(page, encontradas, /Bruno Teste/, "/u/bruno")
    await page.goto("/pesquisar")
    await expect(recentes.getByRole("listitem")).toHaveCount(2)
    await expect(recentes.getByRole("listitem").nth(0)).toContainText("Bruno Teste")
    await expect(recentes.getByRole("listitem").nth(1)).toContainText("Carla Teste")

    // Reabrir a Carla pelos recentes a leva de volta ao topo.
    await abrir(page, recentes, /Carla Teste/, "/u/carla")
    await page.goto("/pesquisar")
    await expect(recentes.getByRole("listitem").nth(0)).toContainText("Carla Teste")
    await expect(recentes.getByRole("listitem")).toHaveCount(2)

    // O histórico é da conta: outro navegador, o mesmo Davi, a mesma lista.
    const outro = await browser.newContext()
    try {
      const outraPagina = await outro.newPage()
      await entrarComoDavi(outraPagina)
      const { recentes: vistos } = await (await outraPagina.request.get("/api/social/pesquisas")).json()
      expect(vistos.map((p: { username: string }) => p.username)).toEqual(["carla", "bruno"])
    } finally {
      await outro.close()
    }

    const projeto = test.info().project.name
    await page.screenshot({ path: `docs/pfc/evidencias/S05-M-pesquisa-recentes-${projeto}.png`, fullPage: true })

    // O X tira só aquela entrada, na hora. O foco vai para o título, e a remoção
    // é anunciada (regressão: o botão sumia e o foco caía no body, em silêncio).
    await recentes.getByRole("button", { name: "Remover @bruno dos recentes" }).click()
    await expect(recentes.getByRole("listitem")).toHaveCount(1)
    await expect(recentes.getByText("Bruno Teste")).toHaveCount(0)
    await expect(area.getByRole("heading", { name: "Recentes" })).toBeFocused()
    await expect(area.getByRole("status")).toHaveText("@bruno saiu dos recentes.")

    // "Limpar tudo" pede confirmação; cancelar não apaga.
    await area.getByRole("button", { name: "Limpar tudo" }).click()
    const confirmacao = page.getByRole("alertdialog", { name: "Limpar as pesquisas recentes?" })
    await confirmacao.getByRole("button", { name: "Cancelar" }).click()
    await expect(recentes.getByRole("listitem")).toHaveCount(1)

    await area.getByRole("button", { name: "Limpar tudo" }).click()
    await confirmacao.getByRole("button", { name: "Limpar tudo" }).click()
    await expect(area.getByText("Nenhuma pesquisa recente.")).toBeVisible()
    await expect(area.getByRole("heading", { name: "Recentes" })).toBeFocused()
    await expect(area.getByRole("status")).toHaveText("As pesquisas recentes foram apagadas.")
    await page.reload()
    await expect(area.getByText("Nenhuma pesquisa recente.")).toBeVisible()

    expect(direto, "nenhuma requisição do navegador a /rest/v1/search_history").toEqual([])
  } finally {
    await limparHistorico(page)
  }
})

test("Pesquisar no menu começa uma pesquisa nova, sem o termo anterior (regressão)", async ({ page }) => {
  // Antes, o campo só lia o ?q= ao montar: o endereço voltava a /pesquisar, mas o
  // campo continuava com o termo, e voltar de um perfil desencontrava os dois.
  await entrarComoDavi(page)
  await page.goto("/pesquisar?q=carla")
  const area = page.getByRole("main")
  const campo = area.getByRole("searchbox", { name: "Buscar pessoas" })
  await expect(campo).toHaveValue("carla")
  await expect(area.getByRole("list", { name: "Pessoas encontradas" }).getByText("Carla Teste")).toBeVisible()

  await page.getByRole("navigation", { name: "Rede social" }).getByRole("link", { name: "Pesquisar" }).click()
  await page.waitForURL("/pesquisar")
  await expect(campo).toHaveValue("")
  await expect(area.getByRole("heading", { name: "Recentes" })).toBeVisible()
})

test("digitar tecla a tecla, no meio do texto e com composição, não embaralha o campo (regressão)", async ({ page, context }) => {
  // A primeira correção do menu (M2) sincronizava o campo com o ?q= a cada tecla.
  // O Next atualiza o useSearchParams numa transição, depois da tecla: o campo
  // voltava um instante ao valor anterior, o cursor pulava para o fim, e a
  // composição do teclado (Gboard, tecla morta do ABNT2) se embaralhava. O fill()
  // dos outros testes manda um evento só e não pegava isso.
  await entrarComoDavi(page)
  await page.goto("/pesquisar")
  const area = page.getByRole("main")
  const campo = area.getByRole("searchbox", { name: "Buscar pessoas" })
  await expect(area.getByRole("heading", { name: "Recentes" })).toBeVisible()

  // Cursor no meio: "mrina", Home, → e "a" dá "marina", com o cursor logo depois do "a".
  await campo.pressSequentially("mrina", { delay: 50 })
  await page.keyboard.press("Home")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.type("a")
  await expect(campo).toHaveValue("marina")
  expect(await campo.evaluate((c: HTMLInputElement) => c.selectionStart)).toBe(2)
  await page.keyboard.type("x")
  await expect(campo).toHaveValue("maxrina")

  // Composição pelo CDP do Chromium: a palavra montada letra a letra (Gboard) e a
  // tecla morta (´ + a).
  const cdp = await context.newCDPSession(page)
  await campo.fill("")
  for (const parcial of ["m", "ma", "mar", "mari"]) {
    await cdp.send("Input.imeSetComposition", { text: parcial, selectionStart: parcial.length, selectionEnd: parcial.length })
    await page.waitForTimeout(100)
  }
  await cdp.send("Input.insertText", { text: "mari" })
  await expect(campo).toHaveValue("mari")

  await campo.fill("")
  await page.keyboard.type("jo", { delay: 50 })
  await cdp.send("Input.imeSetComposition", { text: "´", selectionStart: 1, selectionEnd: 1 })
  await page.waitForTimeout(100)
  await cdp.send("Input.insertText", { text: "á" })
  await expect(campo).toHaveValue("joá")
})

test("abrir em outra aba, pelo clique do meio, também registra (regressão)", async ({ page }) => {
  test.skip(test.info().project.name === "mobile", "no celular não existe clique do meio")
  await entrarComoDavi(page)
  await limparHistorico(page)
  try {
    await page.goto("/pesquisar?q=carla")
    const link = page
      .getByRole("main")
      .getByRole("list", { name: "Pessoas encontradas" })
      .getByRole("link", { name: /Carla Teste/ })
    const registro = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/social/pesquisas" && r.request().method() === "POST",
      { timeout: 5000 },
    )
    await link.click({ button: "middle" })
    expect((await registro).ok()).toBeTruthy()

    const { recentes } = await (await page.request.get("/api/social/pesquisas")).json()
    expect(recentes.map((p: { username: string }) => p.username)).toEqual(["carla"])
  } finally {
    await limparHistorico(page)
  }
})

test("se o X falha, a entrada fica e o erro aparece", async ({ page }) => {
  await entrarComoDavi(page)
  await limparHistorico(page)
  try {
    expect((await page.request.post("/api/social/pesquisas", { data: { username: "carla" } })).ok()).toBeTruthy()
    await page.route("**/api/social/pesquisas/carla", (rota) =>
      rota.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Erro interno do servidor"}' }),
    )
    await page.goto("/pesquisar")
    const recentes = page.getByRole("main").getByRole("list", { name: "Pesquisas recentes" })
    await recentes.getByRole("button", { name: "Remover @carla dos recentes" }).click()

    await expect(page.getByText("Não foi possível remover agora. Tente de novo.").first()).toBeVisible()
    await expect(recentes.getByText("Carla Teste")).toBeVisible()
  } finally {
    await page.unrouteAll()
    await limparHistorico(page)
  }
})

test("o próprio perfil não entra no histórico, e o corpo só passa o username", async ({ page }) => {
  await entrarComoDavi(page)
  await limparHistorico(page)
  try {
    expect((await page.request.post("/api/social/pesquisas", { data: { username: "davi" } })).status()).toBe(400)
    expect((await page.request.post("/api/social/pesquisas", { data: { usuario: "carla" } })).status()).toBe(400)
    expect((await page.request.post("/api/social/pesquisas", { data: { username: "nao_existe" } })).status()).toBe(404)

    // Um dono forjado no corpo não vale: a entrada vai para o histórico do Davi.
    const forjado = { username: "carla", user_id: "11111111-1111-4111-8111-111111111111" }
    expect((await page.request.post("/api/social/pesquisas", { data: forjado })).ok()).toBeTruthy()
    const { recentes } = await (await page.request.get("/api/social/pesquisas")).json()
    expect(recentes.map((p: { username: string }) => p.username)).toEqual(["carla"])
  } finally {
    await limparHistorico(page)
  }
})

test("sem sessão, a pesquisa manda para o login e as rotas do histórico respondem 401", async ({ page }) => {
  await page.goto("/pesquisar")
  await page.waitForURL("/auth/login")

  expect((await page.request.get("/api/social/pesquisas")).status()).toBe(401)
  expect((await page.request.post("/api/social/pesquisas", { data: { username: "carla" } })).status()).toBe(401)
  expect((await page.request.delete("/api/social/pesquisas")).status()).toBe(401)
  expect((await page.request.delete("/api/social/pesquisas/carla")).status()).toBe(401)
})
