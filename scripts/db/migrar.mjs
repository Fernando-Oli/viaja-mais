#!/usr/bin/env node
/**
 * Aplica as migrations de db/migrations/ que ainda não rodaram, em ordem de nome.
 *
 *   node scripts/db/migrar.mjs
 *
 * Cada arquivo roda numa transação própria e é registrado em
 * controle.schema_migrations. Se um falha, ele volta inteiro e os seguintes não
 * rodam: o banco nunca fica com metade de uma migration.
 *
 * Conecta como superusuário (postgres). É o único lugar, junto com semear.mjs,
 * que usa essa conexão — a aplicação nunca.
 *
 * Substitui o `supabase db reset`/`supabase migration up`.
 *
 * @RNF04.3 schema reproduzível a partir do repositório
 */
import fs from "node:fs"
import path from "node:path"
import pg from "pg"

export const URL_ADMIN = process.env.DATABASE_ADMIN_URL ?? "postgresql://postgres:postgres@localhost:55432/avori"
const PASTA = "db/migrations"

export async function migrar({ silencioso = false } = {}) {
  const arquivos = fs
    .readdirSync(PASTA)
    .filter((f) => f.endsWith(".sql"))
    .sort()

  const registro = new pg.Client({ connectionString: URL_ADMIN })
  await registro.connect()
  const { rows } = await registro.query("select versao from controle.schema_migrations")
  await registro.end()
  const aplicadas = new Set(rows.map((r) => r.versao))

  let novas = 0
  for (const arquivo of arquivos) {
    const versao = arquivo.replace(/\.sql$/, "")
    if (aplicadas.has(versao)) continue

    // Um cliente por arquivo: a migration base, extraída do Supabase, faz
    // `set_config('search_path', '', false)` e outros SET de sessão. Numa conexão
    // compartilhada, isso vazaria para a migration seguinte.
    const cliente = new pg.Client({ connectionString: URL_ADMIN })
    await cliente.connect()
    try {
      await cliente.query("begin")
      await cliente.query(fs.readFileSync(path.join(PASTA, arquivo), "utf8"))
      await cliente.query("insert into controle.schema_migrations (versao) values ($1)", [versao])
      await cliente.query("commit")
      novas++
      if (!silencioso) console.log(`  aplicada  ${arquivo}`)
    } catch (erro) {
      await cliente.query("rollback").catch(() => {})
      throw new Error(`migration ${arquivo} falhou: ${erro.message}`, { cause: erro })
    } finally {
      await cliente.end()
    }
  }
  return { total: arquivos.length, novas }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("migrar.mjs")) {
  try {
    const { total, novas } = await migrar()
    console.log(novas ? `${novas} migration(s) aplicada(s); ${total} no total.` : `Nada a aplicar; ${total} migration(s) já aplicadas.`)
  } catch (erro) {
    console.error(`\nERRO: ${erro.message}`)
    process.exit(1)
  }
}
