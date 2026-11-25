import { test, expect, type Page } from "@playwright/test"
import { entrar, DONA } from "./fixtures/contas"
import { zerarLimites } from "./fixtures/limite"

/**
 * Nova viagem com a Avori, ponta a ponta, com o gerador fake (AI_PROVIDER
 * padrão no CI): responder, revisar, editar, remover, criar — e conferir pela
 * API que a viagem criada tem exatamente o roteiro editado.
 *
 * Cada viagem criada aqui é apagada no fim do próprio teste.
 *
 * @RF12.1 gerar roteiro por IA · @RF12.2 revisar e editar antes de gravar ·
 * @RF12.3 descartar sem salvar
 */

const BUSCA_NO_MAPA = "https://www.google.com/maps/search/?api=1&query="

const URL_AVORI = "/dashboard/trips/criar/ia"

/** Daqui a 30 dias, no formato do campo de data: sempre no futuro, rode quando rodar. */
function inicioFuturo(): string {
  const d = new Date(Date.now() + 30 * 24 * 3600 * 1000)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function evidencia(page: Page, nome: string) {
  // Um arquivo por projeto (chromium, mobile): o mesmo nome faria o segundo sobrescrever o primeiro.
  const projeto = test.info().project.name
  return page.screenshot({ path: `docs/pfc/evidencias/S11-M-tela-roteiro-ia-${nome}-${projeto}.png`, fullPage: true })
}

async function responderTudo(page: Page, inicio: string) {
  await page.getByRole("button", { name: "Lisboa", exact: true }).click()

  await expect(page.getByText(/até 5 dias/)).toBeVisible()
  await expect(page.getByRole("button", { name: "6 dias" })).toHaveCount(0)
  await page.fill("#inicio", inicio)
  await page.getByRole("button", { name: "3 dias", exact: true }).click()
  await page.getByRole("button", { name: "Continuar" }).click()

  await page.getByRole("button", { name: "Em casal", exact: true }).click()
  await page.getByRole("button", { name: "Equilibrado", exact: true }).click()
  await page.getByRole("button", { name: "Moderado", exact: true }).click()
  await page.getByRole("button", { name: "Comida", exact: true }).click()
  await page.getByRole("button", { name: "História", exact: true }).click()
  await page.getByRole("button", { name: "Continuar" }).click()
}

test.beforeEach(async ({ page }) => {
  // O limite da IA (10 por hora) conta por pessoa; a suíte inteira usa a Ana do seed.
  await zerarLimites()
  await entrar(page, DONA.email)
})

test("a pessoa revisa, edita e cria a viagem com o roteiro da Avori", async ({ page }) => {
  const sufixo = Date.now()
  const inicio = inicioFuturo()
  await page.goto(URL_AVORI)
  await responderTudo(page, inicio)

  const dia1 = page.getByRole("article", { name: "Dia 1" })
  await expect(dia1).toBeVisible()
  // Prioridade do roteiro: assim que ele sai, o primeiro dia está na tela, sem rolar (no celular, a tela desce até ele).
  await expect(dia1).toBeInViewport()
  await expect(page.getByRole("article", { name: /^Dia \d$/ })).toHaveCount(3)
  // Gerador fake: o primeiro dia começa pelo check-in.
  await expect(page.getByRole("textbox", { name: "Título da atividade 1 do dia 1" })).toHaveValue("Check-in na hospedagem")

  // RF12.2: editar o título da viagem e de uma atividade, remover outra.
  const titulo = `Lisboa com a Avori ${sufixo}`
  await page.getByLabel("Título da viagem").fill(titulo)
  await page.getByRole("textbox", { name: "Título da atividade 2 do dia 1" }).fill(`Caminhada editada ${sufixo}`)
  const removida = await page.getByRole("textbox", { name: "Título da atividade 3 do dia 1" }).inputValue()
  const antes = await dia1.getByRole("textbox", { name: /^Título da atividade/ }).count()
  await page.getByRole("button", { name: "Remover atividade 3 do dia 1" }).click()
  await expect(dia1.getByRole("textbox", { name: /^Título da atividade/ })).toHaveCount(antes - 1)

  // Título apagado bloqueia "Criar viagem"; preenchido de novo, libera.
  const tituloDoCheckin = page.getByRole("textbox", { name: "Título da atividade 1 do dia 1" })
  await tituloDoCheckin.fill("")
  await expect(page.getByRole("button", { name: "Criar viagem" })).toBeDisabled()
  await expect(page.getByText("Toda atividade precisa de título e horário.")).toBeVisible()
  await tituloDoCheckin.fill("Check-in na hospedagem")

  const total = await page.getByRole("textbox", { name: /^Título da atividade/ }).count()

  // S14-F-ver-no-mapa: um "Ver no mapa" por atividade, abrindo a busca do Google
  // Maps em nova aba. O gerador fake não informa o lugar, então a busca usa o
  // título atual (inclusive o editado) e o destino. O link não é clicado: o teste
  // não sai para o Google.
  await expect(page.getByRole("link", { name: /^Ver no mapa: / })).toHaveCount(total)
  const mapaDoCheckin = page.getByRole("link", { name: "Ver no mapa: Check-in na hospedagem (abre em nova aba)" })
  await expect(mapaDoCheckin).toHaveAttribute("href", BUSCA_NO_MAPA + encodeURIComponent("Check-in na hospedagem, Lisboa"))
  await expect(mapaDoCheckin).toHaveAttribute("target", "_blank")
  await expect(mapaDoCheckin).toHaveAttribute("rel", /\bnoopener\b/)
  await expect(mapaDoCheckin).toHaveAttribute("rel", /\bnoreferrer\b/)
  await expect(page.getByRole("link", { name: `Ver no mapa: Caminhada editada ${sufixo} (abre em nova aba)` })).toHaveAttribute(
    "href",
    BUSCA_NO_MAPA + encodeURIComponent(`Caminhada editada ${sufixo}, Lisboa`),
  )
  await dia1.screenshot({ path: `docs/pfc/evidencias/S14-F-ver-no-mapa-${test.info().project.name}.png` })

  await evidencia(page, "01-revisao")

  await page.getByRole("button", { name: "Criar viagem" }).click()
  await page.waitForURL(/\/dashboard\/trips\/[0-9a-f-]{36}$/)
  const tripId = page.url().split("/").pop()!

  try {
    await expect(page.getByRole("heading", { name: titulo })).toBeVisible()
    await expect(page.getByText(`Caminhada editada ${sufixo}`)).toBeVisible()
    await evidencia(page, "02-viagem-criada")

    // A viagem tem exatamente o roteiro revisado: mesma quantidade, a edição
    // dentro, a removida fora do primeiro dia.
    const resposta = await page.request.get(`/api/trips/${tripId}/itinerary`)
    expect(resposta.ok()).toBeTruthy()
    const { itinerary } = (await resposta.json()) as { itinerary: Array<{ title: string; date: string; status: string }> }
    expect(itinerary).toHaveLength(total)
    expect(itinerary.every((i) => i.status === "planned")).toBe(true)
    const doPrimeiroDia = itinerary.filter((i) => i.date === inicio).map((i) => i.title)
    expect(doPrimeiroDia).toContain(`Caminhada editada ${sufixo}`)
    expect(doPrimeiroDia).not.toContain(removida)
    expect(new Set(itinerary.map((i) => i.date)).size).toBe(3)
  } finally {
    await page.request.delete(`/api/trips/${tripId}`)
  }
})

// Regressão (pedido do Micael, 20/11): as perguntas e o roteiro esticavam a página.
// Agora cada painel tem altura fixa e rolagem própria.
test("conversa e roteiro rolam por dentro, sem barra visível e com indicador, e o roteiro tem o maior espaço (desktop)", async ({ page }) => {
  test.skip(test.info().project.name !== "chromium", "no celular os painéis ficam um embaixo do outro, cada um com uma tela")
  await page.goto(URL_AVORI)
  await responderTudo(page, inicioFuturo())
  await expect(page.getByRole("article", { name: "Dia 1" })).toBeVisible()

  const medidas = await page.evaluate(() => {
    const rola = (el: Element | null) => (el ? el.scrollHeight > el.clientHeight + 1 : false)
    const dias = document.querySelector('[aria-label="Dias do roteiro"]')
    const conversa = document.querySelector('[aria-label="Conversa"] .overflow-y-auto')
    return {
      pagina: document.documentElement.scrollHeight,
      janela: window.innerHeight,
      alturaDosDias: dias?.clientHeight ?? 0,
      diasRolam: rola(dias),
      conversaRola: rola(conversa),
    }
  })

  expect(medidas.pagina).toBeLessThanOrEqual(medidas.janela + 2)
  // Prioridade de espaço (pedido do Micael, 20/11): o roteiro tem ao menos metade da altura da janela.
  expect(medidas.alturaDosDias).toBeGreaterThanOrEqual(medidas.janela * 0.5)
  expect(medidas.diasRolam).toBe(true)
  expect(medidas.conversaRola).toBe(true)
  // O horário aparece inteiro (a coluna estreita cortava "14:00" em "14:0") e "Criar viagem" está liberado.
  // O campo nativo de hora não expõe o corte pelo scrollWidth; mede-se a largura (92px cortava, 104px cabe).
  const caixa = await page.getByLabel("Horário da atividade 1 do dia 1").boundingBox()
  expect(caixa?.width ?? 0).toBeGreaterThanOrEqual(100)
  await expect(page.getByRole("button", { name: "Criar viagem" })).toBeEnabled()

  // Barras de rolagem escondidas, com esmaecido e setinha no lugar (pedido do Micael, 20/11).
  const dias = page.locator('[aria-label="Dias do roteiro"]')
  const conversa = page.locator('[aria-label="Conversa"] .overflow-y-auto')
  for (const area of [dias, conversa]) {
    expect(await area.evaluate((el) => getComputedStyle(el).scrollbarWidth)).toBe("none")
  }

  const maisDoRoteiro = page.getByRole("button", { name: "Ver mais do roteiro" })
  await expect(maisDoRoteiro).toBeVisible()
  await maisDoRoteiro.click()
  await expect.poll(() => dias.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
  await dias.evaluate((el) => el.scrollTo({ top: el.scrollHeight }))
  await expect(maisDoRoteiro).toBeHidden()

  // A conversa desce sozinha até a última mensagem; subindo, o indicador aparece.
  const maisDaConversa = page.getByRole("button", { name: "Ver o resto da conversa" })
  await expect(maisDaConversa).toBeHidden()
  await conversa.evaluate((el) => el.scrollTo({ top: 0 }))
  await expect(maisDaConversa).toBeVisible()
  await evidencia(page, "05-rolagem")
})

test("Refazer descarta o roteiro sem gravar nada", async ({ page }) => {
  const escritas: string[] = []
  page.on("request", (r) => {
    if (r.method() !== "GET" && /\/api\/trips/.test(r.url())) escritas.push(`${r.method()} ${r.url()}`)
  })

  await page.goto(URL_AVORI)
  await responderTudo(page, inicioFuturo())
  await expect(page.getByRole("article", { name: "Dia 1" })).toBeVisible()

  await page.getByRole("button", { name: "Refazer" }).click()

  await expect(page.getByText("Pergunta 1 de 6")).toBeVisible()
  await expect(page.getByRole("button", { name: "Lisboa", exact: true })).toBeVisible()
  await expect(page.getByRole("article", { name: "Dia 1" })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "Criar viagem" })).toBeDisabled()
  expect(escritas).toEqual([])
  await evidencia(page, "03-refazer")
})

test("erro da Avori aparece com a mensagem e 'Tentar de novo' gera", async ({ page }) => {
  let primeira = true
  await page.route("**/api/roteiros/gerar", async (rota) => {
    if (primeira) {
      primeira = false
      await rota.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "A Avori está indisponível agora. Tente de novo em alguns minutos." }),
      })
      return
    }
    await rota.continue()
  })

  await page.goto(URL_AVORI)
  await responderTudo(page, inicioFuturo())

  await expect(page.getByRole("alert").filter({ hasText: "A Avori está indisponível agora" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Criar viagem" })).toBeDisabled()
  await evidencia(page, "04-erro")

  await page.getByRole("button", { name: "Tentar de novo" }).click()
  await expect(page.getByRole("article", { name: "Dia 1" })).toBeVisible()
})
