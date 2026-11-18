import type { SupabaseClient } from "@supabase/supabase-js"
import { ErroHttp } from "@/lib/http"
import type { EnderecoDoLugar, EscolhaDoRoteiro, PedidoPost } from "@/lib/schemas/post"
import type { ViagemPublica } from "@/lib/trips/publico"

/**
 * O post de uma viagem (S06-M-publicar-viagem): montar a cópia que vai para o
 * perfil, e ler, gravar, atualizar e apagar o post da sessão.
 *
 * **O post é uma cópia, não uma janela ao vivo.** Ao publicar, ele guarda
 * título, destino, datas, a legenda, o roteiro e os lugares escolhidos, tirados
 * da projeção pública da viagem (`projecaoPublicaDaViagem`, lib/trips/publico.ts,
 * domínio da Audrey). Editar a viagem depois não muda o post; "Atualizar
 * publicação" copia de novo. Assim o que sai do grupo é só o que o autor viu na
 * prévia e confirmou, e o feed não precisa ler `trips`, `itinerary_items` nem
 * `places`. Este módulo também não lê: recebe a projeção já pronta.
 *
 * Decisões do Micael (docs/plans/S06-M-publicar-viagem.md; as de 18/11 seguem a
 * prévia do Fernando e substituem as de 11/11 onde conflitam):
 * - qualquer membro publica, e cada membro tem o próprio post da mesma viagem
 *   (`unique (trip_id, author_id)`): publicar de novo é 409, e não um segundo post;
 * - **roteiro dia a dia** ligado publica todos os itens da projeção, com título e,
 *   quando existem, data, horários e categoria; local e descrição só se o autor
 *   os ligou, para o post inteiro;
 * - **lugares salvos**: nome e categoria, e o endereço que o autor escolheu por
 *   lugar (nenhum, o do Google ou um digitado);
 * - **notas, coordenadas, preço, status, rating e ids nunca**;
 * - se o autor sai da viagem, o post continua dele: ele não atualiza mais (a
 *   policy de UPDATE exige ser membro), mas despublica.
 *
 * Tudo com o cliente da sessão: a RLS de `trip_posts` vale (migrations
 * 20261116195039 e a de legenda e lugares). A autorização explícita
 * (`exigirMembro` e o username) é da rota, antes de chamar daqui; a policy é a
 * segunda linha.
 *
 * `authenticated` não lê a coluna `trip_id` (dois posts com o mesmo `trip_id`
 * revelariam quem viajou junto), então `select("*")` responde 42501 e as
 * colunas vão listadas. O autor acha o próprio post pela função
 * `social_meu_post_da_viagem`. O que este módulo devolve para a rota não tem
 * `trip_id` nem `author_id`.
 *
 * Erro do banco nunca sai cru: 23505 vira 409, 42501 (grant ou policy) vira
 * 403, e o resto lança um `Error` comum com o original em `cause`, que
 * `respostaDeErro` (lib/http.ts) transforma no 500 genérico.
 *
 * @RF09.7 publicar viagem expondo só título, destino, datas, legenda, capa, roteiro e lugares
 */

type ClienteDaSessao = Pick<SupabaseClient, "from" | "rpc">

/**
 * Um lugar salvo como a projeção o entrega. A Audrey vai acrescentar `lugares`
 * à `ViagemPublica` (pedido de 18/11); até lá, o tipo mora aqui e a lista é
 * lida como opcional.
 */
export type LugarPublico = {
  /** Só para a tela escolher o lugar e o endereço; não vai para o post. */
  id: string
  name: string
  category: string | null
  address: string | null
}

/** A projeção com os lugares: compila hoje, e funciona quando `lugares` chegar à `ViagemPublica`. */
export type ProjecaoComLugares = ViagemPublica & { lugares?: LugarPublico[] }

/** Os lugares da projeção, ou a lista vazia enquanto ela ainda não os traz. */
export function lugaresDaProjecao(projecao: ProjecaoComLugares): LugarPublico[] {
  return projecao.lugares ?? []
}

/**
 * Um item na cópia. Campo vazio ou desligado é **omitido**, nunca `null`: é o
 * formato que `social_itens_do_post_validos` aceita (todo campo presente é texto).
 */
export type ItemDoPost = {
  title: string
  /** AAAA-MM-DD */
  date?: string
  start_time?: string
  end_time?: string
  category?: string
  location?: string
  description?: string
}

/** Um lugar na cópia, no formato de `social_lugares_do_post_validos`: campo vazio é omitido. */
export type LugarDoPost = {
  name: string
  category?: string
  address?: string
}

