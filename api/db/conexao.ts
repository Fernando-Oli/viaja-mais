import { Kysely, PostgresDialect } from "kysely"
import pg from "pg"
import { envApi } from "../env"
import type { DB } from "./tipos"

/**
 * As duas conexões da API com o banco, cada uma com um papel diferente.
 *
 * - `banco` (app_api): sozinha não lê tabela nenhuma. Todo acesso a dado passa
 *   por `comoUsuario()` ou `comoServico()`, que assumem um papel dentro da
 *   transação. Usar `banco` direto numa consulta resulta em `permission denied`.
 * - `poolAuth` (app_auth): só do Better Auth, só o schema `auth`.
 *
 * Pool, e não conexão por requisição (@RNF06.3). Com várias réplicas, cada uma
 * abre até `DB_POOL_MAX` conexões; o total precisa caber no `max_connections`
 * do Postgres.
 */

// O pg devolve `date` como Date à meia-noite do fuso local, o que desloca o dia
// conforme o servidor. A aplicação trabalha com a string "AAAA-MM-DD", como o
// Supabase devolvia.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v)
// numeric chega como string para não perder precisão; o Supabase devolvia number.
// Orçamento e valores têm 2 casas e cabem num double sem perda.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => Number(v))

export const poolApi = new pg.Pool({ connectionString: envApi.DB_APP_API_URL, max: envApi.DB_POOL_MAX })

export const banco = new Kysely<DB>({ dialect: new PostgresDialect({ pool: poolApi }) })

export const poolAuth = new pg.Pool({
  connectionString: envApi.DB_APP_AUTH_URL,
  max: Math.max(2, Math.floor(envApi.DB_POOL_MAX / 2)),
  // As tabelas do Better Auth estão em `auth`, e ele as consulta sem schema.
  options: "-c search_path=auth",
})

export async function fecharConexoes() {
  await Promise.all([banco.destroy(), poolAuth.end()])
}
