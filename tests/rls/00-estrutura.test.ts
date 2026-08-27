import { describe, it, expect, beforeAll } from "vitest"
import { Client } from "pg"
import fs from "node:fs"

/**
 * Primeira barreira: o banco precisa ser reproduzível a partir do repositório, e
 * toda tabela precisa nascer com RLS habilitada.
 *
 * Esse teste existe porque o projeto passou meses com o schema apenas dentro do
 * painel do Supabase. Enquanto `supabase/migrations/` estiver vazio, ele falha —
 * e é isso mesmo que deve acontecer.
 */

const CONEXAO = process.env.DATABASE_URL

describe("migrations versionadas", () => {
  it("existe pelo menos uma migration no repositório", () => {
    const arquivos = fs.existsSync("supabase/migrations")
      ? fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"))
      : []

    expect(
      arquivos.length,
      "supabase/migrations/ está vazio: o schema ainda não foi extraído do Supabase. Ver supabase/README.md.",
    ).toBeGreaterThan(0)
  })

  it("os nomes seguem o padrão <timestamp>_<dominio>_<descricao>.sql", () => {
    if (!fs.existsSync("supabase/migrations")) return
    const arquivos = fs.readdirSync("supabase/migrations").filter((f) => f.endsWith(".sql"))
    // Timestamp e não sequência: quatro pessoas criam migration em paralelo e
    // numeração sequencial colidiria toda semana.
    const padrao = /^\d{12,14}_[a-z]+_[a-z0-9_]+\.sql$/
    const fora = arquivos.filter((f) => !padrao.test(f))
    expect(fora, `fora do padrão: ${fora.join(", ")}`).toEqual([])
  })
})

describe.skipIf(!CONEXAO)("banco aplicado", () => {
  let db: Client

  beforeAll(async () => {
    db = new Client({ connectionString: CONEXAO })
    await db.connect()
  })

  it("toda tabela do schema public tem RLS habilitada", async () => {
    // Os três clientes Supabase da aplicação usam a chave anon: uma tabela sem
    // RLS é uma tabela pública para qualquer pessoa com uma conta.
    const { rows } = await db.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename NOT LIKE 'pg_%'
        AND NOT EXISTS (
          SELECT 1 FROM pg_class c
          JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relname = pg_tables.tablename AND c.relrowsecurity
        )
    `)
    const semRls = rows.map((r) => r.tablename)
    expect(semRls, `tabelas sem RLS: ${semRls.join(", ")}`).toEqual([])
  })

  it("toda tabela com RLS tem ao menos uma policy", async () => {
    // RLS habilitada e zero policies nega tudo — o que quebra a aplicação em
    // silêncio, com "nenhum resultado" em vez de erro.
    const { rows } = await db.query(`
      SELECT c.relname AS tabela
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
        AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname)
    `)
    const semPolicy = rows.map((r) => r.tabela)
    expect(semPolicy, `RLS ligada mas sem policy: ${semPolicy.join(", ")}`).toEqual([])
  })
})