/** O conteúdo do post, montado no servidor: o que vai para o INSERT e o UPDATE. */
export type CopiaDoPost = {
  title: string
  destination: string
  start_date: string
  end_date: string
  /** Já limpa: `null` quando o autor não escreveu nada. */
  caption: string | null
  items: ItemDoPost[]
  places: LugarDoPost[]
}

/**
 * O post da sessão, como a rota o recebe. Sem `trip_id` e sem `author_id`.
 * `cover_path` é o caminho no bucket: a rota o troca pela URL assinada
 * (lib/social/capa.ts) antes de responder.
 */
export type PostDoAutor = CopiaDoPost & {
  id: string
  cover_path: string | null
  created_at: string
  updated_at: string
}

/** Do grant de SELECT (que não tem `trip_id`), sem `author_id`: a rota não devolve nenhum dos dois. */
const COLUNAS_POST =
  "id, title, destination, start_date, end_date, caption, items, places, cover_path, created_at, updated_at"

const CHAVE_REPETIDA = "23505"
const SEM_PRIVILEGIO = "42501"

/** Tetos de `social_lugares_do_post_validos`, em caracteres. */
const MAXIMO_NOME_LUGAR = 200
const MAXIMO_CATEGORIA_LUGAR = 60
const MAXIMO_ENDERECO_LUGAR = 300

/** Os campos opcionais de um item, como chegam (da projeção ou do jsonb gravado). */
type CamposDoItem = Partial<Record<Exclude<keyof ItemDoPost, "title">, unknown>> & { title?: unknown }
/** Os campos de um lugar, como chegam (da projeção ou do jsonb gravado). */
type CamposDoLugar = { name?: unknown; category?: unknown; address?: unknown }

/**
 * Texto que vale publicar: string com algo além de espaços, sem os espaços das
 * pontas e, com `maximo`, dentro do teto em caracteres. Qualquer outra coisa
 * (nulo, número, vazio, longo demais) é `undefined`, e o campo fica de fora.
 */
function texto(valor: unknown, maximo = Infinity): string | undefined {
  if (typeof valor !== "string") return undefined
  const limpo = valor.trim()
  if (limpo === "" || [...limpo].length > maximo) return undefined
  return limpo
}

/**
 * Copia um item campo a campo, nunca com spread: chave que não está nomeada
 * aqui (`id`, `notes`, `latitude`, `status`, preço...) não tem como chegar ao
 * post, mesmo que o objeto de origem a traga em tempo de execução. Sem título
 * (vazio ou só espaços) o item não tem o que mostrar, e o CHECK do banco o
 * recusaria: devolve `null`.
 */
function copiarItem(campos: CamposDoItem, roteiro: EscolhaDoRoteiro): ItemDoPost | null {
  const title = texto(campos.title)
  if (title === undefined) return null
  const copia: ItemDoPost = { title }

  const atribuir = (chave: Exclude<keyof ItemDoPost, "title">) => {
    const valor = texto(campos[chave])
    if (valor !== undefined) copia[chave] = valor
  }

  // Data, horários e categoria saem sempre que existem: são o "dia a dia".
  atribuir("date")
  atribuir("start_time")
  atribuir("end_time")
  atribuir("category")
  if (roteiro.local) atribuir("location")
  if (roteiro.descricao) atribuir("description")
  return copia
}

/**
 * Copia um lugar campo a campo: nome, categoria e o endereço escolhido. Nunca
 * `notes`, coordenadas, `rating`, `visited` nem `place_id`. Categoria e
 * endereço acima do teto do banco ficam de fora, para um texto longo vindo do
 * Google não derrubar a publicação; sem nome válido, o lugar não entra.
 */
function copiarLugar(campos: CamposDoLugar, endereco: EnderecoDoLugar): LugarDoPost | null {
  const name = texto(campos.name, MAXIMO_NOME_LUGAR)
  if (name === undefined) return null
  const copia: LugarDoPost = { name }

  const category = texto(campos.category, MAXIMO_CATEGORIA_LUGAR)
  if (category !== undefined) copia.category = category

  const address =
    endereco === "nenhum"
      ? undefined
      : texto(endereco === "google" ? campos.address : endereco.texto, MAXIMO_ENDERECO_LUGAR)
  if (address !== undefined) copia.address = address
  return copia
}

/** A legenda limpa, ou `null`. */
function legenda(valor: unknown): string | null {
  return texto(valor) ?? null
}

