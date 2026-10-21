import { test, expect, type Locator, type Page } from "@playwright/test"

/**
 * @RF02.8 @RF09.1 @RF09.2 @RF09.5 o perfil de outra pessoa, aberto pela busca, e
 * seguir, solicitar e desfazer.
 *
 * Quem age é o Davi, usuário do seed reservado aos specs de perfil. Ele segue a
 * Carla (perfil público) e solicita ao Bruno (privado). No fim, o teste apaga os
 * vínculos que criou, pela própria rota: os testes de RLS contam com Ana, Bruno
 * e Carla sem vínculos, como o seed os deixa.
 */

async function entrarComoDavi(page: Page) {
  await page.goto("/auth/login")
  await page.fill("#email", "teste.d@viajamais.local")
  await page.fill("#password", "viajamais123")
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")
}

const noCelular = () => test.info().project.name === "mobile"

async function desfazerVinculos(page: Page) {
  // Só depois do login: sem sessão o DELETE daria 401 e esconderia a falha real.
  for (const username of ["carla", "bruno"]) {
    const resposta = await page.request.delete(`/api/social/perfis/${username}/seguir`)
    expect(resposta.ok(), `o vínculo do Davi com @${username} precisa sair no fim`).toBeTruthy()
  }
}

/** Quantos seguidores o cartão mostra agora. */
async function seguidores(perfil: Locator) {
  const texto = await perfil.getByText(/\d+ seguidor(es)?/).textContent()
  return Number(texto!.match(/\d+/)![0])
}

test("abre o perfil público pela busca, segue e deixa de seguir", async ({ page }) => {
  // Passo 9 do roteiro: nada sai do navegador direto para a tabela (regra 1 do CLAUDE.md).
  const direto: string[] = []
  page.on("request", (pedido) => {
    if (pedido.url().includes("/rest/v1/follows")) direto.push(`${pedido.method()} ${pedido.url()}`)
  })

  await entrarComoDavi(page)
  try {
    await page.goto("/feed")
    if (noCelular()) await page.getByRole("button", { name: "Buscar pessoas" }).click()
    const area = noCelular() ? page.getByRole("dialog", { name: "Pessoas" }) : page.getByRole("complementary", { name: "Pessoas" })
    await area.getByRole("searchbox", { name: "Buscar pessoas" }).fill("carla")
    await area.getByRole("link", { name: /Carla Teste/ }).click()
    await page.waitForURL("/u/carla")

    const perfil = page.getByRole("region", { name: "Perfil de @carla" })
    await expect(perfil.getByRole("heading", { name: "Carla Teste" })).toBeVisible()
    if (noCelular()) {
      // No celular a gaveta fecha ao escolher a pessoa, e reabre com o termo e os
      // resultados (regressão: a busca desmontava com a gaveta e perdia tudo).
      await expect(page.getByRole("dialog", { name: "Pessoas" })).toHaveCount(0)
      await page.getByRole("button", { name: "Buscar pessoas" }).click()
      await expect(area.getByRole("searchbox", { name: "Buscar pessoas" })).toHaveValue("carla")
      await expect(area.getByRole("link", { name: /Carla Teste/ })).toBeVisible()
      await page.keyboard.press("Escape")
      await expect(page.getByRole("dialog", { name: "Pessoas" })).toHaveCount(0)
    } else {
      // No desktop o painel continua lá, com o termo e o resultado.
      await expect(area.getByRole("searchbox", { name: "Buscar pessoas" })).toHaveValue("carla")
      await expect(area.getByRole("link", { name: /Carla Teste/ })).toBeVisible()
    }
    await expect(page.getByRole("region", { name: "Viagens publicadas" }).getByText("Nenhuma viagem publicada ainda.")).toBeVisible()

    const antes = await seguidores(perfil)
    await perfil.getByRole("button", { name: "Seguir" }).click()
    await expect(perfil.getByRole("button", { name: "Seguindo" })).toBeVisible()
    await expect.poll(() => seguidores(perfil)).toBe(antes + 1)
    // Regressão: o botão trocado levava o foco para o body, e nada era anunciado.
    await expect(perfil.getByRole("button", { name: "Seguindo" })).toBeFocused()
    await expect(perfil.getByRole("status")).toHaveText("Você está seguindo @carla.")

    const projeto = test.info().project.name
    await page.screenshot({ path: `docs/pfc/evidencias/S05-M-seguir-publico-${projeto}.png`, fullPage: true })

    // Desfazer passa pelo menu, com a confirmação.
    await perfil.getByRole("button", { name: "Seguindo" }).click()
    await page.getByRole("menuitem", { name: "Deixar de seguir" }).click()
    await expect(perfil.getByRole("button", { name: "Seguir" })).toBeVisible()
    await expect.poll(() => seguidores(perfil)).toBe(antes)
    await expect(perfil.getByRole("button", { name: "Seguir" })).toBeFocused()
    await expect(perfil.getByRole("status")).toHaveText("Você deixou de seguir @carla.")

    expect(direto, "nenhuma requisição do navegador a /rest/v1/follows").toEqual([])
  } finally {
    await desfazerVinculos(page)
  }
})

