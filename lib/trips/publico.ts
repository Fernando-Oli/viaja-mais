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
 * Roda com o cliente da sessão: a RLS da viagem continua valendo. A
 * autorização explícita (`exigirMembro`) é de quem chama.
 *
 * @RF09.7 publicar uma viagem expõe só título, destino, datas e itinerário
 */
import type { SupabaseClient } from "@supabase/supabase-js"

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

const COLUNAS_VIAGEM = "title, destination, start_date, end_date"
const COLUNAS_ITEM = "id, title, date, start_time, end_time, category, location, description"

type LinhaViagem = Omit<ViagemPublica, "itens">

/**
 * Devolve `null` quando a viagem não existe ou a sessão não a enxerga.
 * Erro ao ler os itens lança: publicar um itinerário pela metade, sem avisar,
 * seria pior do que não publicar.
 */
export async function projecaoPublicaDaViagem(
  supabase: SupabaseClient,
  tripId: string,
): Promise<ViagemPublica | null> {
  const { data: viagem, error: erroViagem } = await supabase
    .from("trips")
    .select(COLUNAS_VIAGEM)
    .eq("id", tripId)
    .maybeSingle<LinhaViagem>()

  if (erroViagem || !viagem) return null

  const { data: itens, error: erroItens } = await supabase
    .from("itinerary_items")
    .select(COLUNAS_ITEM)
    .eq("trip_id", tripId)
    // `status` aceita nulo, e `neq` sozinho descartaria os itens sem status.
    .or("status.is.null,status.neq.cancelled")
    .order("date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: false })
    .returns<ItemPublico[]>()

  if (erroItens) {
    throw new Error("Não foi possível ler o itinerário da viagem")
  }

  return {
    title: viagem.title,
    destination: viagem.destination,
    start_date: viagem.start_date,
    end_date: viagem.end_date,
    itens: (itens ?? []).map((item) => ({
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
