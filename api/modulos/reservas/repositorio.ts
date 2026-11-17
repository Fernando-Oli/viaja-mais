import type { Tx } from "../../db/como-usuario"
import type { AtualizarReserva, CriarReserva } from "../../../lib/schemas/reserva"
import { LIMITE_LISTAGEM } from "../../../lib/listagem"

/**
 * Acesso a `bookings`. Toda consulta de uma reserva filtra por `trip_id` **e**
 * `id`, pelo mesmo motivo do itinerário: a autorização olhou para a viagem da URL.
 */

export function listar(tx: Tx, tripId: string) {
  return tx
    .selectFrom("bookings")
    .selectAll()
    .where("trip_id", "=", tripId)
    .orderBy("start_date")
    .limit(LIMITE_LISTAGEM)
    .execute()
}

/**
 * Reservas de todas as viagens de que o usuário participa, com título e destino
 * da viagem em `trips`. Participação, não autoria: quem foi convidado vê as
 * reservas que o grupo fez.
 *
 * @RF07.7 visualizar reservas · @RF04.4 os membros visualizam a viagem
 */
export async function doUsuario(tx: Tx, userId: string) {
  const linhas = await tx
    .selectFrom("bookings")
    .innerJoin("trips", "trips.id", "bookings.trip_id")
    .innerJoin("trip_members", "trip_members.trip_id", "trips.id")
    .selectAll("bookings")
    .select(["trips.title as viagem_titulo", "trips.destination as viagem_destino"])
    .where("trip_members.user_id", "=", userId)
    .orderBy("bookings.start_date")
    .limit(LIMITE_LISTAGEM)
    .execute()

  return linhas.map(({ viagem_titulo, viagem_destino, ...reserva }) => ({
    ...reserva,
    trips: { title: viagem_titulo, destination: viagem_destino },
  }))
}

export function buscar(tx: Tx, tripId: string, bookingId: string) {
  return tx
    .selectFrom("bookings")
    .selectAll()
    .where("trip_id", "=", tripId)
    .where("id", "=", bookingId)
    .executeTakeFirst()
}

/** Campo a campo: `trip_id` vem da URL e `user_id` da sessão. @RNF02.7 */
export function criar(tx: Tx, tripId: string, userId: string, campos: CriarReserva) {
  const { type, title, provider, confirmation_number, start_date, end_date, location, price, currency, status, notes } =
    campos
  return tx
    .insertInto("bookings")
    .values({
      trip_id: tripId,
      user_id: userId,
      type,
      title,
      provider: provider || null,
      confirmation_number: confirmation_number || null,
      start_date,
      end_date: end_date || null,
      location: location || null,
      price: price ?? null,
      currency,
      status,
      notes: notes || null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

/** `id`, `trip_id` e `user_id` não estão no schema: a reserva não muda de viagem nem de autor. */
export function atualizar(tx: Tx, tripId: string, bookingId: string, campos: AtualizarReserva) {
  const { type, title, provider, confirmation_number, start_date, end_date, location, price, currency, status, notes } =
    campos
  return tx
    .updateTable("bookings")
    .set({ type, title, provider, confirmation_number, start_date, end_date, location, price, currency, status, notes })
    .where("trip_id", "=", tripId)
    .where("id", "=", bookingId)
    .returningAll()
    .executeTakeFirst()
}

export async function excluir(tx: Tx, tripId: string, bookingId: string): Promise<boolean> {
  const r = await tx.deleteFrom("bookings").where("trip_id", "=", tripId).where("id", "=", bookingId).executeTakeFirst()
  return r.numDeletedRows > BigInt(0)
}