test("se seguir falha, o foco volta ao botão, e nada muda", async ({ page }) => {
  await entrarComoDavi(page)
  try {
    // Falha simulada no navegador: o pedido nem chega ao servidor.
    await page.route("**/api/social/perfis/carla/seguir", (rota) =>
      rota.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "Erro interno do servidor" }) }),
    )
    await page.goto("/u/carla")
    const perfil = page.getByRole("region", { name: "Perfil de @carla" })
    await perfil.getByRole("button", { name: "Seguir" }).click()

    // Regressão: o botão desabilitado durante o pedido largava o foco no body.
    await expect(page.getByText("Erro interno do servidor").first()).toBeVisible()
    await expect(perfil.getByRole("button", { name: "Seguir" })).toBeEnabled()
    await expect(perfil.getByRole("button", { name: "Seguir" })).toBeFocused()
  } finally {
    await page.unrouteAll()
    await desfazerVinculos(page)
  }
})

test("com a sessão vencida, seguir oferece entrar de novo", async ({ page }) => {
  await entrarComoDavi(page)
  try {
    await page.goto("/u/carla")
    const perfil = page.getByRole("region", { name: "Perfil de @carla" })
    await expect(perfil.getByRole("button", { name: "Seguir" })).toBeVisible()

    // A sessão acaba com a página aberta; o pedido de seguir volta 401.
    await page.context().clearCookies()
    await perfil.getByRole("button", { name: "Seguir" }).click()

    // Regressão: antes, só um toast "Não autenticado", sem caminho para o login.
    const aviso = page.getByRole("alert").filter({ hasText: "Sua sessão expirou." })
    await expect(aviso).toBeVisible()
    await expect(aviso.getByRole("link", { name: "Entrar de novo" })).toHaveAttribute("href", "/auth/login")
  } finally {
    // Se o 401 regredir e o vínculo nascer, ele não pode ficar no banco.
    await entrarComoDavi(page)
    await desfazerVinculos(page)
  }
})

test("no perfil privado, solicita sem mudar o contador e cancela a solicitação", async ({ page }) => {
  await entrarComoDavi(page)
  try {
    await page.goto("/u/bruno")

    const perfil = page.getByRole("region", { name: "Perfil de @bruno" })
    await expect(perfil.getByText("Perfil privado", { exact: true })).toBeVisible()
    const viagens = page.getByRole("region", { name: "Viagens publicadas" })
    await expect(viagens.getByText("Esta conta é privada")).toBeVisible()

    // Os números aparecem também em perfil privado (decisão do Micael).
    const antes = await seguidores(perfil)
    await perfil.getByRole("button", { name: "Solicitar" }).click()
    await expect(perfil.getByRole("button", { name: "Solicitado" })).toBeVisible()
    await expect(viagens.getByText(/Sua solicitação está pendente/)).toBeVisible()
    expect(await seguidores(perfil)).toBe(antes)

    const projeto = test.info().project.name
    await page.screenshot({ path: `docs/pfc/evidencias/S05-M-seguir-privado-${projeto}.png`, fullPage: true })

    await perfil.getByRole("button", { name: "Solicitado" }).click()
    await page.getByRole("menuitem", { name: "Cancelar solicitação" }).click()
    await expect(perfil.getByRole("button", { name: "Solicitar" })).toBeVisible()
  } finally {
    await desfazerVinculos(page)
  }
})

test("o próprio perfil mostra Editar perfil, e quem não existe mostra não encontrado", async ({ page }) => {
  await entrarComoDavi(page)

  await page.goto("/u/davi")
  const perfil = page.getByRole("region", { name: "Perfil de @davi" })
  await expect(perfil.getByRole("link", { name: "Editar perfil" })).toBeVisible()
  await expect(perfil.getByRole("button", { name: /Seguir|Solicitar/ })).toHaveCount(0)

  await page.goto("/u/nao_existe")
  await expect(page.getByRole("heading", { name: "Perfil não encontrado" })).toBeVisible()
})

test("seguir a si mesmo é recusado pela rota", async ({ page }) => {
  await entrarComoDavi(page)

  const resposta = await page.request.post("/api/social/perfis/davi/seguir")
  expect(resposta.status()).toBe(400)
})

test("sem sessão, o perfil manda para o login e as rotas respondem 401", async ({ page }) => {
  await page.goto("/u/carla")
  await page.waitForURL("/auth/login")

  expect((await page.request.get("/api/social/perfis/carla")).status()).toBe(401)
  expect((await page.request.post("/api/social/perfis/carla/seguir")).status()).toBe(401)
})
