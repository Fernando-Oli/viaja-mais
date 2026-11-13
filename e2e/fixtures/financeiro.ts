import { expect, type Browser, type Page } from "@playwright/test"
import { cadastrar, convidar, entrar, idDe } from "./contas"
import { SENHA_TESTE as SENHA } from "../../tests/fixtures/usuarios"
export { SENHA }
export { entrar, idDe }

/**
 * Preparo e leitura de tela compartilhados pelos E2E do fluxo financeiro.
 *
 * Só o que é estrutural passa pela API: contas, viagem e convite. Despesa,
 * rateio e pagamento são ações da jornada e acontecem pela tela, nas specs.
 *
 * Usuários: Ana e Bruno do seed (`supabase/seed.sql`) e uma terceira conta
 * criada pelo cadastro a cada preparo — o seed só tem duas, e o acerto com
 * uma cadeia de dívidas precisa de três pessoas.
 */

export const ANA = "teste.a@viajamais.local"
export const BRUNO = "teste.b@viajamais.local"

/** Troca a sessão da página: sai de quem estava e entra como `email`. */
export async function trocarPara(page: Page, email: string) {
  await page.context().clearCookies()
  await entrar(page, email)
}

async function sessao(browser: Browser, email: string) {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await entrar(page, email)
  return { ctx, api: page.request }
}

export interface ViagemDeTres {
  tripId: string
  /** E-mail da terceira conta, criada agora pelo cadastro. */
  emailC: string
  ids: { ana: string; bruno: string; carla: string }
}

/**
 * Viagem nova da Ana com Bruno e uma terceira conta (Carla) como membros, sem
 * nenhuma despesa. Cada chamada cria a sua: os testes não dividem estado.
 */
export async function prepararViagemDeTres(browser: Browser, prefixo: string): Promise<ViagemDeTres> {
  const sufixo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const emailC = `${prefixo}.c.${sufixo}@viajamais.local`

  const ctxC = await browser.newContext()
  const pageC = await ctxC.newPage()
  await cadastrar(pageC, "Carla Financeiro", emailC)

  const ana = await sessao(browser, ANA)
  const bruno = await sessao(browser, BRUNO)

  // Viagem pela API: o Destino de "Nova Viagem" depende do Google Places.
  const resposta = await ana.api.post("/api/trips", {
    data: {
      title: `Financeiro ${prefixo} ${sufixo}`,
      destination: "Pirenópolis",
      start_date: "2026-12-01",
      end_date: "2026-12-05",
      currency: "BRL",
      status: "planning",
    },
  })
  expect(resposta.ok()).toBeTruthy()
  const tripId = (await resposta.json()).data[0].id as string

  await convidar(ana.api, bruno.api, BRUNO, tripId)
  await convidar(ana.api, pageC.request, emailC, tripId)

  const [idAna, idBruno, idCarla] = await Promise.all([idDe(ANA), idDe(BRUNO), idDe(emailC)])
  await Promise.all([ana.ctx.close(), bruno.ctx.close(), ctxC.close()])

  return { tripId, emailC, ids: { ana: idAna, bruno: idBruno, carla: idCarla } }
}

/**
 * Rótulo que a tela dá a `alvo` para quem consulta como `consultaId`: "Você",
 * depois a dona, depois os demais por id — a mesma regra de
 * `lib/finance/acerto.ts` e da tela de nova despesa.
 */
export function rotuloPara(consultaId: string, alvo: string, viagem: ViagemDeTres) {
  if (alvo === consultaId) return "Você"
  const { ana, bruno, carla } = viagem.ids
  const outros = [bruno, carla].filter((id) => id !== consultaId).sort((a, b) => a.localeCompare(b))
  const ordem = [consultaId, ...(consultaId === ana ? [] : [ana]), ...outros]
  return `Participante ${ordem.indexOf(alvo) + 1}`
}

/** Falha o teste se surgir qualquer diálogo nativo (`alert`/`confirm`). */
export function vigiarDialogos(page: Page) {
  const dialogos: string[] = []
  page.on("dialog", async (d) => {
    dialogos.push(`${d.type()}: ${d.message()}`)
    await d.dismiss()
  })
  return dialogos
}

export async function semRolagemHorizontal(page: Page) {
  const { scroll, janela } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    janela: window.innerWidth,
  }))
  expect(scroll).toBeLessThanOrEqual(janela)
}

/** Texto visível com espaços normalizados (o Intl usa espaço não separável). */
export const texto = (s: string | null) => s?.replace(/\s+/g, " ").trim()

export async function linhasDeSaldo(page: Page) {
  return (await page.getByTestId("saldo-membro").allTextContents()).map(texto)
}

export async function linhasDeTransferencia(page: Page) {
  return (await page.getByTestId("transferencia").allTextContents()).map(texto)
}
