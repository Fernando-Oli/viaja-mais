import type { Tx } from "../../db/como-usuario"
import type { AtualizarLugar, CriarLugar } from "../../../lib/schemas/lugar"
import { LIMITE_LISTAGEM } from "../../../lib/listagem"

/**
 * Acesso a `places` e `place_reviews`. Toda consulta de um lugar filtra por
 * `trip_id` **e** `id`: a autorização olhou para a viagem da URL.
 */

export function listar(tx: Tx, tripId: string) {
  return tx
    .selectFrom("places")
    .selectAll()
    .where("trip_id", "=", tripId)
    .orderBy("created_at", "desc")
    .limit(LIMITE_LISTAGEM)
    .execute()
}

/**
 * Lugares de todas as viagens de que o usuário participa, com título e destino
 * da viagem em `trips`. O lugar que um membro salvou interessa ao grupo inteiro.
 *
 * @RF08.2 salvar lugar · @RF04.4 os membros visualizam a viagem
 */
export async function doUsuario(tx: Tx, userId: string) {
  const linhas = await tx
    .selectFrom("places")
    .innerJoin("trips", "trips.id", "places.trip_id")
    .innerJoin("trip_members", "trip_members.trip_id", "trips.id")
    .selectAll("places")
    .select(["trips.title as viagem_titulo", "trips.destination as viagem_destino"])
    .where("trip_members.user_id", "=", userId)
    .orderBy("places.created_at", "desc")
    .limit(LIMITE_LISTAGEM)
    .execute()

  return linhas.map(({ viagem_titulo, viagem_destino, ...lugar }) => ({
    ...lugar,
    trips: { title: viagem_titulo, destination: viagem_destino },
  }))
}

/** Campo a campo: `trip_id` vem da URL e `user_id` da sessão. @RNF02.7 */
export function criar(tx: Tx, tripId: string, userId: string, campos: CriarLugar) {
  const { name, address, latitude, longitude, place_id, category, rating, notes } = campos
  return tx
    .insertInto("places")
    .values({
      trip_id: tripId,
      user_id: userId,
      name,
      address: address || null,
      latitude,
      longitude,
      place_id: place_id || null,
      category: category || null,
      rating: rating ?? null,
      notes: notes || null,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

/**
 * Só o que veio no corpo entra no update: marcar visitado não pode apagar a
 * observação que outro membro escreveu. Nome e coordenadas não são editáveis.
 */
export function atualizar(tx: Tx, tripId: string, placeId: string, campos: AtualizarLugar) {
  const valores: { visited?: boolean; notes?: string | null } = {}
  if (campos.visited !== undefined) valores.visited = campos.visited
  if (campos.notes !== undefined) valores.notes = campos.notes || null
  return tx
    .updateTable("places")
    .set(valores)
    .where("trip_id", "=", tripId)
    .where("id", "=", placeId)
    .returningAll()
    .executeTakeFirst()
}

export async function excluir(tx: Tx, tripId: string, placeId: string): Promise<boolean> {
  const r = await tx.deleteFrom("places").where("trip_id", "=", tripId).where("id", "=", placeId).executeTakeFirst()
  return r.numDeletedRows > BigInt(0)
}

/** Nome e identificador do Google do lugar da viagem da URL. */
export function lugarDaViagem(tx: Tx, tripId: string, placeId: string) {
  return tx
    .selectFrom("places")
    .select(["name", "place_id"])
    .where("trip_id", "=", tripId)
    .where("id", "=", placeId)
    .executeTakeFirst()
}

/** Avaliações do lugar do Google, com o nome de quem avaliou. */
export async function avaliacoes(tx: Tx, googlePlaceId: string) {
  const linhas = await tx
    .selectFrom("place_reviews")
    .leftJoin("profiles", "profiles.id", "place_reviews.user_id")
    .select([
      "place_reviews.id",
      "place_reviews.user_id",
      "place_reviews.rating",
      "place_reviews.comment",
      "place_reviews.updated_at",
      "profiles.full_name",
    ])
    .where("place_reviews.google_place_id", "=", googlePlaceId)
    .orderBy("place_reviews.updated_at", "desc")
    .execute()
  return linhas
}

export function minhaAvaliacao(tx: Tx, googlePlaceId: string, userId: string) {
  return tx
    .selectFrom("place_reviews")
    .select("id")
    .where("google_place_id", "=", googlePlaceId)
    .where("user_id", "=", userId)
    .executeTakeFirst()
}

/** Edita só nota e comentário: é o que o grant de UPDATE cobre. */
export function editarAvaliacao(tx: Tx, id: string, userId: string, rating: number, comment: string | null) {
  return tx
    .updateTable("place_reviews")
    .set({ rating, comment })
    .where("id", "=", id)
    .where("user_id", "=", userId)
    .returningAll()
    .executeTakeFirstOrThrow()
}

export function criarAvaliacao(
  tx: Tx,
  dados: { googlePlaceId: string; nome: string; userId: string; rating: number; comment: string | null },
) {
  return tx
    .insertInto("place_reviews")
    .values({
      google_place_id: dados.googlePlaceId,
      place_name: dados.nome,
      user_id: dados.userId,
      rating: dados.rating,
      comment: dados.comment,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}

export async function excluirAvaliacao(tx: Tx, googlePlaceId: string, userId: string): Promise<boolean> {
  const r = await tx
    .deleteFrom("place_reviews")
    .where("google_place_id", "=", googlePlaceId)
    .where("user_id", "=", userId)
    .executeTakeFirst()
  return r.numDeletedRows > BigInt(0)
}
