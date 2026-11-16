import type { Tx } from "../../db/como-usuario"
import type { AtualizarViagem } from "../../../lib/schemas/viagem"

/**
 * Acesso a dados de viagem. Único lugar do módulo que escreve SQL.
 *
 * Toda função recebe a transação aberta por `comoUsuario()`: as consultas
 * rodam como o usuário, e a RLS filtra o que ele não pode ver. As rotas decidem
 * a autorização explicitamente antes de chamar aqui; a RLS é a segunda linha.
 */

/** Papel do usuário na viagem, para `exigirMembro`/`exigirDono`. */
export async function papelNaViagem(tx: Tx, tripId: string, userId: string): Promise<string | null> {
  const linha = await tx
    .selectFrom("trip_members")
    .select("role")
    .where("trip_id", "=", tripId)
    .where("user_id", "=", userId)
    .executeTakeFirst()
  return linha?.role ?? null
}

/**
 * Viagem com os membros, no mesmo formato que o Supabase devolvia para
 * `select("*, trip_members(user_id, role)")` — as telas leem `trip.trip_members`.
 */
export async function buscarViagem(tx: Tx, tripId: string) {
  const viagem = await tx.selectFrom("trips").selectAll().where("id", "=", tripId).executeTakeFirst()
  if (!viagem) return null

  const membros = await tx
    .selectFrom("trip_members")
    .select(["user_id", "role"])
    .where("trip_id", "=", tripId)
    .orderBy("joined_at")
    .execute()

  return { ...viagem, trip_members: membros }
}

/**
 * Atualiza só os campos recebidos. A lista é fechada pelo tipo: `user_id`, `id`
 * e `created_at` não estão em `AtualizarViagem` e não têm como chegar aqui.
 *
 * @RNF02.7 sem atribuição em massa
 */
export async function atualizarViagem(tx: Tx, tripId: string, campos: AtualizarViagem) {
  const { title, destination, start_date, end_date, description, budget, currency, status } = campos
  return tx
    .updateTable("trips")
    .set({ title, destination, start_date, end_date, description, budget, currency, status, updated_at: new Date() })
    .where("id", "=", tripId)
    .returningAll()
    .executeTakeFirst()
}

export async function excluirViagem(tx: Tx, tripId: string): Promise<boolean> {
  const resultado = await tx.deleteFrom("trips").where("id", "=", tripId).executeTakeFirst()
  return resultado.numDeletedRows > BigInt(0)
}
