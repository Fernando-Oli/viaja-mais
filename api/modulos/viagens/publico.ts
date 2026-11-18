/**
 * Projeção pública de uma viagem: o recorte que pode sair do grupo e virar post
 * no feed. É a fronteira entre Viagem & Itinerário e o Social; o Social não lê
 * `trips` nem `itinerary_items` direto, lê só o que esta função devolve.
 *
 * A regra é de lista branca. Cada coluna é nomeada no `select` e copiada campo a
 * campo para o objeto de saída, então uma coluna nova em `trips` só chega ao
 * post se alguém a acrescentar aqui (e o teste das chaves quebra quando isso
 * acontece). Nunca entram: da viagem, `budget`, `currency`, `description`,
 * `status` e os membros; dos itens, `notes`, `latitude`, `longitude` e `status`.
 *
 * Roda na transação do usuário (`comoUsuario`): a RLS da viagem continua
 * valendo. A autorização explícita (`exigirMembro`) é de quem chama.
 *
 * Saiu de `lib/trips/publico.ts`, que lia pelo cliente do Supabase.
 *
 * @RF09.7 publicar uma viagem expõe só título, destino, datas e itinerário
 */
import { sql } from "kysely"
import type { Tx } from "../../db/como-usuario"

export type ItemPublico = {
  /** Só para a tela marcar quais itens entram no post; não vai para o post. */
  id: string
  title: string
  /** AAAA-MM-DD */
  date: string
  start_time: string | null
  end_time: string | null
  category: string | null
  location: string | null
  description: string | null
}

export type ViagemPublica = {
  title: string
  destination: string
  start_date: string
  end_date: string
  itens: ItemPublico[]
}

/** O mesmo limite da checagem de `trip_posts.items` no banco. */
export const MAXIMO_ITENS_NO_POST = 200

/** Devolve `null` quando a viagem não existe ou a sessão não a enxerga. */
export async function projecaoPublicaDaViagem(tx: Tx, tripId: string): Promise<ViagemPublica | null> {
  const viagem = await tx
    .selectFrom("trips")
    .select(["title", "destination", "start_date", "end_date"])
    .where("id", "=", tripId)
    .executeTakeFirst()
  if (!viagem) return null

  const itens = await tx
    .selectFrom("itinerary_items")
    .select(["id", "title", "date", "start_time", "end_time", "category", "location", "description"])
    .where("trip_id", "=", tripId)
    // `status` aceita nulo, e `<>` sozinho descartaria os itens sem status.
    .where((eb) => eb.or([eb("status", "is", null), eb("status", "<>", "cancelled")]))
    .orderBy("date", "asc")
    .orderBy(sql`start_time asc nulls last`)
    // O post aceita no máximo 200 itens (`social_itens_do_post_validos`, no
    // banco). Sem o teto, uma viagem maior fazia o insert do post falhar.
    .limit(MAXIMO_ITENS_NO_POST)
    .execute()

  // Lista branca: campo a campo, nunca o objeto que veio do banco.
  return {
    title: viagem.title,
    destination: viagem.destination,
    start_date: viagem.start_date,
    end_date: viagem.end_date,
    itens: itens.map((item) => ({
      id: item.id,
      title: item.title,
      date: item.date,
      start_time: item.start_time,
      end_time: item.end_time,
      category: item.category,
      location: item.location,
      description: item.description,
    })),
  }
}
