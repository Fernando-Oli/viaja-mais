import { comAdmin } from "./banco"

/**
 * Zera os contadores de `public.rate_limits` (RNF02.8) antes de um fluxo que
 * convida.
 *
 * A suíte inteira convida com a mesma conta (a Ana do seed), nos dois projetos
 * do Playwright: passa de 10 convites em 10 minutos, e o limite recusa — que é
 * exatamente o que ele deve fazer. O limite em si é provado por
 * tests/integracao/limite.test.ts, tests/rls/12-rate-limit.test.ts e pelos
 * 429 de tests/integracao/; aqui ele só não pode atrapalhar fluxos que testam outra coisa.
 *
 * Só age em banco local (a mesma guarda dos testes de RLS).
 */
export async function zerarLimites(): Promise<void> {
  await comAdmin((db) => db.query("delete from public.rate_limits"))
}
