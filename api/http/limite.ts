import { sql } from "kysely"
import { limiteExcedido, type RegraLimite } from "../../lib/seguranca/limite"
import type { Tx } from "../db/como-usuario"

/**
 * Limite por usuário, contado no Postgres por `public.consumir_limite()`, como
 * `exigirLimite()` de `lib/seguranca/limite.ts` faz pelo PostgREST. As regras
 * (`LIMITES`) continuam lá; aqui só muda o caminho até o banco.
 *
 * **Fail-open**, como o original: se a contagem falhar, a requisição segue e o
 * erro vai para o log. A contagem roda num savepoint, para a falha não abortar
 * a transação da rota junto.
 *
 * @RNF02.8 limite por usuário e por janela de tempo
 */
export async function exigirLimiteNaTx(tx: Tx, regra: RegraLimite): Promise<void> {
  let resultado: { permitido: boolean; retry_after: number } | undefined
  try {
    await sql`savepoint limite`.execute(tx)
    const { rows } = await sql<{ permitido: boolean; retry_after: number }>`
      select * from public.consumir_limite(${regra.chave}, ${regra.maximo}, ${regra.janelaSegundos})
    `.execute(tx)
    await sql`release savepoint limite`.execute(tx)
    resultado = rows[0]
  } catch (erro) {
    await sql`rollback to savepoint limite`.execute(tx).catch(() => undefined)
    console.error(`[limite] contagem de "${regra.chave}" falhou; requisição liberada:`, erro instanceof Error ? erro.message : erro)
    return
  }

  if (!resultado) {
    console.error(`[limite] contagem de "${regra.chave}" voltou vazia; requisição liberada`)
    return
  }
  if (!resultado.permitido) throw limiteExcedido(resultado.retry_after)
}