/**
 * Monta a cópia do post a partir da projeção pública e das escolhas do autor.
 * Pura: não lê nem grava nada.
 *
 * - `roteiro` nulo publica sem itinerário; ligado, todos os itens da projeção
 *   (ela já tira os cancelados), na ordem dela.
 * - `lugares` nulo publica sem lugares; ligado, só os escolhidos, na ordem da
 *   projeção. Id escolhido que não está na projeção (lugar de outra viagem,
 *   apagado ou inventado) é ignorado em silêncio: o corpo só escolhe, não
 *   acrescenta. Ids são comparados em minúsculas.
 * - O endereço `"google"` copia o `address` da projeção; vazio ou nulo, o
 *   lugar sai sem endereço.
 * - Todo texto sai sem os espaços das pontas, e campo vazio é omitido.
 * - `marcados` não entra na cópia: as marcações moram em `post_tags`.
 */
export function montarPost(
  projecao: ProjecaoComLugares,
  pedido: Pick<PedidoPost, "legenda" | "roteiro" | "lugares">,
): CopiaDoPost {
  const { roteiro, lugares } = pedido

  const escolhidos = new Map<string, EnderecoDoLugar>()
  for (const lugar of lugares ?? []) escolhidos.set(lugar.id.toLowerCase(), lugar.endereco)

  return {
    title: projecao.title,
    destination: projecao.destination,
    start_date: projecao.start_date,
    end_date: projecao.end_date,
    caption: legenda(pedido.legenda),
    items: roteiro ? projecao.itens.flatMap((item) => copiarItem(item, roteiro) ?? []) : [],
    places: lugaresDaProjecao(projecao).flatMap((lugar) => {
      const endereco = escolhidos.get(lugar.id.toLowerCase())
      return endereco === undefined ? [] : (copiarLugar(lugar, endereco) ?? [])
    }),
  }
}

const TODO_O_ROTEIRO: EscolhaDoRoteiro = { local: true, descricao: true }

/**
 * Uma lista gravada (`items` ou `places`), de volta ao tipo. O CHECK do banco
 * já garante o formato; copiar de novo pela mesma lista branca faz a resposta
 * da rota depender só deste arquivo, e não de o CHECK continuar igual.
 */
function gravados<T>(lista: unknown, copiar: (campos: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(lista)) return []
  return lista.flatMap((valor: unknown) => {
    if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return []
    return copiar(valor as Record<string, unknown>) ?? []
  })
}

/** O endereço gravado é o que o autor escolheu: volta como texto digitado. */
const lugarGravado = (campos: CamposDoLugar) =>
  copiarLugar(campos, typeof campos.address === "string" ? { texto: campos.address } : "nenhum")

type LinhaDoPost = Omit<PostDoAutor, "items" | "places" | "caption"> & {
  caption: unknown
  items: unknown
  places: unknown
}

/** A linha do banco, campo a campo, no formato da rota. */
function paraPost(linha: LinhaDoPost): PostDoAutor {
  return {
    id: linha.id,
    title: linha.title,
    destination: linha.destination,
    start_date: linha.start_date,
    end_date: linha.end_date,
    caption: legenda(linha.caption),
    items: gravados(linha.items, (campos) => copiarItem(campos, TODO_O_ROTEIRO)),
    places: gravados(linha.places, lugarGravado),
    cover_path: linha.cover_path,
    created_at: linha.created_at,
    updated_at: linha.updated_at,
  }
}

/**
 * Erro do banco sem a mensagem crua. 42501 é o grant de coluna ou a policy:
 * não-membro publicando, ou autor que saiu da viagem atualizando.
 */
function erroDoBanco(error: { code?: string }, acao: string): Error {
  if (error.code === SEM_PRIVILEGIO) return new ErroHttp(403, `Sem permissão para ${acao}`)
  return new Error(`[post da viagem] não foi possível ${acao}`, { cause: error })
}

/**
 * O post da sessão naquela viagem, ou `null` se ela não publicou. São duas
 * leituras: a função do banco devolve o id (só sobre `auth.uid()`), e o select
 * traz as colunas. Se o post sumir entre as duas, também é `null`.
 */
export async function postDaViagem(supabase: ClienteDaSessao, tripId: string): Promise<PostDoAutor | null> {
  const { data: postId, error: erroId } = await supabase.rpc("social_meu_post_da_viagem", { viagem: tripId })
  if (erroId) throw erroDoBanco(erroId, "ler a publicação")
  if (!postId) return null

  const { data, error } = await supabase.from("trip_posts").select(COLUNAS_POST).eq("id", postId).maybeSingle()
  if (error) throw erroDoBanco(error, "ler a publicação")
  return data ? paraPost(data as LinhaDoPost) : null
}

