/**
 * Projeção pública de uma viagem: o recorte que pode sair do grupo e virar post
 * no feed. É a fronteira entre Viagem & Itinerário e o Social; o Social não lê
 * `trips` nem `itinerary_items` direto, lê só o que esta função devolve.
 *
 * A regra é de lista branca. Cada coluna é nomeada no `select` e copiada campo a
 * campo para o objeto de saída, então uma coluna nova em `trips` só chega ao
 * post se alguém a acrescentar aqui (e o teste das chaves quebra quando isso
 * acontece). Nunca entram: da viagem, `budget`, `currency`, `description`,
 * `status` e os membros; dos itens, `notes`, `latitude`, `longitude` e `status`;
 * dos lugares, `notes`, `latitude`, `longitude`, `rating`, `visited`,
 * `place_id` e `user_id`.
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

// Proposta do Micael (S06-M-publicar-viagem, 19/11) para revisão da Audrey: lugares salvos da viagem na projeção, em lista branca.
export type LugarPublico = {
  /** Só para a tela escolher o lugar e o endereço; não vai para o post. */
  id: string
  name: string
  category: string | null
  address: string | null
}

export type ViagemPublica = {
  title: string
  destination: string
  start_date: string
  end_date: string
  itens: ItemPublico[]
  lugares: LugarPublico[]
}

const COLUNAS_VIAGEM = "title, destination, start_date, end_date"
/** O mesmo limite da checagem de `trip_posts.items` no banco. */
export const MAXIMO_ITENS_NO_POST = 200
const COLUNAS_ITEM = "id, title, date, start_time, end_time, category, location, description"

// Proposta do Micael (S06-M-publicar-viagem, 19/11) para revisão da Audrey: colunas e teto dos lugares.
const COLUNAS_LUGAR = "id, name, category, address"
/** O mesmo limite da checagem de `trip_posts.places` no banco. */
export const MAXIMO_LUGARES_NO_POST = 200

type LinhaViagem = Omit<ViagemPublica, "itens" | "lugares">

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
    // O post aceita no máximo 200 itens (`social_itens_do_post_validos`, no
    // banco). Sem o teto, uma viagem maior fazia o insert do post falhar.
    .limit(MAXIMO_ITENS_NO_POST)
    .returns<ItemPublico[]>()

  if (erroItens) {
    throw new Error("Não foi possível ler o itinerário da viagem")
  }

  // Proposta do Micael (S06-M-publicar-viagem, 19/11) para revisão da Audrey:
  // lê os lugares com o mesmo cliente e o mesmo tratamento de erro dos itens,
  // na ordem da tela de lugares da viagem (mais recentes primeiro).
  const { data: lugares, error: erroLugares } = await supabase
    .from("places")
    .select(COLUNAS_LUGAR)
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .limit(MAXIMO_LUGARES_NO_POST)
    .returns<LugarPublico[]>()

  if (erroLugares) {
    throw new Error("Não foi possível ler os lugares da viagem")
  }

  return {
    title: cortar(viagem.title, LIMITES_DO_POST.tituloViagem),
    destination: cortar(viagem.destination, LIMITES_DO_POST.destino),
    start_date: viagem.start_date,
    end_date: viagem.end_date,
    itens: (itens ?? []).map((item) => ({
      id: item.id,
      title: cortar(item.title, LIMITES_DO_POST.tituloItem),
      date: item.date,
      start_time: item.start_time,
      end_time: item.end_time,
      category: item.category,
      location: cortarOpcional(item.location, LIMITES_DO_POST.local),
      description: cortarOpcional(item.description, LIMITES_DO_POST.descricao),
    })),
    // Proposta do Micael (S06-M-publicar-viagem, 19/11) para revisão da Audrey: cópia campo a campo.
    lugares: (lugares ?? []).map((lugar) => ({
      id: lugar.id,
      name: lugar.name,
      category: lugar.category,
      address: lugar.address,
    })),
  }
}

/**
 * Tetos de cada texto no post, iguais aos CHECK de `trip_posts` e de
 * `social_itens_do_post_validos` no banco (e aos de lib/schemas/viagem.ts e
 * lib/schemas/itinerario.ts). Linhas gravadas antes do zod podem passar disso;
 * sem o corte, o insert do post era recusado e publicar devolvia 500.
 *
 * @RF09.7 a projeção entrega cada texto dentro do limite que o post aceita
 */
export const LIMITES_DO_POST = {
  tituloViagem: 120,
  destino: 160,
  tituloItem: 120,
  local: 200,
  descricao: 2000,
} as const

/** Corta por caractere, como o `char_length` do Postgres: não parte emoji ao meio. */
function cortar(texto: string, limite: number): string {
  const caracteres = Array.from(texto)
  return caracteres.length <= limite ? texto : caracteres.slice(0, limite).join("")
}

function cortarOpcional(texto: string | null, limite: number): string | null {
  return texto === null ? null : cortar(texto, limite)
}
