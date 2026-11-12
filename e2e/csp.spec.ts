import type { Page } from "@playwright/test"
import { test, expect, entrar, DONA } from "./fixtures/contas"

/**
 * @RNF02.12 política de segurança de conteúdo
 *
 * A CSP quebra em silêncio: o navegador só bloqueia e escreve no console. Por
 * isso aqui se confere, no build de produção, que o cabeçalho chega e que as
 * telas principais carregam sem nenhuma violação registrada — inclusive as
 * chamadas ao Supabase, que são as primeiras a parar se `connect-src` estiver
 * errado.
 *
 * O que NÃO se prova: o autocomplete do Google Maps, que não carrega com a
 * chave de teste do CI. Ele fica no roteiro manual do plano
 * (docs/plans/S06-F-rate-limit-csp.md, bloco 4).
 */

function coletarViolacoes(page: Page): string[] {
  const violacoes: string[] = []
  page.on("console", (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violacoes.push(msg.text())
  })
  return violacoes
}

test("o cabeçalho CSP chega e fecha as saídas", async ({ page }) => {
  const resposta = await page.goto("/auth/login")
  const csp = resposta?.headers()["content-security-policy"] ?? ""

  expect(csp).toContain("object-src 'none'")
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).toContain("https://maps.googleapis.com")
  expect(csp).not.toContain("'unsafe-eval'")
})

test("login, dashboard e viagem carregam sem violação de CSP", async ({ page }) => {
  const violacoes = coletarViolacoes(page)

  await entrar(page, DONA.email)
  await expect(page.getByRole("heading").first()).toBeVisible()

  const viagem = await page.request.post("/api/trips", {
    data: {
      title: `Viagem CSP ${Date.now()}`,
      destination: "Recife",
      start_date: "2026-12-01",
      end_date: "2026-12-10",
      currency: "BRL",
      status: "planning",
    },
  })
  expect(viagem.ok()).toBeTruthy()
  const tripId: string = (await viagem.json()).data[0].id

  for (const aba of ["", "?aba=lugares", "?aba=reservas"]) {
    await page.goto(`/dashboard/trips/${tripId}${aba}`)
    await page.waitForLoadState("networkidle")
  }
  await page.goto("/feed")
  await page.waitForLoadState("networkidle")

  expect(violacoes, violacoes.join("\n")).toEqual([])
})
