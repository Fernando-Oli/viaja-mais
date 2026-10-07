import { test, expect, type Page } from "@playwright/test"

/**
 * @RF02.5 @RF02.6 @RF02.7 editar username, bio e visibilidade pela tela de
 * Configurações.
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
  await page.getByRole("button", { name: "Salvar Alterações" }).click()
}

test("edita bio e visibilidade, e recusa username em uso, reservado ou em branco", async ({ page }) => {
  await entrarComoDavi(page)
  try {
    await page.goto("/dashboard/settings")

    // O formulário só aparece depois de carregar o perfil pela rota.
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

test("mostra o erro quando o perfil não carrega", async ({ page }) => {
  await entrarComoDavi(page)
  await page.route("**/api/social/perfil", (rota) =>
    rota.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Erro interno do servidor"}' }),
  )

  await page.goto("/dashboard/settings")

  await expect(page.getByRole("alert").filter({ hasText: "Não foi possível carregar seu perfil" })).toBeVisible()
  await expect(page.locator("#username")).toHaveCount(0)
})
