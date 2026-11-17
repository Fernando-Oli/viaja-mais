import { sql } from "kysely"
import type { Tx } from "../../db/como-usuario"
import { centavosParaReais } from "../../../lib/finance/rateio"
import { montarAcerto, type Acerto } from "../../../lib/finance/acerto"

/**
 * Leituras e escrita do acerto de contas. Portado de
 * `app/api/trips/[tripId]/acerto/carregar-acerto.ts`.
 *
 * @RF06.11 saldo por membro · @RF06.13 transferências sugeridas e pagamentos registrados
 */

/**
 * Lê tudo o que o acerto precisa e o monta. O `GET` (que exibe) e o registro
 * de pagamento (que confere contra o saldo) usam esta mesma função: os dois
 * precisam ver exatamente o mesmo saldo.
 *
 * As partes vêm todas, inclusive as quitadas: `montarAcerto()` descarta as que
 * têm `settled_at` e usa as quitadas só para saber que a despesa foi rateada.
 */
export async function carregarAcerto(tx: Tx, tripId: string, usuarioAtualId: string): Promise<Acerto> {
  // Sequenciais, não em paralelo: as quatro dividem a mesma conexão da transação.
  const despesas = await tx
    .selectFrom("expenses")
    .select(["id", "paid_by", "currency"])
    .where("trip_id", "=", tripId)
    .execute()
  const partes = await tx
    .selectFrom("expense_shares")
    .innerJoin("expenses", "expenses.id", "expense_shares.expense_id")
    .select([
      "expense_shares.expense_id",
      "expense_shares.user_id",
      "expense_shares.amount",
      sql<string | null>`expense_shares.settled_at::text`.as("settled_at"),
    ])
    .where("expenses.trip_id", "=", tripId)
    .execute()
  const membros = await tx.selectFrom("trip_members").select(["user_id", "role"]).where("trip_id", "=", tripId).execute()
  const pagamentos = await tx
    .selectFrom("settlements")
    .select(["from_user_id", "to_user_id", "amount", "currency"])
    .where("trip_id", "=", tripId)
    .execute()

  return montarAcerto({
    despesas,
    partes,
    membros: membros.map((m) => ({ user_id: m.user_id, role: m.role ?? "member" })),
    pagamentos,
    usuarioAtualId,
  })
}

const COLUNAS_PAGAMENTO = ["id", "trip_id", "from_user_id", "to_user_id", "amount", "currency", "created_at"] as const

/** O pagamento desta pessoa nesta viagem gravado com `chave`, se houver. */
export function pagamentoPorChave(tx: Tx, tripId: string, pagadorId: string, chave: string) {
  return tx
    .selectFrom("settlements")
    .select(COLUNAS_PAGAMENTO)
    .where("trip_id", "=", tripId)
    .where("from_user_id", "=", pagadorId)
    .where("idempotency_key", "=", chave)
    .executeTakeFirst()
}

/** Campo a campo: o pagador é o da sessão, nunca o do corpo. @RNF02.7 */
export function registrarPagamento(
  tx: Tx,
  tripId: string,
  pagadorId: string,
  pagamento: { para: string; valorCentavos: number; moeda: string; chave: string },
) {
  return tx
    .insertInto("settlements")
    .values({
      trip_id: tripId,
      from_user_id: pagadorId,
      to_user_id: pagamento.para,
      amount: centavosParaReais(pagamento.valorCentavos),
      currency: pagamento.moeda,
      idempotency_key: pagamento.chave,
    })
    .returning(COLUNAS_PAGAMENTO)
    .executeTakeFirstOrThrow()
}

/**
 * Enfileira, até o fim da transação, os registros de pagamento da mesma
 * viagem. Sem isto, dois pagamentos simultâneos (chaves diferentes) passavam
 * os dois pela conferência de saldo antes de qualquer um gravar — a limitação
 * registrada em `docs/plans/S08-Ab-transferencias.md`. A trava é por viagem, e
 * só a pega quem já passou por `exigirMembro`.
 *
 * @RF06.13 o pagamento não passa da dívida, nem com dois envios ao mesmo tempo
 */
export async function travarAcertoDaViagem(tx: Tx, tripId: string) {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`acerto:${tripId}`}, 0))`.execute(tx)
}