/**
 * Grava o post. Campo a campo, e só nas colunas do grant de INSERT: sem
 * `cover_path` (a capa só entra pela rota dela, depois de conferir os bytes),
 * sem `id` e sem datas de criação (defaults do banco).
 */
export async function publicar(
  supabase: ClienteDaSessao,
  { tripId, autorId, copia }: { tripId: string; autorId: string; copia: CopiaDoPost },
): Promise<PostDoAutor> {
  const { data, error } = await supabase
    .from("trip_posts")
    .insert({
      trip_id: tripId,
      author_id: autorId,
      title: copia.title,
      destination: copia.destination,
      start_date: copia.start_date,
      end_date: copia.end_date,
      caption: copia.caption,
      items: copia.items,
      places: copia.places,
    })
    .select(COLUNAS_POST)
    .single()

  // Dois cliques em "Publicar", ou a tela desatualizada: o post já existe.
  if (error?.code === CHAVE_REPETIDA) throw new ErroHttp(409, "Você já publicou esta viagem")
  if (error) throw erroDoBanco(error, "publicar esta viagem")
  return paraPost(data as LinhaDoPost)
}

/**
 * "Atualizar publicação": copia a viagem de novo. Só o conteúdo muda; capa,
 * autor e viagem não. Devolve `null` se nenhuma linha mudou (o post não existe
 * ou não é da sessão): a rota responde 404. O autor que saiu da viagem esbarra
 * no WITH CHECK da policy (42501) e recebe 403.
 */
export async function atualizar(
  supabase: ClienteDaSessao,
  postId: string,
  copia: CopiaDoPost,
): Promise<PostDoAutor | null> {
  const { data, error } = await supabase
    .from("trip_posts")
    .update({
      title: copia.title,
      destination: copia.destination,
      start_date: copia.start_date,
      end_date: copia.end_date,
      caption: copia.caption,
      items: copia.items,
      places: copia.places,
    })
    .eq("id", postId)
    .select(COLUNAS_POST)
    .maybeSingle()

  if (error) throw erroDoBanco(error, "atualizar esta publicação")
  return data ? paraPost(data as LinhaDoPost) : null
}

/**
 * Troca a capa (ou a tira, com `null`) e devolve a anterior, para a rota apagar
 * o arquivo velho do bucket. `null` quando o post não existe ou não é da sessão.
 *
 * Como `trocarAvatar` (app/api/social/perfil/foto): lê a capa atual e só troca
 * se ela ainda for a lida. Duas abas trocando ao mesmo tempo não apagam as duas
 * a mesma capa anterior deixando a nova de uma delas órfã: a segunda não acha a
 * linha e recebe 409. Nesse 409 a rota apaga o arquivo que acabou de enviar.
 *
 * O caminho não é conferido aqui: quem o monta é `caminhoDaNovaCapa`
 * (lib/social/capa.ts), e o CHECK do banco exige o formato e a pasta do autor.
 */
export async function definirCapa(
  supabase: ClienteDaSessao,
  postId: string,
  coverPath: string | null,
): Promise<{ capaAnterior: string | null } | null> {
  const atual = await supabase.from("trip_posts").select("cover_path").eq("id", postId).maybeSingle()
  if (atual.error) throw erroDoBanco(atual.error, "trocar a capa")
  if (!atual.data) return null
  const capaAnterior = (atual.data as { cover_path: string | null }).cover_path

  const troca = supabase.from("trip_posts").update({ cover_path: coverPath }).eq("id", postId)
  const condicionada = capaAnterior === null ? troca.is("cover_path", null) : troca.eq("cover_path", capaAnterior)
  const { data, error } = await condicionada.select("id").maybeSingle()

  if (error) throw erroDoBanco(error, "trocar a capa")
  if (!data) throw new ErroHttp(409, "A capa foi alterada em outra aba. Recarregue a página e tente de novo.")
  return { capaAnterior }
}

/**
 * Despublica: apaga o post e devolve a capa que ele tinha, para a rota apagar o
 * arquivo do bucket. `null` quando nada foi apagado (o post não existe ou não é
 * da sessão). Funciona para quem já saiu da viagem: a policy de DELETE só
 * exige ser o autor.
 */
export async function despublicar(
  supabase: ClienteDaSessao,
  postId: string,
): Promise<{ capaAnterior: string | null } | null> {
  const { data, error } = await supabase
    .from("trip_posts")
    .delete()
    .eq("id", postId)
    .select("cover_path")
    .maybeSingle()

  if (error) throw erroDoBanco(error, "despublicar")
  if (!data) return null
  return { capaAnterior: (data as { cover_path: string | null }).cover_path }
}
