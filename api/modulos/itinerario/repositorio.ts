import type { Tx } from "../../db/como-usuario"
import type { AtualizarItemItinerario, CriarItemItinerario } from "../../../lib/schemas/itinerario"
import { LIMITE_LISTAGEM } from "../../../lib/listagem"

/**
 * Acesso a `itinerary_items`. Toda consulta de item filtra por `trip_id` **e**
 * `id`: sem o primeiro, um membro da viagem X alteraria item da viagem Y só
 * trocando o id na URL, porque a autorização olhou para X.
 */

export function listar(tx: Tx, tripId: string) {
  return tx
    .selectFrom("itinerary_items")
    .selectAll()
    .where("trip_id", "=", tripId)
    .orderBy("date")
    .orderBy("start_time")
    .limit(LIMITE_LISTAGEM)
    .execute()
}

/**
 * Próximas atividades de todas as viagens de que o usuário participa, com
 * título e destino da viagem em `trips` — o formato que a tela de agenda lia
 * do embed do Supabase.
 *
 * @RF05.4 visualizar itinerário · @RF04.4 os membros visualizam a viagem
 */
export async function proximasDoUsuario(tx: Tx, userId: string, desde: string, limite: number) {
  const linhas = await tx
    .selectFrom("itinerary_items")
    .innerJoin("trips", "trips.id", "itinerary_items.trip_id")
    .innerJoin("trip_members", "trip_members.trip_id", "trips.id")
    .selectAll("itinerary_items")
    .select(["trips.title as viagem_titulo", "trips.destination as viagem_destino"])
    .where("trip_members.user_id", "=", userId)
    .where("itinerary_items.date", ">=", desde)
    .orderBy("itinerary_items.date")
    .orderBy("itinerary_items.start_time")
    .limit(limite)
    .execute()

  return linhas.map(({ viagem_titulo, viagem_destino, ...item }) => ({
    ...item,
    trips: { title: viagem_titulo, destination: viagem_destino },
  }))
}

export function buscar(tx: Tx, tripId: string, itemId: string) {
  return tx
    .selectFrom("itinerary_items")
    .selectAll()
    .where("trip_id", "=", tripId)
    .where("id", "=", itemId)
    .executeTakeFirst()
}

/** Campo a campo; `trip_id` vem da URL, já autorizada. @RNF02.7 */
export function criar(tx: Tx, tripId: string, campos: CriarItemItinerario) {
  const { title, description, date, start_time, end_time, location, category, status } = campos
  return tx
    .insertInto("itinerary_items")
    .values({
      trip_id: tripId,
      title,
      description: description || null,
      date,
      start_time: start_time || null,
      end_time: end_time || null,
      location: location || null,
      category,
      status,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

/** Só os campos do schema; `id` e `trip_id` não estão nele — o item não muda de viagem. */
export function atualizar(tx: Tx, tripId: string, itemId: string, campos: AtualizarItemItinerario) {
  const { title, description, date, start_time, end_time, location, category, status } = campos
  return tx
    .updateTable("itinerary_items")
    .set({ title, description, date, start_time, end_time, location, category, status })
    .where("trip_id", "=", tripId)
    .where("id", "=", itemId)
    .returningAll()
    .executeTakeFirst()
}

export async function excluir(tx: Tx, tripId: string, itemId: string): Promise<boolean> {
  const r = await tx
    .deleteFrom("itinerary_items")
    .where("trip_id", "=", tripId)
    .where("id", "=", itemId)
    .executeTakeFirst()
  return r.numDeletedRows > BigInt(0)
}
