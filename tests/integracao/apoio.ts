import pg from "pg"
import { exigirLocal } from "../rls/guarda-ambiente"
import { app } from "@/api/app"

/**
 * Apoio dos testes de integração da API: chamam `app.request(...)` — a
 * aplicação Hono inteira, com sessão, autorização e banco reais, sem abrir
 * porta — contra o banco local de `npm run db:reset`.
 */

export const ORIGEM = "http://localhost:3000"

export const admin = new pg.Client({
  connectionString: exigirLocal(
    process.env.DATABASE_ADMIN_URL ?? "postgresql://postgres:postgres@localhost:55432/avori",
    "DATABASE_ADMIN_URL",
  ),
})

// IP próprio por execução: o limite de tentativas de login é por IP e fica no
// banco. Sem isto, rodar a suíte algumas vezes seguidas esbarraria no limite.
const IP = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`

/** Faz login pela rota do Better Auth e devolve o cabeçalho Cookie da sessão. */
export async function logar(email: string, senha: string): Promise<string> {
  const resposta = await app.request("/api/auth/sign-in/email", {
    method: "POST",
    headers: { "content-type": "application/json", origin: ORIGEM, "x-forwarded-for": IP },
    body: JSON.stringify({ email, password: senha }),
  })
  if (resposta.status !== 200) throw new Error(`login de ${email} falhou: ${resposta.status} ${await resposta.text()}`)
  return resposta.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ")
}

type Opcoes = { cookie?: string; corpo?: unknown }

/** Requisição à API, como o navegador faria pelo rewrite do Next. */
export function chamar(metodo: string, caminho: string, { cookie, corpo }: Opcoes = {}) {
  const headers: Record<string, string> = { origin: ORIGEM, "x-forwarded-for": IP }
  if (cookie) headers.cookie = cookie
  if (corpo !== undefined) headers["content-type"] = "application/json"
  return app.request(caminho, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  })
}
