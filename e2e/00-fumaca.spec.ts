import { test, expect } from "@playwright/test"
import { SENHA_TESTE } from "../tests/fixtures/usuarios"

/**
 * Testes de fumaça: provam que o essencial está de pé. Só "rotas removidas"
 * entra com o usuário A do seed — ver o motivo no próprio bloco.
 */

test.describe("páginas públicas", () => {
  test("a landing page carrega e leva ao cadastro", async ({ page }) => {
    await page.goto("/")
    await expect(page).toHaveTitle(/Avori/i)

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

test.describe("verificação de saúde", () => {
  // @RNF04.1 — o monitor de disponibilidade consulta esta rota sem sessão.
  test("responde 200 sem sessão, com o banco ok e sem cache", async ({ request }) => {
    const r = await request.get("/api/saude")
    expect(r.status()).toBe(200)
    expect(await r.json()).toMatchObject({ status: "ok", banco: "ok" })
    expect(r.headers()["cache-control"]).toBe("no-store")
  })
})

test.describe("proteção de rotas", () => {
  // @RF01.6 barra o acesso não autenticado às rotas protegidas.
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

test.describe("sessão", () => {
  // @RF01.3 entra com e-mail e senha · @RF01.5 a sessão se mantém entre
  // requisições · @RF01.4 encerra a sessão
  test("entra com e-mail e senha, a sessão vale entre páginas e o Sair a encerra", async ({ page }) => {
    await page.goto("/auth/login")
    await page.fill("#email", "teste.a@viajamais.local")
    await page.fill("#password", SENHA_TESTE)
    await page.click('button[type="submit"]')
    await page.waitForURL("/dashboard")

    // Outra página protegida e um recarregamento completo: o cookie de sessão
    // é lido e renovado pelo proxy a cada requisição, sem novo login.
    await page.goto("/dashboard/trips")
    await expect(page).toHaveURL(/\/dashboard\/trips/)
    await page.reload()
    await expect(page).toHaveURL(/\/dashboard\/trips/)

    await page.getByRole("button", { name: /minha conta/i }).click()
    await page.getByRole("menuitem", { name: "Sair" }).click()
    // Sai da área logada: o painel, sem usuário, leva ao login antes de a
    // navegação para a página inicial terminar; os dois destinos servem.
    await page.waitForURL((url) => !url.pathname.startsWith("/dashboard"))

    // Encerrada de fato: a área logada volta a exigir login.
    await page.goto("/dashboard")
    await expect(page).toHaveURL(/\/auth\/login/)
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
      await page.fill("#password", SENHA_TESTE)
      await page.click('button[type="submit"]')
      await page.waitForURL("/dashboard")

      const resposta = await page.goto(rota)
      expect(resposta?.status()).toBe(404)
    })
  }
})
