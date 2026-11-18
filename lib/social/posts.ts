import type { SupabaseClient } from "@supabase/supabase-js"
import { ErroHttp } from "@/lib/http"
import type { CamposVisiveis } from "@/lib/schemas/post"
import type { ViagemPublica } from "@/lib/trips/publico"

/**
 * O post de uma viagem (S06-M-publicar-viagem): montar a cópia que vai para o
 * perfil, e ler, gravar, atualizar e apagar o post da sessão.
 *
 * **O post é uma cópia, não uma janela ao vivo.** Ao publicar, ele guarda
 * título, destino, datas e os itens escolhidos, tirados da projeção pública da
 * viagem (`projecaoPublicaDaViagem`, lib/trips/publico.ts, domínio da Audrey).
 * Editar a viagem depois não muda o post; "Atualizar publicação" copia de novo.
 * Assim o que sai do grupo é só o que o autor viu na prévia e confirmou, e o
 * feed não precisa ler `trips` nem `itinerary_items`. Este módulo também não
 * lê: recebe a projeção já pronta.
 *
 * Decisões do Micael em 11/11 (docs/plans/S06-M-publicar-viagem.md):
 * - qualquer membro publica, e cada membro tem o próprio post da mesma viagem
 *   (`unique (trip_id, author_id)`): publicar de novo é 409, e não um segundo post;
 * - do item entra sempre o título; local, descrição, data e hora e categoria só
 *   se o autor os ligou, para o post inteiro; **notas, coordenadas e preço nunca**;
 * - se o autor sai da viagem, o post continua dele: ele não atualiza mais (a
 *   policy de UPDATE exige ser membro), mas despublica.
 *
 * Tudo com o cliente da sessão: a RLS de `trip_posts` vale (migration
 * 20261116195039). A autorização explícita (`exigirMembro` e o username) é da
 * rota, antes de chamar daqui; a policy é a segunda linha.
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
 * @RF09.7 publicar viagem expondo só título, destino, datas, capa e itinerário
 */

type ClienteDaSessao = Pick<SupabaseClient, "from" | "rpc">

/**
 * Um item na cópia. Campo desligado ou vazio é **omitido**, nunca `null`: é o
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

/** O conteúdo do post, montado no servidor: o que vai para o INSERT e o UPDATE. */
export type CopiaDoPost = {
  title: string
  destination: string
  start_date: string
  end_date: string
  items: ItemDoPost[]
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
const COLUNAS_POST = "id, title, destination, start_date, end_date, items, cover_path, created_at, updated_at"

const CHAVE_REPETIDA = "23505"
const SEM_PRIVILEGIO = "42501"

/** Os campos opcionais de um item, como chegam (da projeção ou do jsonb gravado). */
type CamposDoItem = Partial<Record<Exclude<keyof ItemDoPost, "title">, unknown>>

/** Texto que vale publicar: string com algo além de espaços. O valor sai como veio. */
function texto(valor: unknown): string | undefined {
  return typeof valor === "string" && valor.trim() !== "" ? valor : undefined
}

/**
 * Copia um item campo a campo, nunca com spread: chave que não está nomeada
 * aqui (`id`, `notes`, `latitude`, `status`, preço...) não tem como chegar ao
 * post, mesmo que o objeto de origem a traga em tempo de execução.
 */
function copiarItem(titulo: string, campos: CamposDoItem, mostrar: CamposVisiveis): ItemDoPost {
  const copia: ItemDoPost = { title: titulo }

  const atribuir = (chave: keyof CamposDoItem) => {
    const valor = texto(campos[chave])
    if (valor !== undefined) copia[chave] = valor
  }

  // `horario` liga data e horários juntos: hora sem o dia não diz nada.
  if (mostrar.horario) {
    atribuir("date")
    atribuir("start_time")
    atribuir("end_time")
  }
  if (mostrar.categoria) atribuir("category")
  if (mostrar.local) atribuir("location")
  if (mostrar.descricao) atribuir("description")
  return copia
}

/**
 * Monta a cópia do post a partir da projeção pública e das escolhas do autor.
 * Pura: não lê nem grava nada.
 *
 * - Os itens seguem a ordem da projeção (data e hora), não a de `itens`.
 * - Só entra item cuja `id` está em `itens`, comparada em minúsculas. Id
 *   escolhido que não está na projeção (item cancelado, de outra viagem ou
 *   inventado) é ignorado em silêncio: o corpo só escolhe, não acrescenta.
 * - `itens` vazio publica a viagem sem itinerário.
 */
export function montarPost(projecao: ViagemPublica, itens: string[], mostrar: CamposVisiveis): CopiaDoPost {
  const escolhidos = new Set(itens.map((id) => id.toLowerCase()))
  return {
    title: projecao.title,
    destination: projecao.destination,
    start_date: projecao.start_date,
    end_date: projecao.end_date,
    items: projecao.itens
      .filter((item) => escolhidos.has(item.id.toLowerCase()))
      .map((item) => copiarItem(item.title, item, mostrar)),
  }
}

const TODOS_OS_CAMPOS: CamposVisiveis = { local: true, descricao: true, horario: true, categoria: true }

/**
 * O `items` gravado, de volta ao tipo. O CHECK do banco já garante o formato;
 * copiar de novo pela mesma lista branca faz a resposta da rota depender só
 * deste arquivo, e não de o CHECK continuar igual.
 */
function itensGravados(items: unknown): ItemDoPost[] {
  if (!Array.isArray(items)) return []
  return items.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return []
    const campos = item as CamposDoItem & { title?: unknown }
    return typeof campos.title === "string" ? [copiarItem(campos.title, campos, TODOS_OS_CAMPOS)] : []
  })
}

type LinhaDoPost = Omit<PostDoAutor, "items"> & { items: unknown }

/** A linha do banco, campo a campo, no formato da rota. */
function paraPost(linha: LinhaDoPost): PostDoAutor {
  return {
    id: linha.id,
    title: linha.title,
    destination: linha.destination,
    start_date: linha.start_date,
    end_date: linha.end_date,
    items: itensGravados(linha.items),
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
      items: copia.items,
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
      items: copia.items,
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
