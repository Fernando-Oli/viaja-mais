import { Client } from "pg"
import { exigirLocal } from "../../tests/rls/guarda-ambiente"

/**
 * Zera os contadores de `public.rate_limits` (RNF02.8) antes de um fluxo que
 * convida.
 *
 * A suíte inteira convida com a mesma conta (a Ana do seed), nos dois projetos
 * do Playwright: passa de 10 convites em 10 minutos, e o limite recusa — que é
 * exatamente o que ele deve fazer. O limite em si é provado por
 * tests/lib/limite.test.ts, tests/rls/12-rate-limit.test.ts e pelos 429 de
 * tests/api/; aqui ele só não pode atrapalhar fluxos que testam outra coisa.
 *
 * Só age com DATABASE_URL de banco local (a mesma guarda dos testes de RLS).
 * Sem a variável não faz nada: contra um Supabase hospedado, os fluxos que
 * convidam passam a depender de a suíte caber no limite.
 */
export async function zerarLimites(): Promise<void> {
  const url = process.env.DATABASE_URL
  if (!url) return

  const db = new Client({ connectionString: exigirLocal(url, "DATABASE_URL") })
  await db.connect()
  try {
    await db.query("delete from public.rate_limits")
  } finally {
    await db.end()
  }
}
