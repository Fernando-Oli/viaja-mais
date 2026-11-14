import AxeBuilder from "@axe-core/playwright"
import type { Page } from "@playwright/test"
import { test, expect } from "./fixtures/contas"

/**
 * @RNF03.5 acessibilidade WCAG 2.1 AA · @RNF03.1 interface responsiva
 *
 * Passa as telas principais pelo axe-core com as regras WCAG 2.1 níveis A e AA,
 * nos dois projetos do Playwright (desktop e celular): a barra lateral, por
 * exemplo, só perde o texto dos links na largura de celular.
 * O teste falha com a lista de violações — regra, impacto e seletor de cada
 * elemento —, para quem lê o log do CI saber o que corrigir sem rodar de novo.
 *
 * O axe pega o que é verificável por máquina (contraste, nome acessível,
 * rótulo de campo, hierarquia de ARIA). Foco visível e navegação por teclado
 * ficam no roteiro manual do plano (docs/plans/S10-A-cobertura.md, bloco 4).
 */

const REGRAS_WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

async function semViolacoes(page: Page, tela: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(REGRAS_WCAG).analyze()

  const resumo = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help}\n` +
      v.nodes
        .map((n) => `    ${n.target.join(" ")}\n      ${n.html.slice(0, 160)}\n      ${n.failureSummary?.split("\n")[1] ?? ""}`)
        .join("\n"),
  )
  // `soft`: uma tela com problema não esconde as seguintes no mesmo relatório.
  expect.soft(resumo, `violações de acessibilidade em "${tela}"`).toEqual([])
}

test("telas públicas: login e cadastro", async ({ page }) => {
  await page.goto("/auth/login")
  await expect(page.locator("#email")).toBeVisible()
  await semViolacoes(page, "login")

  await page.goto("/auth/sign-up")
  await expect(page.locator("#fullName")).toBeVisible()
  await semViolacoes(page, "cadastro")
})

test("telas logadas: dashboard, viagem, avaliações e nova atividade", async ({ dona }) => {
  const { page } = dona
  await expect(page.getByRole("heading").first()).toBeVisible()
  await semViolacoes(page, "dashboard")

  // Viagem e lugar pela API: a busca do Google não carrega com a chave de teste.
  const sufixo = Date.now()
  const viagem = await page.request.post("/api/trips", {
    data: {
      title: `Viagem acessível ${sufixo}`,
      destination: "Recife",
      start_date: "2026-12-01",
      end_date: "2026-12-10",
      currency: "BRL",
      status: "planning",
    },
  })
  expect(viagem.ok()).toBeTruthy()
  const tripId: string = (await viagem.json()).data[0].id
  const nome = `Marco Zero ${sufixo}`
  const lugar = await page.request.post(`/api/trips/${tripId}/places`, {
    data: { name: nome, latitude: -8.0631, longitude: -34.8711, place_id: `a11y-${sufixo}` },
  })
  expect(lugar.ok()).toBeTruthy()

  await page.goto(`/dashboard/trips/${tripId}`)
  await expect(page.getByRole("heading", { name: `Viagem acessível ${sufixo}` })).toBeVisible()
  await semViolacoes(page, "detalhe da viagem")

  await page.goto(`/dashboard/trips/${tripId}?aba=lugares`)
  await page.getByRole("listitem").filter({ hasText: nome }).getByRole("button", { name: "Avaliações" }).click()
  const dialogo = page.getByRole("dialog")
  await expect(dialogo.getByText("Nenhuma avaliação ainda")).toBeVisible()
  // O axe mede cor: no meio do fade-in o fundo ainda não é o final e o
  // contraste sai menor do que é (4,47 com o fundo a meio caminho).
  await dialogo.evaluate((el) => Promise.allSettled(el.getAnimations({ subtree: true }).map((a) => a.finished)))
  await semViolacoes(page, "diálogo de avaliações")
  await page.keyboard.press("Escape")

  await page.goto(`/dashboard/trips/${tripId}/itinerary/new`)
  await expect(page.locator("#title")).toBeVisible()
  await semViolacoes(page, "nova atividade do itinerário")
})

test("telas novas da Avori: landing, criar viagem, prévias e compra", async ({ dona }) => {
  const { page } = dona
  const telas: [string, string, string][] = [
    ["/dashboard/trips/criar", "criar viagem: escolha", "Como você quer criar a viagem?"],
    ["/dashboard/trips/criar/ia", "criar viagem com a Avori", "Nova viagem com a Avori"],
    ["/dashboard/trips/new", "criar viagem do meu jeito", "Criar do meu jeito"],
    ["/feed", "feed (prévia)", "Feed"],
    ["/dashboard/bookings", "reservas com a busca", "Reservas"],
    ["/dashboard/reservar/voos", "voos (prévia)", "Voos para Lisboa"],
    ["/dashboard/reservar/hoteis", "hotéis (prévia)", "Hotéis em Lisboa"],
  ]
  for (const [rota, tela, titulo] of telas) {
    await page.goto(rota)
    await expect(page.getByRole("heading", { level: 1, name: titulo })).toBeVisible()
    await semViolacoes(page, tela)
  }

  // A página inicial pública, com a mesma sessão (a landing não depende dela).
  await page.goto("/")
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await semViolacoes(page, "página inicial")
})
