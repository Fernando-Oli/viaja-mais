import { test, expect, type Locator, type Page } from "@playwright/test"

/**
 * @RF09.10 a aba Rede social e a busca de pessoas.
 *
 * Só o Davi faz login, porque é o usuário do seed reservado aos specs de perfil,
 * e este spec só lê. Ana, Bruno e Carla continuam como o seed os deixa
 * (supabase/seed.sql): Bruno é o perfil privado.
 *
 * No desktop a busca fica no painel à esquerda do feed; no celular, numa gaveta
 * aberta pelo botão "Buscar pessoas". `abrirBusca` devolve a área certa para cada
 * projeto do Playwright.
 */

async function entrarComoDavi(page: Page) {
  await page.goto("/auth/login")
  await page.fill("#email", "teste.d@viajamais.local")
  await page.fill("#password", "viajamais123")
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")
}

const noCelular = () => test.info().project.name === "mobile"

async function abrirBusca(page: Page): Promise<Locator> {
  if (noCelular()) {
    await page.getByRole("button", { name: "Buscar pessoas" }).click()
    return page.getByRole("dialog", { name: "Pessoas" })
  }
  return page.getByRole("complementary", { name: "Pessoas" })
}

async function buscar(area: Locator, termo: string) {
  await area.getByRole("searchbox", { name: "Buscar pessoas" }).fill(termo)
}

test("a aba Rede social fica logo abaixo de Reservas e abre o feed", async ({ page }) => {
  await entrarComoDavi(page)

  // Pelo href, porque no celular o menu mostra só o ícone, sem o texto do link.
  const destinos = await page.locator("aside nav a").evaluateAll((links) => links.map((a) => a.getAttribute("href")))
  expect(destinos.indexOf("/feed")).toBe(destinos.indexOf("/dashboard/bookings") + 1)

  await page.locator('aside nav a[href="/feed"]').click()
  await page.waitForURL("/feed")
  await expect(page.getByRole("heading", { name: "Rede social" })).toBeVisible()
  await expect(page.getByRole("region", { name: "Feed" }).getByText("Seu feed ainda está vazio")).toBeVisible()
})

test("busca por nome e por @usuário, marca o perfil privado e não mostra quem busca", async ({ page }) => {
  await entrarComoDavi(page)
  await page.goto("/feed")
  const area = await abrirBusca(page)
  const encontradas = area.getByRole("list", { name: "Pessoas encontradas" })

  // Com um caractere, nada é buscado.
  await buscar(area, "c")
  await expect(area.getByText("Digite pelo menos 2 caracteres")).toBeVisible()

  await buscar(area, "carla")
  await expect(encontradas.getByText("Carla Teste")).toBeVisible()
  await expect(encontradas.getByText("@carla")).toBeVisible()
  await expect(encontradas.getByRole("img", { name: "Sem foto de perfil" })).toBeVisible()

  // Pelo @usuário, com maiúsculas: o mesmo resultado.
  await buscar(area, "@CAR")
  await expect(encontradas.getByText("Carla Teste")).toBeVisible()

  await buscar(area, "bru")
  await expect(encontradas.getByText("Bruno Teste")).toBeVisible()
  await expect(encontradas.getByRole("img", { name: "Perfil privado" })).toBeVisible()

  // Quem busca não aparece nos próprios resultados.
  await buscar(area, "davi")
  await expect(area.getByText("Ninguém encontrado para “davi”.")).toBeVisible()

  // Todos menos o Davi, em ordem de nome.
  await buscar(area, "teste")
  await expect(encontradas.getByRole("listitem")).toHaveCount(3)
  await expect(encontradas.getByRole("listitem").first()).toContainText("Ana Teste")

  const projeto = test.info().project.name
  await page.screenshot({ path: `docs/pfc/evidencias/S05-M-busca-pessoas-${projeto}.png`, fullPage: true })
})

test("o _ é procurado como _, e os curingas do LIKE são recusados", async ({ page }) => {
  await entrarComoDavi(page)
  await page.goto("/feed")
  const area = await abrirBusca(page)

  // Sem o escape, "n_" acharia Ana e Bruno ("na", "no"). Contra o banco de verdade.
  await buscar(area, "n_")
  await expect(area.getByText("Ninguém encontrado para “n_”.")).toBeVisible()

  await buscar(area, "a%")
  await expect(area.getByText("Use letras, números, espaço e . _ - '")).toBeVisible()

  // A rota recusa sozinha, mesmo chamada direto.
  expect((await page.request.get("/api/social/perfis?busca=a%25")).status()).toBe(400)
  expect((await page.request.get("/api/social/perfis?busca=a*")).status()).toBe(400)
  expect(await (await page.request.get("/api/social/perfis?busca=n_")).json()).toEqual({ pessoas: [] })
})

