import type { SupabaseClient } from "@supabase/supabase-js"
import { ErroHttp } from "@/lib/http"
import {
  MAXIMO_TITULO,
  caracteres,
  limparTextoLivre,
  type EnderecoDoLugar,
  type EscolhaDoRoteiro,
  type PedidoPost,
} from "@/lib/schemas/post"
import type { LugarPublico, ViagemPublica } from "@/lib/trips/publico"
import { FORMATO_CAMINHO } from "./foto"
import { ErroComCodigo } from "./post-http"

/**
 * O post de uma viagem (S06-M-publicar-viagem): montar a cópia que vai para o
 * perfil, e ler, gravar, atualizar e apagar o post da sessão.
 *
 * Desde 18/11 (noite) **uma viagem é um post**: a tabela é `public.posts`
 * (migration 20261118174100, que renomeou a do post de viagem), e o post de
 * viagem é o post que, além das fotos (0 a 3), da legenda e das marcações,
 * leva a cópia da viagem. O formato de resposta é o `PostVisto` de
 * lib/social/post.ts, o mesmo do post sem viagem; daqui saem a linha e a
 * cópia (`viagemDaLinha`).
 *
 * **O post é uma cópia, não uma janela ao vivo.** Ao publicar, ele guarda
 * o título (o que o autor escolheu, ou o da viagem), destino, datas, a legenda,
 * o roteiro e os lugares escolhidos, tirados da projeção pública da viagem (`projecaoPublicaDaViagem`, lib/trips/publico.ts,
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
 * - **o título é editável** (decisão de 18/11): sem título escolhido, vale o da
 *   viagem. O sistema não revela nem prova quem viajou junto; que dois posts
 *   com o mesmo conteúdo deixem deduzir isso é risco aceito;
 * - **texto do grupo acima dos tetos do CHECK não derruba a publicação**: item
 *   com título longo demais fica fora da cópia, e local ou descrição longos
 *   demais são omitidos do item (os mesmos tetos de
 *   `social_itens_do_post_validos`, migration 20261116195039), e data, hora ou
 *   categoria fora do formato do CHECK saem do item (`FORMATO_DO_CAMPO`);
 * - **campo da viagem fora dos CHECKs de `posts`** (título usado sem o do
 *   autor, destino, datas) é 400 com `codigo` (`ViagemForaDoPost`), e não 500;
 * - **título e legenda só com caracteres invisíveis** valem como vazios;
 * - se o autor sai da viagem, o post continua dele: ele não atualiza mais (a
 *   policy de UPDATE exige ser membro), mas despublica.
 *
 * Tudo com o cliente da sessão: a RLS de `posts` vale (migrations
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
 * @RF09.7 publicar viagem expondo só título, destino, datas, legenda, fotos, roteiro e lugares
 */

type ClienteDaSessao = Pick<SupabaseClient, "from" | "rpc">

/**
 * Um lugar salvo como a projeção o entrega. O tipo mora em `lib/trips/publico`
 * (a `ViagemPublica` traz `lugares` desde a proposta de 19/11) e é reexportado
 * aqui para quem já o importava do Social.
 */
export type { LugarPublico }

/**
 * A projeção como `montarPost` a aceita: `lugares` continua opcional para que
 * uma projeção sem a lista (cópia antiga, dublê de teste) publique sem lugares
 * em vez de quebrar.
 */
export type ProjecaoComLugares = Omit<ViagemPublica, "lugares"> & { lugares?: LugarPublico[] }

/** Os lugares da projeção, ou a lista vazia quando ela não os traz. */
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
 * `photos` são os caminhos no bucket, na ordem do carrossel: a rota nunca os
 * devolve (a resposta é o `PostVisto`, com as URLs assinadas).
 */
export type PostDoAutor = CopiaDoPost & {
  id: string
  photos: string[]
  created_at: string
  updated_at: string
}

