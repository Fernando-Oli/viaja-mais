import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { app } from "@/api/app"
import { admin, ORIGEM } from "./apoio"

/**
 * Recuperação de senha pelo Better Auth (`/api/auth/request-password-reset`,
 * `/api/auth/reset-password/:token` e `/api/auth/reset-password`), com banco e
 * SMTP reais (o Mailpit do docker-compose). Substitui o fluxo do GoTrue, que a
 * tela `app/auth/reset-password` usava.
 *
 * Usa uma conta descartável: trocar a senha de um usuário do seed quebraria os
 * outros arquivos.
 *
 * Precisa da stack local: `docker compose up -d --wait` e `npm run db:reset`.
 *
 * @RF01.7 redefinir por e-mail a senha esquecida · @RNF02.11 erro não vaza
 */

const MAILPIT = "http://localhost:58025"
const EMAIL = `recuperar-integracao-${Date.now()}@exemplo.local`
const SEM_CONTA = `ninguem-${Date.now()}@exemplo.local`
const SENHA_ANTIGA = "Antiga+senha1"
const SENHA_NOVA = "Nova+senha2"
const TELA = `${ORIGEM}/auth/reset-password`

let userId: string
let cookieAntigo: string
let token: string

/**
 * Um IP por chamada: o limite do pedido de recuperação (3 por minuto, por IP) e
 * o de login responderiam 429 no meio do arquivo.
 */
const ipNovo = () => `10.6.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`

function postar(caminho: string, corpo: unknown, cookie?: string) {
  return app.request(caminho, {
    method: "POST",
    headers: {
      origin: ORIGEM,
      "x-forwarded-for": ipNovo(),
      "content-type": "application/json",
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(corpo),
  })
}

const pedir = (email: string, redirectTo = TELA) => postar("/api/auth/request-password-reset", { email, redirectTo })
const redefinir = (newPassword: string, comToken = token) =>
  postar("/api/auth/reset-password", { newPassword, token: comToken })
const entrar = (password: string) => postar("/api/auth/sign-in/email", { email: EMAIL, password })

async function mensagensPara(email: string) {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
  return ((await r.json()) as { messages: { ID: string; Subject: string }[] }).messages
}

/** O envio não segura a resposta do pedido: espera o e-mail chegar. */
async function esperarEmail(email: string, limiteMs = 10_000) {
  const fim = Date.now() + limiteMs
  for (;;) {
    const [mensagem] = await mensagensPara(email)
    if (mensagem) {
      const r = await fetch(`${MAILPIT}/api/v1/message/${mensagem.ID}`)
      return { assunto: mensagem.Subject, ...((await r.json()) as { Text: string; HTML: string }) }
    }
    if (Date.now() > fim) throw new Error(`nenhum e-mail para ${email}`)
    await new Promise((r) => setTimeout(r, 50))
  }
}

beforeAll(async () => {
  await admin.connect()
  const r = await postar("/api/auth/sign-up/email", { name: "Conta da recuperação", email: EMAIL, password: SENHA_ANTIGA })
  if (r.status !== 200) throw new Error(`cadastro falhou: ${r.status} ${await r.text()}`)
  userId = (await r.json()).user.id
  cookieAntigo = r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
})

afterAll(async () => {
  await admin.query("delete from auth.users where id = $1", [userId])
  await admin.end()
})

describe("recuperação de senha", () => {
  it("o pedido para um e-mail cadastrado envia um link que passa pela API", async () => {
    const r = await pedir(EMAIL)
    expect(r.status).toBe(200)

    const email = await esperarEmail(EMAIL)
    expect(email.assunto).toBe("Redefinir sua senha na Avori")
    const link = email.Text.match(/https?:\/\/\S+/)?.[0]
    expect(link).toBeDefined()
    const url = new URL(link!)
    expect(url.origin).toBe(ORIGEM)
    expect(url.pathname).toMatch(/^\/api\/auth\/reset-password\/[^/]+$/)
    expect(url.searchParams.get("callbackURL")).toBe(TELA)
    expect(email.HTML).toContain("Escolher uma senha nova")

    // O link redireciona para a tela com o token.
    const volta = await app.request(`${url.pathname}${url.search}`, { headers: { "x-forwarded-for": ipNovo() } })
    expect(volta.status).toBe(302)
    const destino = new URL(volta.headers.get("location")!)
    expect(`${destino.origin}${destino.pathname}`).toBe(TELA)
    token = destino.searchParams.get("token")!
    expect(token).toBe(url.pathname.split("/").pop())
  })

  it("token inválido volta para a tela com error=INVALID_TOKEN", async () => {
    const r = await app.request(`/api/auth/reset-password/nao-existe?callbackURL=${encodeURIComponent(TELA)}`, {
      headers: { "x-forwarded-for": ipNovo() },
    })
    expect(r.status).toBe(302)
    const destino = new URL(r.headers.get("location")!)
    expect(destino.searchParams.get("error")).toBe("INVALID_TOKEN")
    expect(destino.searchParams.has("token")).toBe(false)
  })

  it("400: senha fraca é recusada, e o token continua valendo", async () => {
    const r = await redefinir("fraca")
    expect(r.status).toBe(400)
    expect((await r.json()).code).toBe("SENHA_FRACA")
    expect((await entrar(SENHA_ANTIGA)).status).toBe(200)
  })

  it("200: a senha nova vale para o login, a antiga não, e a sessão aberta cai", async () => {
    const r = await redefinir(SENHA_NOVA)
    expect(r.status).toBe(200)

    expect((await entrar(SENHA_NOVA)).status).toBe(200)
    expect((await entrar(SENHA_ANTIGA)).status).toBe(401)

    const sessao = await app.request("/api/auth/get-session", { headers: { cookie: cookieAntigo } })
    expect(await sessao.json()).toBeNull()
  })

  it("400: o token não serve uma segunda vez", async () => {
    const r = await redefinir("Terceira+senha3")
    expect(r.status).toBe(400)
    expect((await r.json()).code).toBe("INVALID_TOKEN")
    expect((await entrar(SENHA_NOVA)).status).toBe(200)
  })

  it("e-mail sem conta: a mesma resposta, e nenhum e-mail sai", async () => {
    const comConta = await pedir(EMAIL)
    const semConta = await pedir(SEM_CONTA)
    expect(semConta.status).toBe(comConta.status)
    expect(await semConta.json()).toEqual(await comConta.json())

    await new Promise((r) => setTimeout(r, 500))
    expect(await mensagensPara(SEM_CONTA)).toEqual([])
  })

  it("403: o link não pode devolver para outro site", async () => {
    const r = await pedir(EMAIL, "https://malicioso.example/roubar")
    expect(r.status).toBe(403)
  })
})

// @RNF02.3 a sessão só vale para requisições da própria Avori. Fica aqui porque
// a mesma configuração (`disableOriginCheck: false`) é o que faz o teste acima
// valer: o Better Auth desliga essa checagem sozinho em NODE_ENV=test.
describe("CSRF", () => {
  it("403: requisição com o cookie da pessoa, vinda de outro site, não encerra a sessão", async () => {
    const login = await entrar(SENHA_NOVA)
    const cookie = login.headers
      .getSetCookie()
      .map((c) => c.split(";")[0])
      .join("; ")

    const r = await app.request("/api/auth/sign-out", {
      method: "POST",
      headers: { origin: "https://malicioso.example", "x-forwarded-for": ipNovo(), cookie },
    })
    expect(r.status).toBe(403)

    const sessao = await app.request("/api/auth/get-session", { headers: { cookie } })
    expect(await sessao.json()).not.toBeNull()
  })
})