test("o painel recolhe e expande no desktop, sem perder o foco nem o que foi buscado", async ({ page }) => {
  test.skip(noCelular(), "no celular a busca abre numa gaveta, sem recolher")
  await entrarComoDavi(page)
  await page.goto("/feed")

  const area = page.getByRole("complementary", { name: "Pessoas" })
  const campo = area.getByRole("searchbox", { name: "Buscar pessoas" })
  await buscar(area, "carla")
  await expect(area.getByText("Carla Teste")).toBeVisible()

  // Pelo teclado: o foco continua no botão, que troca de nome.
  await area.getByRole("button", { name: "Recolher a busca de pessoas" }).focus()
  await page.keyboard.press("Enter")
  await expect(campo).toBeHidden()
  await expect(area.getByRole("button", { name: "Expandir a busca de pessoas" })).toBeFocused()
  await expect(page.getByRole("region", { name: "Feed" })).toBeVisible()

  await page.keyboard.press("Enter")
  await expect(area.getByRole("button", { name: "Recolher a busca de pessoas" })).toBeFocused()
  await expect(campo).toHaveValue("carla")
  await expect(area.getByText("Carla Teste")).toBeVisible()
})

test("uma resposta atrasada não aparece no lugar da busca mais nova", async ({ page }) => {
  await entrarComoDavi(page)
  await page.goto("/feed")
  const area = await abrirBusca(page)

  // A busca por "bru" demora 2 s; antes disso a pessoa já trocou para "carla".
  await page.route(
    (url) => url.pathname === "/api/social/perfis" && url.searchParams.get("busca") === "bru",
    async (rota) => {
      await new Promise((pronto) => setTimeout(pronto, 2000))
      await rota.continue().catch(() => {}) // cancelada pelo navegador: tudo bem
    },
  )
  await buscar(area, "bru")
  await expect(area.getByText("Buscando...")).toBeVisible()
  await buscar(area, "carla")
  await expect(area.getByText("Carla Teste")).toBeVisible()

  // Passado o atraso, continua só a Carla.
  await page.waitForTimeout(2500)
  await expect(area.getByText("Carla Teste")).toBeVisible()
  await expect(area.getByText("Bruno Teste")).toHaveCount(0)
})

test("sessão expirada leva ao login, em vez de erro sem saída", async ({ page }) => {
  await entrarComoDavi(page)
  await page.goto("/feed")
  const area = await abrirBusca(page)

  // A rota responde 401 como se a sessão tivesse expirado. Apagar os cookies não
  // serve aqui: o contexto de autenticação percebe e leva ao login sozinho, num
  // tempo que varia, e o teste ficaria dependente de corrida.
  await page.route(
    (url) => url.pathname === "/api/social/perfis",
    (rota) => rota.fulfill({ status: 401, contentType: "application/json", body: '{"error":"Não autenticado"}' }),
  )
  await buscar(area, "carla")

  await expect(area.getByRole("alert").getByText("Sua sessão expirou.")).toBeVisible()
  // Só o destino: a sessão de verdade continua válida, e o proxy manda quem está
  // logado de /auth/login para o painel.
  await expect(area.getByRole("link", { name: "Entrar de novo" })).toHaveAttribute("href", "/auth/login")
})

test("mostra o erro da busca e deixa tentar de novo", async ({ page }) => {
  await entrarComoDavi(page)
  await page.goto("/feed")
  const area = await abrirBusca(page)

  const daBusca = (url: URL) => url.pathname === "/api/social/perfis"
  await page.route(daBusca, (rota) =>
    rota.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Erro interno do servidor"}' }),
  )
  await buscar(area, "carla")
  await expect(area.getByRole("alert").getByText("Não foi possível buscar agora.")).toBeVisible()

  await page.unroute(daBusca)
  await area.getByRole("button", { name: "Tentar de novo" }).click()
  await expect(area.getByRole("list", { name: "Pessoas encontradas" }).getByText("Carla Teste")).toBeVisible()
})

test("sem sessão, a aba manda para o login e a busca responde 401", async ({ page }) => {
  await page.goto("/feed")
  await page.waitForURL("/auth/login")

  expect((await page.request.get("/api/social/perfis?busca=carla")).status()).toBe(401)
})
