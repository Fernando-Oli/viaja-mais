import { test, expect, type Page } from "@playwright/test"

/**
 * @RF02.1 @RF02.5 @RF02.6 @RF02.7 ver e editar o próprio perfil na página
 * Perfil, aberta pelo menu do usuário.
 *
 * Usa o Davi, usuário do seed reservado a este spec: os testes de RLS contam
 * com Ana, Bruno e Carla exatamente como o seed os deixa, e um E2E interrompido
 * no meio não pode quebrá-los. Mesmo assim o Davi volta ao estado do seed no
 * fim, para a próxima execução partir do mesmo lugar.
 */

const DAVI_NO_SEED = { username: "davi", bio: "Viajante de teste — usado pelo E2E de perfil.", is_public: true }

async function entrarComoDavi(page: Page) {
  await page.goto("/auth/login")
  await page.fill("#email", "teste.d@viajamais.local")
  await page.fill("#password", "viajamais123")
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")
}

async function salvar(page: Page) {
  await page.getByRole("button", { name: "Salvar perfil" }).click()
}

test("abre Perfil pelo menu do usuário, edita e recusa username em uso, reservado ou em branco", async ({ page }) => {
  await entrarComoDavi(page)
  try {
    // O caminho de quem usa: clicar no avatar/nome e escolher "Meu perfil".
    await page.locator('button[aria-haspopup="menu"]').click()
    await page.getByRole("menuitem", { name: "Meu perfil" }).click()
    await page.waitForURL("/dashboard/perfil")

    const cartao = page.getByRole("region", { name: "Como os outros veem seu perfil" })
    await expect(cartao.getByText("@davi")).toBeVisible()
    await expect(cartao.getByText("Público")).toBeVisible()
    await expect(page.locator("#username")).toHaveValue("davi")
    const visibilidade = page.getByRole("switch", { name: "Perfil público" })
    await expect(visibilidade).toHaveAttribute("aria-checked", "true")

    // Sem mudança, nada vai ao servidor.
    await salvar(page)
    await expect(page.getByText("Nada para salvar").first()).toBeVisible()

    // Bio única por execução: prova que o valor salvo é o desta rodada.
    const bio = `Bio editada pelo E2E ${Date.now()}`
    await page.fill("#bio", bio)
    await visibilidade.click()
    await salvar(page)
    await expect(page.getByText("Perfil atualizado").first()).toBeVisible()

    // O cartão mostra o que ficou gravado.
    await expect(cartao.getByText(bio)).toBeVisible()
    await expect(cartao.getByText("Privado")).toBeVisible()

    // Recarregar prova que gravou no banco, não só no estado da tela.
    await page.reload()
    await expect(page.locator("#bio")).toHaveValue(bio)
    await expect(page.getByRole("switch", { name: "Perfil público" })).toHaveAttribute("aria-checked", "false")

    const projeto = test.info().project.name
    await page.screenshot({ path: `docs/pfc/evidencias/S04-M-editar-perfil-${projeto}.png`, fullPage: true })

    // Username de outra pessoa: 409 com mensagem própria.
    await page.fill("#username", "ana")
    await salvar(page)
    await expect(page.getByText("Esse nome de usuário já está em uso").first()).toBeVisible()

    // Reservado, mesmo com maiúscula: 400 com o motivo.
    await page.fill("#username", "Admin")
    await salvar(page)
    await expect(page.getByText(/reservado/).first()).toBeVisible()

    // Em branco: recusado na tela, sem fingir que salvou.
    await page.fill("#username", "")
    await salvar(page)
    await expect(page.getByText(/não dá para deixar em branco/).first()).toBeVisible()

    await page.reload()
    await expect(page.locator("#username")).toHaveValue("davi")
  } finally {
    // Só depois do login: sem sessão o PATCH daria 401 e esconderia a falha real.
    const restaurado = await page.request.patch("/api/social/perfil", { data: DAVI_NO_SEED })
    expect(restaurado.ok(), "o Davi precisa voltar ao estado do seed").toBeTruthy()
  }
})

test("Configurações fica só com conta e senha, e aponta para o Perfil", async ({ page }) => {
  await entrarComoDavi(page)
  await page.goto("/dashboard/settings")

  await expect(page.locator("#current_password")).toBeVisible()
  await expect(page.locator("#username")).toHaveCount(0)
  await expect(page.locator("#bio")).toHaveCount(0)

  await page.getByRole("link", { name: "Meu perfil" }).click()
  await page.waitForURL("/dashboard/perfil")
})

test("mostra o erro quando o perfil não carrega", async ({ page }) => {
  await entrarComoDavi(page)
  await page.route("**/api/social/perfil", (rota) =>
    rota.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Erro interno do servidor"}' }),
  )

  await page.goto("/dashboard/perfil")

  await expect(page.getByRole("alert").filter({ hasText: "Não foi possível carregar seu perfil" })).toBeVisible()
  await expect(page.locator("#username")).toHaveCount(0)
})