/** Do grant de SELECT (que não tem `trip_id`), sem `author_id`: a rota não devolve nenhum dos dois. */
const COLUNAS_POST =
  "id, title, destination, start_date, end_date, caption, items, places, photos, created_at, updated_at"

const CHAVE_REPETIDA = "23505"
const SEM_PRIVILEGIO = "42501"

/**
 * Tetos de `social_itens_do_post_validos` (migration 20261116195039), em
 * caracteres. A projeção traz o texto do grupo como ele está na viagem, e o
 * itinerário não tem esses limites: sem eles aqui, um item longo dava 500.
 */
export const MAXIMO_TITULO_ITEM = 120
export const MAXIMO_LOCAL_ITEM = 200
export const MAXIMO_DESCRICAO_ITEM = 2000
/** Teto de itens de `social_itens_do_post_validos` (20261116195039). */
export const MAXIMO_ITENS_POST = 200

/** Teto de cada campo opcional de um item; os sem teto no CHECK têm formato próprio. */
const TETO_DO_CAMPO: Partial<Record<Exclude<keyof ItemDoPost, "title">, number>> = {
  location: MAXIMO_LOCAL_ITEM,
  description: MAXIMO_DESCRICAO_ITEM,
}

/**
 * Os formatos de `social_itens_do_post_validos` (migration 20261116195039),
 * com as **mesmas regex** do CHECK. A projeção entrega o que o Postgres devolve
 * das colunas `date` e `time` do itinerário, e elas aceitam mais do que o CHECK
 * do post: `time` aceita `24:00:00` e frações de segundo (`08:00:00.5`), e
 * `date` escreve o ano 10000 como `10000-01-01` e o antes de Cristo como
 * `0044-03-15 BC`. Sem a conferência aqui, um item assim dava 500 ao publicar.
 * Fora do formato, o campo é omitido e o item fica.
 */
export const FORMATO_DATA_ITEM = /^\d{4}-\d{2}-\d{2}$/
export const FORMATO_HORA_ITEM = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/
/** As categorias do CHECK do item; outra (ou uma nova do itinerário que o CHECK não conhece) é omitida. */
export const CATEGORIAS_DO_ITEM: ReadonlySet<string> = new Set([
  "accommodation",
  "transport",
  "activity",
  "restaurant",
  "attraction",
  "other",
])

/** Conferência de formato de cada campo opcional, além do teto. */
const FORMATO_DO_CAMPO: Partial<Record<Exclude<keyof ItemDoPost, "title">, (valor: string) => boolean>> = {
  date: (valor) => FORMATO_DATA_ITEM.test(valor),
  start_time: (valor) => FORMATO_HORA_ITEM.test(valor),
  end_time: (valor) => FORMATO_HORA_ITEM.test(valor),
  category: (valor) => CATEGORIAS_DO_ITEM.has(valor),
}

/**
 * Tetos dos CHECKs de `posts` (migration 20261116195039): `title` e
 * `destination` não vazios e até 120 e 160 caracteres, e `end_date >=
 * start_date`. O título tem o do autor como saída; destino e datas vêm só da
 * viagem.
 */
export const MAXIMO_TITULO_VIAGEM = MAXIMO_TITULO
export const MAXIMO_DESTINO_VIAGEM = 160

/**
 * A viagem tem um campo que o post não aceita. A rota responde 400 com o
 * `codigo` e a mensagem, em vez do 500 do CHECK: a pessoa sabe o que corrigir
 * (escrever um título para a publicação, ou editar a viagem).
 */
export class ViagemForaDoPost extends ErroComCodigo {
  constructor(
    codigo:
      | "titulo_da_viagem_longo"
      | "titulo_da_viagem_vazio"
      | "destino_da_viagem_longo"
      | "destino_da_viagem_vazio"
      | "datas_da_viagem_invalidas"
      | "datas_da_viagem_invertidas",
    mensagem: string,
  ) {
    super(400, mensagem, codigo)
    this.name = "ViagemForaDoPost"
  }
}

