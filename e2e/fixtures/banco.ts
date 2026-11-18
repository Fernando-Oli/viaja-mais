import { Client } from "pg"
import { exigirLocal } from "../../tests/rls/guarda-ambiente"
import { ClienteSql, configurarConexao } from "../../tests/rls/cliente-sql"

/**
 * Acesso ao banco local para o preparo dos E2E: a conexão de administrador, o
 * id de um usuário e um cliente que age como ele, sob RLS (o mesmo de
 * `tests/rls/`). A guarda de ambiente recusa qualquer banco que não seja local.
 */
export const CONEXAO_ADMIN = exigirLocal(
  process.env.DATABASE_ADMIN_URL ?? "postgresql://postgres:postgres@localhost:55432/avori",
  "DATABASE_ADMIN_URL",
)

configurarConexao(CONEXAO_ADMIN)

export async function comAdmin<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  const db = new Client({ connectionString: CONEXAO_ADMIN })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

/** Id de um usuário pelo e-mail. */
export async function idDe(email: string): Promise<string> {
  const { rows } = await comAdmin((db) => db.query("select id from auth.users where email = $1", [email]))
  if (!rows[0]) throw new Error(`usuário ${email} não existe`)
  return rows[0].id
}

/** Cliente que age como o usuário, sob RLS, e o id dele. */
export async function comoUsuario(email: string) {
  const id = await idDe(email)
  return { cliente: new ClienteSql({ papel: "authenticated", id, email }), id }
}
