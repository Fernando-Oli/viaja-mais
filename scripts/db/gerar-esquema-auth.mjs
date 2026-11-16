#!/usr/bin/env node
/**
 * Gera o SQL das tabelas do Better Auth a partir de `api/auth/esquema.ts` e o
 * imprime. A saída revisada vira `db/init/03-auth.sql`.
 *
 *   node scripts/db/gerar-esquema-auth.mjs > /tmp/auth.sql
 *
 * Por que gerar e não escrever à mão: os tipos e índices que o Better Auth
 * espera mudam entre versões. Gerado da própria biblioteca, o SQL bate com a
 * versão fixada no package.json. Rode de novo ao atualizar o better-auth.
 *
 * Precisa do banco local de pé (`docker compose up -d --wait`) e com o schema
 * `auth` vazio: o gerador compara o que existe com o que deveria existir.
 */
import pg from "pg"
import { getMigrations } from "better-auth/db/migration"
import { esquemaAuth } from "../../api/auth/esquema.ts"

const URL_BANCO = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:55432/avori"

const pool = new pg.Pool({ connectionString: URL_BANCO, options: "-c search_path=auth" })
try {
  const { compileMigrations } = await getMigrations({ ...esquemaAuth, database: pool })
  process.stdout.write((await compileMigrations()) + "\n")
} finally {
  await pool.end()
}
