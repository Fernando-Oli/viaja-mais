import { test, expect } from "@playwright/test"

/**
 * Testes de fumaça: provam que o essencial está de pé. Só "rotas removidas"
 * entra com o usuário A do seed — ver o motivo no próprio bloco.
 */

test.describe("páginas públicas", () => {
  test("a landing page carrega e leva ao cadastro", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveTitle(/Viaja/i)

    const cadastrar = page.getByRole("link", { name: /cadastr|começar|criar conta/i }).first()
    await expect(cadastrar).toBeVisible()
    await cadastrar.click()
    await expect(page).toHaveURL(/\/auth\/sign-up/)
  })

  test("o login está acessível e pede e-mail e senha", async ({ page }) => {
    await page.goto("/auth/login")
    await expect(page.getByLabel(/e-?mail/i)).toBeVisible()
    await expect(page.getByLabel(/senha/i).first()).toBeVisible()
  })
})

test.describe("proteção de rotas", () => {
  // Regressão: o middleware precisa barrar o dashboard para quem não tem sessão.
  test("visitante anônimo é redirecionado do dashboard para o login", async ({ page }) => {
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  // Regressão de S01: antes, uma chamada de API sem sessão devolvia um 307 para
  // uma página HTML de login, o que quebra qualquer consumidor programático.
  test("a API responde 401 em JSON, não redireciona para HTML", async ({ request }) => {
    const resposta = await request.get("/api/trips", { maxRedirects: 0 })
    expect(resposta.status()).toBe(401)
    expect(resposta.headers()["content-type"]).toContain("application/json")
    expect(await resposta.json()).toMatchObject({ error: expect.any(String) })
  })
})

test.describe("rotas removidas", () => {
  // As páginas /login e /register usavam autenticação falsa em localStorage e
  // foram apagadas em S01. Se voltarem, este teste avisa.
  //
  // Com sessão, porque o visitante anônimo nunca chega a elas: o proxy manda
  // qualquer rota não pública para /auth/login, e o goto terminava num 200.
  for (const rota of ["/login", "/register"]) {
    test(`${rota} não existe mais`, async ({ page }) => {
      await page.goto("/auth/login")
      await page.fill("#email", "teste.a@viajamais.local")
      await page.fill("#password", "viajamais123")
      await page.click('button[type="submit"]')
      await page.waitForURL("/dashboard")

      const resposta = await page.goto(rota)
      expect(resposta?.status()).toBe(404)
    })
  }
})
