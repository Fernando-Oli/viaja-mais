import { sql } from "kysely"
import { limiteExcedido, type RegraLimite } from "../../lib/seguranca/limite"
import type { Tx } from "../db/como-usuario"

/**
 * Limite por usuário, contado no Postgres por `public.consumir_limite()`. As
 * regras (`LIMITES`) ficam em `lib/seguranca/limite.ts`.
 *
 * **Fail-open:** se a contagem falhar (banco fora, função ausente), a
 * requisição segue e o erro vai para o log. O limitador protege contra abuso;
 * ele não pode ser o motivo de um convite ou de uma troca de senha legítimos
 * falharem. O risco residual está em
 * `docs/pfc/evidencias/seguranca/S06-F-rate-limit-csp.md`. A contagem roda num savepoint, para a falha não abortar
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