/** Título do post: o escolhido, ou o da viagem dentro do CHECK; senão, 400. */
function tituloDoPost(escolhido: unknown, daViagem: string): string {
  const titulo = textoVisivel(escolhido, MAXIMO_TITULO)
  if (titulo !== undefined) return titulo
  const limpo = daViagem.trim()
  if (limpo === "") {
    throw new ViagemForaDoPost("titulo_da_viagem_vazio", "A viagem está sem título: escreva um título para a publicação")
  }
  if (caracteres(limpo) > MAXIMO_TITULO_VIAGEM) {
    throw new ViagemForaDoPost(
      "titulo_da_viagem_longo",
      `O título da viagem passa de ${MAXIMO_TITULO_VIAGEM} caracteres: escreva um título para a publicação`,
    )
  }
  return limpo
}

/** Destino da viagem dentro do CHECK; senão, 400. Não há destino do autor. */
function destinoDoPost(daViagem: string): string {
  const limpo = daViagem.trim()
  if (limpo === "") {
    throw new ViagemForaDoPost("destino_da_viagem_vazio", "A viagem está sem destino: informe o destino na viagem para publicar")
  }
  if (caracteres(limpo) > MAXIMO_DESTINO_VIAGEM) {
    throw new ViagemForaDoPost(
      "destino_da_viagem_longo",
      `O destino da viagem passa de ${MAXIMO_DESTINO_VIAGEM} caracteres: encurte o destino na viagem para publicar`,
    )
  }
  return limpo
}

/**
 * Datas da viagem no formato AAAA-MM-DD (o mesmo do item, que é o que a tela
 * sabe mostrar) e com a volta no dia da ida ou depois (o CHECK
 * `posts_datas_check`). Com ano de 4 dígitos, a ordem do texto é a das datas.
 */
function datasDoPost(inicio: string, fim: string): { start_date: string; end_date: string } {
  if (!FORMATO_DATA_ITEM.test(inicio) || !FORMATO_DATA_ITEM.test(fim)) {
    throw new ViagemForaDoPost(
      "datas_da_viagem_invalidas",
      "As datas da viagem estão fora do formato: corrija a ida e a volta na viagem para publicar",
    )
  }
  if (fim < inicio) {
    throw new ViagemForaDoPost(
      "datas_da_viagem_invertidas",
      "A volta da viagem está antes da ida: corrija as datas na viagem para publicar",
    )
  }
  return { start_date: inicio, end_date: fim }
}

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
 * Como `texto`, para o que o **autor** escreve (título e legenda), com a mesma
 * regra do schema (`limparTextoLivre`, lib/schemas/post.ts): os caracteres de
 * formatação invisíveis saem das pontas, e só invisíveis vale como vazio. É a
 * defesa para quando `montarPost` recebe o texto sem passar pelo zod.
 */
function textoVisivel(valor: unknown, maximo = Infinity): string | undefined {
  if (typeof valor !== "string") return undefined
  const limpo = limparTextoLivre(valor)
  if (limpo === null || caracteres(limpo) > maximo) return undefined
  return limpo
}

/**
 * Copia um item campo a campo, nunca com spread: chave que não está nomeada
 * aqui (`id`, `notes`, `latitude`, `status`, preço...) não tem como chegar ao
 * post, mesmo que o objeto de origem a traga em tempo de execução. Sem título
 * (vazio, só espaços ou acima de `MAXIMO_TITULO_ITEM`) o item não tem o que
 * mostrar, e o CHECK do banco o recusaria: devolve `null`. Local e descrição
 * acima do teto são omitidos, e o item sai sem eles; data, horários e
 * categoria fora do formato do CHECK (`FORMATO_DO_CAMPO`) também.
 */
