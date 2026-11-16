import { sql, type Transaction } from "kysely"
import { banco } from "./conexao"
import type { DB } from "./tipos"

export type Tx = Transaction<DB>

/** Quem está fazendo a requisição, como as policies e funções SQL o enxergam. */
export type Identidade = { id: string; email: string }

/**
 * Roda `fn` numa transação **como o usuário**: papel `authenticated` e a
 * identidade em `request.jwt.claims`, onde `auth.uid()` e `auth.jwt()` a leem.
 * Toda a RLS vale aqui.
 *
 * É a peça que substitui o PostgREST. Antes, o Supabase fazia isto a cada
 * requisição a partir do JWT; agora fazemos nós, a partir da sessão do Better
 * Auth, já validada pelo middleware.
 *
 * `set_config(..., true)` equivale a `SET LOCAL`: vale só até o fim da
 * transação. A conexão volta ao pool sem papel e sem identidade, e a próxima
 * requisição não herda nada desta. `tests/rls/00-banco-proprio.test.ts` prova
 * isso.
 *
 * O e-mail vai nas claims porque `public.get_current_user_email()`, usada em
 * policies de convite, o lê de lá.
 *
 * @RNF02.4 a RLS continua sendo a segunda linha de defesa
 */
export function comoUsuario<T>(usuario: Identidade, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: usuario.id, email: usuario.email, role: "authenticated" })
  return banco.transaction().execute(async (tx) => {
    await sql`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${claims}, true)`.execute(
      tx,
    )
    return fn(tx)
  })
}

/**
 * Roda `fn` como `service_role`, que **ignora a RLS**. É o equivalente ao
 * antigo `lib/supabase/admin.ts` e tem a mesma regra: só para o que a RLS não
 * tem como resolver (ex.: contar seguidores de um perfil privado sem expor a
 * lista), e sempre depois de a rota ter decidido, explicitamente, quem pode.
 *
 * @RNF02.10 o acesso que ignora a RLS fica só no servidor, e nominal
 */
export function comoServico<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return banco.transaction().execute(async (tx) => {
    await sql`select set_config('role', 'service_role', true)`.execute(tx)
    return fn(tx)
  })
}
