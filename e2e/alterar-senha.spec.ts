import { test, expect } from "@playwright/test"

/**
 * @RF02.3 alterar a senha — regressão.
 *
 * O bug: o formulário chamava `e.currentTarget.reset()` depois de um `await`,
 * quando o React já zerou o `currentTarget`. A senha mudava, mas o reset
 * estourava: os campos continuavam preenchidos e um toast de erro aparecia logo
 * depois do de sucesso. Este teste falha com o bug e passa com a correção.
 *
 * Usa o Davi, usuário do seed reservado aos E2E de perfil, e devolve a senha
 * original no fim.
 */

const SENHA_DO_SEED = "viajamais123"
const SENHA_NOVA = "viajamais456"

test("troca a senha, limpa o formulário e não mostra erro", async ({ page }) => {
  await page.goto("/auth/login")
  await page.fill("#email", "teste.d@viajamais.local")
  await page.fill("#password", SENHA_DO_SEED)
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")

  try {
    await page.goto("/dashboard/settings")
    await page.fill("#current_password", SENHA_DO_SEED)
    await page.fill("#new_password", SENHA_NOVA)
    await page.fill("#confirm_password", SENHA_NOVA)
    await page.getByRole("button", { name: "Alterar Senha" }).click()

    await expect(page.getByText("Senha alterada").first()).toBeVisible()
    // Formulário limpo é a prova de que o reset rodou.
    await expect(page.locator("#current_password")).toHaveValue("")
    await expect(page.locator("#new_password")).toHaveValue("")
    await expect(page.locator("#confirm_password")).toHaveValue("")
    await expect(page.getByText(/Cannot read properties/)).toHaveCount(0)
  } finally {
    // Volta a senha do seed. Se a troca nem chegou a acontecer, a rota responde
    // "senha atual incorreta" e não há nada a desfazer.
    await page.request.post("/api/auth/change-password", {
      form: { current_password: SENHA_NOVA, new_password: SENHA_DO_SEED, confirm_password: SENHA_DO_SEED },
    })
  }
})
