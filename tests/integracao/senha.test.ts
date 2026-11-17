import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { app } from "@/api/app"
import { admin, ORIGEM } from "./apoio"

/**
 * Troca de senha na API (`POST /api/auth/change-password`), com sessão e banco
 * reais. Substitui `tests/api/change-password-route.test.ts`, que simulava o
 * Supabase.
 *
 * Usa uma conta descartável, criada pelo cadastro do Better Auth: trocar a
 * senha de um usuário do seed quebraria os outros arquivos.
 *
 * Precisa do banco local: `npm run db:reset`.
 *
 * @RF01.8 alterar a própria senha · @RNF02.8 limite de conferências por usuário
 * @RNF02.11 erro do Auth não vaza
 */

const EMAIL = `senha-integracao-${Date.now()}@exemplo.local`
const SENHA_1 = "Primeira+senha1"
const SENHA_2 = "Segunda+senha2"
const SENHA_3 = "Terceira+senha3"
const IP = `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`

let userId: string

const cabecalhos = (cookie?: string): Record<string, string> => ({
  origin: ORIGEM,
  "x-forwarded-for": IP,
  ...(cookie ? { cookie } : {}),
})

const cookieDe = (r: Response) =>
  r.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")

/**
 * Um IP por login: o arquivo entra muitas vezes, e o limite de login do Better
 * Auth (10 por minuto, por IP) responderia 429 no meio dos testes.
 */
async function entrar(senha: string) {
  const ip = `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`
  return app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { ...cabecalhos(), "x-forwarded-for": ip, "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: senha }),
  })
}

async function logar(senha: string) {
  const r = await entrar(senha)
  if (r.status !== 200) throw new Error(`login falhou: ${r.status}`)
  return cookieDe(r)
}

/** Como a tela de configurações envia: formulário, não JSON. */
function trocar(cookie: string | undefined, campos: Record<string, string>) {
  const corpo = new FormData()
  for (const [nome, valor] of Object.entries(campos)) corpo.set(nome, valor)
  return app.request("/api/auth/change-password", { method: "POST", headers: cabecalhos(cookie), body: corpo })
}

const pedido = (atual: string, nova: string, confirmacao = nova) => ({
  current_password: atual,
  new_password: nova,
  confirm_password: confirmacao,
})

async function tentativasContadas() {
  const { rows } = await admin.query("select contagem from public.rate_limits where user_id = $1 and chave = 'trocar-senha'", [
    userId,
  ])
  return rows[0]?.contagem ?? 0
}

beforeAll(async () => {
  await admin.connect()
  const r = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { ...cabecalhos(), "content-type": "application/json" },
    body: JSON.stringify({ name: "Conta da senha", email: EMAIL, password: SENHA_1 }),
  })
  if (r.status !== 200) throw new Error(`cadastro falhou: ${r.status} ${await r.text()}`)
  userId = (await r.json()).user.id
})

afterAll(async () => {
  await admin.query("delete from auth.users where id = $1", [userId])
  await admin.end()
})

describe("POST /api/auth/change-password", () => {
  it("400 sem gastar tentativa: campo faltando, confirmação diferente, senha fraca e senha igual", async () => {
    const cookie = await logar(SENHA_1)
    const antes = await tentativasContadas()
    const casos = [
      [{ current_password: SENHA_1, new_password: SENHA_2 }, "Todos os campos são obrigatórios"],
      [pedido(SENHA_1, SENHA_2, "Outra+senha9"), "As senhas não coincidem"],
      [pedido(SENHA_1, "fraca"), expect.stringContaining("pelo menos 8")],
      [pedido(SENHA_1, SENHA_1), "A nova senha precisa ser diferente da atual"],
    ] as const
    for (const [campos, mensagem] of casos) {
      const r = await trocar(cookie, campos)
      expect(r.status).toBe(400)
      expect((await r.json()).error).toEqual(mensagem)
    }
    expect(await tentativasContadas()).toBe(antes)
  })

  it("400 em português com a senha atual errada; a tentativa conta e a senha não muda", async () => {
    const cookie = await logar(SENHA_1)
    const antes = await tentativasContadas()
    const r = await trocar(cookie, pedido("Errada+senha0", SENHA_2))
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe("Senha atual incorreta")
    expect(await tentativasContadas()).toBe(antes + 1)
    expect((await entrar(SENHA_1)).status).toBe(200)
  })

  it("o endpoint nativo do Better Auth está encoberto: JSON com os campos dele não troca a senha", async () => {
    const cookie = await logar(SENHA_1)
    const r = await app.request("/api/auth/change-password", {
      method: "POST",
      headers: { ...cabecalhos(cookie), "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: SENHA_1, newPassword: SENHA_2 }),
    })
    expect(r.status).toBe(400)
    expect((await entrar(SENHA_1)).status).toBe(200)
  })

  it("401: sem sessão", async () => {
    expect((await trocar(undefined, pedido(SENHA_1, SENHA_2))).status).toBe(401)
  })

  it("200: troca, renova a sessão atual e encerra as outras", async () => {
    const outraAba = await logar(SENHA_1)
    const estaAba = await logar(SENHA_1)

    const r = await trocar(estaAba, pedido(SENHA_1, SENHA_2))
    expect(r.status).toBe(200)
    expect((await r.json()).message).toBe("Senha alterada com sucesso")
    const renovada = cookieDe(r)
    expect(renovada).toContain("avori.session_token")

    expect((await entrar(SENHA_1)).status).not.toBe(200)
    expect((await entrar(SENHA_2)).status).toBe(200)

    const sessao = (cookie: string) => app.request("/api/social/perfil", { headers: cabecalhos(cookie) })
    expect((await sessao(outraAba)).status).toBe(401)
    expect((await sessao(renovada)).status).toBe(200)
  })

  it("429: com o limite estourado, a senha atual nem chega a ser conferida", async () => {
    const cookie = await logar(SENHA_2)
    await admin.query(
      `insert into public.rate_limits (user_id, chave, janela_inicio, contagem)
       values ($1, 'trocar-senha', to_timestamp(floor(extract(epoch from now()) / 900) * 900), 5)
       on conflict (user_id, chave) do update set janela_inicio = excluded.janela_inicio, contagem = 5`,
      [userId],
    )
    const r = await trocar(cookie, pedido(SENHA_2, SENHA_3))
    expect(r.status).toBe(429)
    expect(r.headers.get("retry-after")).toBeTruthy()
    expect((await entrar(SENHA_2)).status).toBe(200)
  })
})
