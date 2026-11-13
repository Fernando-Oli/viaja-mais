import { test as base, expect, type APIRequestContext, type Browser, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"
import { exigirLocal } from "../../tests/rls/guarda-ambiente"
import { zerarLimites } from "./limite"
import { SENHA_TESTE as SENHA } from "../../tests/fixtures/usuarios"
export { SENHA }

/**
 * Fixtures dos E2E com mais de uma pessoa. Cada pessoa tem o próprio contexto
 * de navegador — cookies separados, como duas janelas anônimas —, então a dona
 * e o convidado ficam logados ao mesmo tempo sem um derrubar a sessão do outro.
 *
 * Os usuários do seed vêm de `supabase/seed.sql`. Contas novas saem do cadastro
 * da tela (o ambiente local não pede confirmação de e-mail), com e-mail único
 * por execução: a suíte roda de novo sem `db:reset` e não colide.
 */


export const DONA = { email: "teste.a@viajamais.local", nome: "Ana Teste" } as const

export interface Conta {
  email: string
  nome: string
  page: Page
}

/** Entra pela tela de login e espera chegar ao dashboard. */
export async function entrar(page: Page, email: string, senha = SENHA) {
  await page.goto("/auth/login")
  await page.fill("#email", email)
  await page.fill("#password", senha)
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")
}

/** Cria uma conta pela tela de cadastro e deixa a pessoa logada no dashboard. */
export async function cadastrar(page: Page, nome: string, email: string, senha = SENHA) {
  await page.goto("/auth/sign-up")
  await page.fill("#fullName", nome)
  await page.fill("#email", email)
  await page.fill("#password", senha)
  await page.fill("#confirmPassword", senha)
  await page.click('button[type="submit"]')
  await page.waitForURL("/dashboard")
}

/** E-mail que não existe no banco: prefixo + hora + sorteio, no domínio do seed. */
export function emailUnico(prefixo: string) {
  return `${prefixo}.${Date.now()}.${Math.floor(Math.random() * 1e6)}@viajamais.local`
}

/**
 * Página nova num contexto próprio, com o mesmo dispositivo do projeto
 * (`chromium` ou `mobile`). `browser.newContext()` sozinho abriria sempre no
 * tamanho de desktop, e o projeto mobile deixaria de testar o celular.
 */
async function novaPagina(browser: Browser, opcoes: Parameters<Browser["newContext"]>[0]) {
  const contexto = await browser.newContext(opcoes)
  return { contexto, page: await contexto.newPage() }
}

// O segundo parâmetro de cada fixture é o `use` do Playwright, aqui chamado
// `usar` para o lint não o confundir com o hook `use` do React.
type Fixtures = {
  /** A dona da viagem: `page` padrão do teste, já logada como o usuário A do seed. */
  dona: Conta
  /** Uma pessoa recém-cadastrada pela tela, em outro contexto de navegador. */
  convidado: Conta
}

export const test = base.extend<Fixtures>({
  dona: async ({ page }, usar) => {
    await entrar(page, DONA.email)
    await usar({ ...DONA, page })
  },

  convidado: async (
    { browser, viewport, userAgent, isMobile, hasTouch, deviceScaleFactor, locale, timezoneId, baseURL },
    usar,
  ) => {
    const { contexto, page } = await novaPagina(browser, {
      viewport,
      userAgent,
      isMobile,
      hasTouch,
      deviceScaleFactor,
      locale,
      timezoneId,
      baseURL,
    })
    const conta = { email: emailUnico("convidado"), nome: "Carla Convidada" }
    await cadastrar(page, conta.nome, conta.email)
    await usar({ ...conta, page })
    await contexto.close()
  },
})

export { expect }

/** Id de um usuário, logando pelo GoTrue com a chave anon (sem passar pela tela). */
export async function idDe(email: string) {
  const url = exigirLocal(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", "NEXT_PUBLIC_SUPABASE_URL")
  const cliente = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await cliente.auth.signInWithPassword({ email, password: SENHA })
  if (error) throw new Error(`falha ao logar como ${email}: ${error.message}`)
  return data.user.id
}

/**
 * Põe `email` na viagem pelo caminho da aplicação: a dona convida pela API e o
 * convidado aceita pela API. Zera o limite de convites antes (ver ./limite).
 */
export async function convidar(dona: APIRequestContext, convidado: APIRequestContext, email: string, tripId: string) {
  await zerarLimites()
  const convite = await dona.post("/api/invitations", { data: { email, tripId } })
  expect(convite.status(), `convite para ${email}`).toBe(200)

  const pendentes = await convidado.get("/api/invitations")
  expect(pendentes.ok(), `lista de convites de ${email}`).toBeTruthy()
  const { invitations } = (await pendentes.json()) as { invitations: { id: string; trip_id: string }[] }
  const meu = invitations.find((i) => i.trip_id === tripId)
  expect(meu, `convite pendente de ${email}`).toBeTruthy()

  const aceite = await convidado.post(`/api/invitations/${meu!.id}/accept`)
  expect(aceite.status(), `aceite de ${email}`).toBe(200)
}
