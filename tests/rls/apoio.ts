import { afterAll } from "vitest"
import pg from "pg"
import { exigirLocal } from "./guarda-ambiente"
import { ClienteSql, configurarConexao, encerrarConexoes } from "./cliente-sql"
import { comoUsuario, type Tx } from "@/api/db/como-usuario"
import { app } from "@/api/app"

/**
 * O que todo teste de RLS precisa: a conexão com o banco local e um jeito de
 * agir como um usuário de verdade.
 *
 * Antes, os testes logavam pelo GoTrue e consultavam pelo PostgREST, com a
 * chave anon. Os dois saíram com o Supabase; agora `ClienteSql` faz o mesmo
 * papel direto no Postgres, assumindo `authenticated` com a identidade do
 * usuário, como a API faz em `comoUsuario()`. A RLS testada é a mesma.
 *
 * `exigirLocal` continua valendo: estes testes escrevem no banco, e um alvo que
 * não seja local é recusado antes de qualquer coisa.
 */

export const CONEXAO = exigirLocal(
  process.env.DATABASE_ADMIN_URL ?? "postgresql://postgres:postgres@localhost:55432/avori",
  "DATABASE_ADMIN_URL",
)

configurarConexao(CONEXAO)
afterAll(encerrarConexoes)

export type Cliente = ClienteSql
export type Usuario = { id: string; email: string }

/** Visitante, sem sessão: papel `anon`. */
export function novoCliente(): Cliente {
  return new ClienteSql({ papel: "anon" })
}

/** Cliente de um usuário que já existe. */
export function clienteDe(usuario: Usuario): Cliente {
  return new ClienteSql({ papel: "authenticated", id: usuario.id, email: usuario.email })
}

/**
 * "Loga" como o usuário do seed: busca o id pelo e-mail. A senha não é
 * conferida aqui — quem confere é o Better Auth, provado em
 * `tests/integracao/`; o que se testa neste diretório é a RLS.
 */
export async function logar(email: string, _senha?: string) {
  const banco = new pg.Client({ connectionString: CONEXAO })
  await banco.connect()
  try {
    const { rows } = await banco.query("select id, email from auth.users where email = $1", [email])
    if (!rows[0]) throw new Error(`usuário ${email} não existe: rode \`npm run db:reset\``)
    const usuario: Usuario = rows[0]
    return { cliente: clienteDe(usuario), usuario, id: usuario.id }
  } finally {
    await banco.end()
  }
}

/**
 * Roda código da API (os repositórios de `api/modulos/**`) como o usuário do
 * cliente, pelo `comoUsuario()` de produção: assim o teste prova a RLS sobre a
 * consulta que a rota faz de fato, e não sobre uma cópia dela.
 */
export function naApi<T>(cliente: Cliente, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (cliente.quem.papel !== "authenticated") throw new Error("a API só age como usuário logado")
  return comoUsuario({ id: cliente.quem.id, email: cliente.quem.email }, fn)
}

/**
 * Cria uma conta pelo cadastro de verdade (Better Auth, pela API), como
 * qualquer pessoa: o perfil nasce pelo gatilho `handle_new_user`. Devolve o
 * cliente dela, ou o erro do cadastro.
 */
export async function cadastrar(email: string, senha: string, nome = "Conta de teste") {
  const r = await app.request("/api/auth/sign-up/email", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      // Um IP por cadastro: o limite do Better Auth é por IP.
      "x-forwarded-for": `10.5.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ name: nome, email, password: senha }),
  })
  const corpo = await r.json()
  if (r.status !== 200) return { erro: { status: r.status, code: corpo.code as string, message: corpo.message as string } }
  const usuario: Usuario = { id: corpo.user.id, email: corpo.user.email }
  return { usuario, cliente: clienteDe(usuario) }
}

/** Apaga uma conta criada pelo teste (perfil e vínculos vão em cascata). */
export async function apagarConta(id: string) {
  const banco = new pg.Client({ connectionString: CONEXAO })
  await banco.connect()
  try {
    await banco.query("delete from auth.users where id = $1", [id])
  } finally {
    await banco.end()
  }
}