function copiarItem(campos: CamposDoItem, roteiro: EscolhaDoRoteiro): ItemDoPost | null {
  const title = texto(campos.title, MAXIMO_TITULO_ITEM)
  if (title === undefined) return null
  const copia: ItemDoPost = { title }

  const atribuir = (chave: Exclude<keyof ItemDoPost, "title">) => {
    const valor = texto(campos[chave], TETO_DO_CAMPO[chave])
    if (valor === undefined) return
    const formato = FORMATO_DO_CAMPO[chave]
    if (formato && !formato(valor)) return
    copia[chave] = valor
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

/** A legenda limpa, ou `null` (vazia, só espaços ou só caracteres invisíveis). */
function legenda(valor: unknown): string | null {
  return textoVisivel(valor) ?? null
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
 * - `titulo` escolhido (já limpo pelo schema) vira o título do post; ausente,
 *   nulo, vazio ou só com caracteres invisíveis, vale o da projeção.
 * - Título da viagem (quando é ele que vale), destino e datas fora dos CHECKs
 *   de `posts` lançam `ViagemForaDoPost` (400 com `codigo`): esses não
 *   têm como ser omitidos, e o CHECK daria 500.
 * - O endereço `"google"` copia o `address` da projeção; vazio ou nulo, o
 *   lugar sai sem endereço.
 * - Item com título acima de `MAXIMO_TITULO_ITEM` fica fora; local e descrição
 *   acima dos tetos ficam fora do item.
 * - Saem no máximo `MAXIMO_ITENS_POST` itens (os primeiros, na ordem da
 *   projeção): o CHECK de `items` recusa mais que isso, e a publicação daria 500.
 * - Todo texto sai sem os espaços das pontas, e campo vazio é omitido.
 * - `marcados` não entra na cópia: as marcações moram em `post_tags`.
 */
export function montarPost(
  projecao: ProjecaoComLugares,
  pedido: Pick<PedidoPost, "legenda" | "roteiro" | "lugares"> & { titulo?: PedidoPost["titulo"] },
): CopiaDoPost {
  const { roteiro, lugares } = pedido

  const escolhidos = new Map<string, EnderecoDoLugar>()
  for (const lugar of lugares ?? []) escolhidos.set(lugar.id.toLowerCase(), lugar.endereco)

  const title = tituloDoPost(pedido.titulo, projecao.title)
  const destination = destinoDoPost(projecao.destination)
  const { start_date, end_date } = datasDoPost(projecao.start_date, projecao.end_date)

  return {
    title,
    destination,
    start_date,
    end_date,
    caption: legenda(pedido.legenda),
    items: roteiro
      ? projecao.itens.flatMap((item) => copiarItem(item, roteiro) ?? []).slice(0, MAXIMO_ITENS_POST)
      : [],
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

type LinhaDoPost = Omit<PostDoAutor, "items" | "places" | "caption" | "photos"> & {
  caption: unknown
  items: unknown
  places: unknown
  photos: unknown
}

/** Os caminhos gravados, só os que são texto não vazio, na ordem. */
export function fotosGravadas(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((c): c is string => typeof c === "string" && c !== "") : []
}

/** A cópia da viagem como o `PostVisto` a leva. */
export type ViagemDoPost = {
  title: string
  destination: string
  start_date: string
  end_date: string
  items: ItemDoPost[]
  places: LugarDoPost[]
}

/**
 * A cópia da viagem de uma linha de `posts`, pela mesma lista branca da
 * gravação, ou `null` no post sem viagem. O CHECK `posts_viagem_coerente`
 * garante que os quatro campos vêm juntos; faltando um (linha fora do CHECK),
 * também é `null`, e o post aparece como post de fotos.
 */
export function viagemDaLinha(linha: {
  title?: unknown
  destination?: unknown
  start_date?: unknown
  end_date?: unknown
  items?: unknown
  places?: unknown
}): ViagemDoPost | null {
  const { title, destination, start_date, end_date } = linha
  if (
    typeof title !== "string" ||
    typeof destination !== "string" ||
    typeof start_date !== "string" ||
    typeof end_date !== "string"
  ) {
    return null
  }
  return {
    title,
    destination,
    start_date,
    end_date,
    items: gravados(linha.items, (campos) => copiarItem(campos, TODO_O_ROTEIRO)),
    places: gravados(linha.places, lugarGravado),
  }
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
    photos: fotosGravadas(linha.photos),
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

  const { data, error } = await supabase.from("posts").select(COLUNAS_POST).eq("id", postId).maybeSingle()
  if (error) throw erroDoBanco(error, "ler a publicação")
  return data ? paraPost(data as LinhaDoPost) : null
}

/**
 * Grava o post. Campo a campo, e só nas colunas do grant de INSERT: sem
 * `photos` (o post de viagem nasce sem foto, e as fotos só entram pela rota
 * delas, depois de regeradas), sem `id` e sem datas de criação (defaults do
 * banco).
 */
export async function publicar(
  supabase: ClienteDaSessao,
  { tripId, autorId, copia }: { tripId: string; autorId: string; copia: CopiaDoPost },
): Promise<PostDoAutor> {
  const { data, error } = await supabase
    .from("posts")
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
 * "Atualizar publicação": copia a viagem de novo. Só o conteúdo muda; fotos,
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
    .from("posts")
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

/** O literal de array do Postgres para a condição da troca; só caminhos no formato do bucket. */
function literalDeFotos(fotos: readonly string[]): string {
  if (fotos.some((caminho) => !FORMATO_CAMINHO.test(caminho))) {
    throw new Error("[post da viagem] caminho de foto fora do formato")
  }
  return `{${fotos.join(",")}}`
}

/**
 * Troca as fotos do post (todas, na ordem; `[]` tira todas) e devolve as
 * anteriores, para a rota apagar do bucket as que saíram. `null` quando o post
 * não existe ou não é da sessão.
 *
 * Como `trocarAvatar` (app/api/social/perfil/foto): lê as fotos atuais e só
 * troca se elas ainda forem as lidas. Duas abas trocando ao mesmo tempo não
 * apagam as mesmas fotos deixando as novas de uma delas órfãs: a segunda não
 * acha a linha e recebe 409. Nesse 409 a rota apaga o que acabou de enviar.
 *
 * Os caminhos não são conferidos aqui além do formato: quem os monta é
 * `enviarFotos` (lib/social/capa.ts), e o CHECK `posts_photos_check` exige a
 * pasta do autor.
 */
export async function definirFotos(
  supabase: ClienteDaSessao,
  postId: string,
  fotos: readonly string[],
): Promise<{ fotosAnteriores: string[] } | null> {
  const atual = await supabase.from("posts").select("photos").eq("id", postId).maybeSingle()
  if (atual.error) throw erroDoBanco(atual.error, "trocar as fotos")
  if (!atual.data) return null
  const fotosAnteriores = fotosGravadas((atual.data as { photos: unknown }).photos)

  const { data, error } = await supabase
    .from("posts")
    .update({ photos: [...fotos] })
    .eq("id", postId)
    .eq("photos", literalDeFotos(fotosAnteriores))
    .select("id")
    .maybeSingle()

  if (error) throw erroDoBanco(error, "trocar as fotos")
  if (!data) throw new ErroHttp(409, "As fotos foram alteradas em outra aba. Recarregue a página e tente de novo.")
  return { fotosAnteriores }
}

/**
 * Despublica: apaga o post e devolve as fotos que ele tinha, para a rota
 * apagar os arquivos do bucket. `null` quando nada foi apagado (o post não
 * existe ou não é da sessão). Funciona para quem já saiu da viagem: a policy
 * de DELETE só exige ser o autor. As marcas saem junto, em cascata.
 */
export async function despublicar(
  supabase: ClienteDaSessao,
  postId: string,
): Promise<{ fotosAnteriores: string[] } | null> {
  const { data, error } = await supabase.from("posts").delete().eq("id", postId).select("photos").maybeSingle()

  if (error) throw erroDoBanco(error, "despublicar")
  if (!data) return null
  return { fotosAnteriores: fotosGravadas((data as { photos: unknown }).photos) }
}
