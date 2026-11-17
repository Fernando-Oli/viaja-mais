import type { Tx } from "../../db/como-usuario"
import type { AtualizarDespesa, CriarDespesa } from "../../../lib/schemas/despesa"
import { centavosParaReais, type Parte } from "../../../lib/finance/rateio"
import { LIMITE_LISTAGEM } from "../../../lib/listagem"

/**
 * Acesso a `expenses` e `expense_shares`. Toda consulta de uma despesa filtra
 * por `trip_id` **e** `id`: a autorização olhou para a viagem da URL, e sem o
 * primeiro filtro um membro da viagem X alcançaria a despesa da viagem Y só
 * trocando o id.
 *
 * Valores entram em centavos inteiros e saem para o banco por
 * `centavosParaReais`, uma vez só: o NUMERIC(10,2) não arredonda por conta própria.
 */

export function listar(tx: Tx, tripId: string) {
  return tx
    .selectFrom("expenses")
    .selectAll()
    .where("trip_id", "=", tripId)
    .orderBy("date", "desc")
    .limit(LIMITE_LISTAGEM)
    .execute()
}

/**
 * Despesas de todas as viagens de que o usuário participa, com título e moeda
 * da viagem em `trips`, para a tela de finanças. A despesa do grupo é do grupo:
 * filtrar por `user_id` mostrava ao convidado só o que ele mesmo lançou.
 *
 * @RF06.4 visualizar despesas · @RF04.4 os membros visualizam a viagem
 */
export async function doUsuario(tx: Tx, userId: string) {
  const linhas = await tx
    .selectFrom("expenses")
    .innerJoin("trips", "trips.id", "expenses.trip_id")
    .innerJoin("trip_members", "trip_members.trip_id", "trips.id")
    .selectAll("expenses")
    .select(["trips.title as viagem_titulo", "trips.currency as viagem_moeda"])
    .where("trip_members.user_id", "=", userId)
    .orderBy("expenses.date", "desc")
    .limit(LIMITE_LISTAGEM)
    .execute()

  return linhas.map(({ viagem_titulo, viagem_moeda, ...despesa }) => ({
    ...despesa,
    trips: { title: viagem_titulo, currency: viagem_moeda },
  }))
}

export function buscar(tx: Tx, tripId: string, expenseId: string) {
  return tx
    .selectFrom("expenses")
    .selectAll()
    .where("trip_id", "=", tripId)
    .where("id", "=", expenseId)
    .executeTakeFirst()
}

export type Despesa = NonNullable<Awaited<ReturnType<typeof buscar>>>

/**
 * Campo a campo: `trip_id` vem da URL e `user_id` da sessão. `paid_by` é quem
 * registra, como o gatilho `expenses_preenche_paid_by` já faria. @RNF02.7
 */
export function criar(
  tx: Tx,
  tripId: string,
  userId: string,
  campos: Omit<CriarDespesa, "rateio" | "amount">,
  totalCentavos: number,
  tipoRateio: "equal" | "weight" | "exact" | undefined,
) {
  const { title, currency, category, date, payment_method, notes } = campos
  return tx
    .insertInto("expenses")
    .values({
      trip_id: tripId,
      user_id: userId,
      paid_by: userId,
      title,
      amount: centavosParaReais(totalCentavos),
      currency,
      category,
      date,
      payment_method: payment_method ?? null,
      notes: notes ?? null,
      ...(tipoRateio ? { split_type: tipoRateio } : {}),
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

/** `id`, `trip_id` e `user_id` não estão no schema: a despesa não muda de viagem nem de autor. */
export function atualizar(
  tx: Tx,
  tripId: string,
  expenseId: string,
  campos: Omit<AtualizarDespesa, "amount">,
  totalCentavos: number | undefined,
) {
  const { title, currency, category, date, payment_method, notes } = campos
  return tx
    .updateTable("expenses")
    .set({
      title,
      amount: totalCentavos === undefined ? undefined : centavosParaReais(totalCentavos),
      currency,
      category,
      date,
      payment_method,
      notes,
    })
    .where("trip_id", "=", tripId)
    .where("id", "=", expenseId)
    .returningAll()
    .executeTakeFirst()
}

export async function excluir(tx: Tx, tripId: string, expenseId: string): Promise<boolean> {
  const r = await tx.deleteFrom("expenses").where("trip_id", "=", tripId).where("id", "=", expenseId).executeTakeFirst()
  return r.numDeletedRows > BigInt(0)
}

/** Partes gravadas de uma despesa, em ordem de `user_id` (a mesma do rateio). */
export function partesDa(tx: Tx, expenseId: string) {
  return tx
    .selectFrom("expense_shares")
    .select(["user_id", "weight", "settled_at"])
    .where("expense_id", "=", expenseId)
    .orderBy("user_id")
    .execute()
}

/**
 * Grava as partes; numa linha já existente (mesma pessoa, mesma despesa),
 * substitui valor e peso. A constraint trigger `expense_shares_soma_fecha` é
 * adiada para o commit e confere a soma contra o total da despesa (RNF08.1).
 */
export function gravarPartes(tx: Tx, expenseId: string, partes: Parte[]) {
  return tx
    .insertInto("expense_shares")
    .values(
      partes.map((p) => ({
        expense_id: expenseId,
        user_id: p.userId,
        amount: centavosParaReais(p.centavos),
        weight: p.peso,
      })),
    )
    .onConflict((oc) =>
      oc.columns(["expense_id", "user_id"]).doUpdateSet((eb) => ({
        amount: eb.ref("excluded.amount"),
        weight: eb.ref("excluded.weight"),
      })),
    )
    .returning(["user_id", "amount", "weight"])
    .execute()
}
