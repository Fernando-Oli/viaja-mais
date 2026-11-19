import type { SupabaseClient } from "@supabase/supabase-js"
import { ErroHttp, naoEncontrado, semPermissao } from "@/lib/http"
import { limparTextoLivre } from "@/lib/schemas/post"
import { assinarAvatares, type ClienteDeServico } from "./avatar"
import { assinarFotos } from "./capa"
import { perfisMarcadosDosPosts, type PerfilLido, type PessoaNoPost } from "./marcacoes"
import { buscarPerfilPorUsername } from "./perfil-visto"
import { fotosGravadas, viagemDaLinha, type ViagemDoPost } from "./posts"
import { podeVerRede } from "./rede"

/**
 * O post da rede social, no modelo do Instagram (decisões do Micael, 18/11,
 * noite): **1 a 3 fotos** em carrossel, na ordem escolhida, **legenda
 * opcional** e **pessoas marcadas**. Uma viagem publicada é um post que, além
 * disso, leva a cópia dela (lib/social/posts.ts), e é o único que pode ter 0
 * fotos (a tela mostra o grafismo `CapaViagem`).
 *
 * **O formato de resposta é um só, o `PostVisto`, montado só aqui**
 * (`montarPostsVistos`): o detalhe, o criar, o editar, a rota do post de
 * viagem — todos devolvem o mesmo objeto, campo a campo. Nunca sai `trip_id`
 * (nem é legível), `author_id`, caminho do Storage, e-mail, `budget`, `notes`
 * nem coordenadas: as fotos vão como URL assinada (10 min, reaproveitada por 5,
 * lib/social/capa.ts), e a autora e os marcados pelo username, com a foto
 * assinada (lib/social/avatar.ts). Numa resposta com vários posts, as fotos de
 * todos vão numa chamada ao Storage, e as fotos de perfil em outra.
 *
 * **Quem vê.** Tudo com o cliente da sessão: a policy de SELECT de `posts`
 * (`pode_ver_rede(author_id)`) esconde o post de perfil privado que a sessão
 * não segue. A autorização explícita repete a regra no servidor: `postVisto` e
 * `exigirPostDaAutora` perguntam a `pode_ver_rede` (`podeVerRede`) antes de
 * devolver o post de outra pessoa, e a grade (`postsDoPerfil`) pergunta antes
 * de listar. Post que não existe e post que a sessão não pode ver respondem
 * igual (404): a resposta não revela que ele existe.
 *
 * **Quem mexe.** Só a autora edita e exclui (`exigirPostDaAutora`: 404 se ela
 * não vê, 403 se vê e não é a autora). A escrita filtra também por
 * `author_id`, e a policy de UPDATE/DELETE (`auth.uid() = author_id`) é a
 * segunda linha.
 *
 * Erro do banco nunca sai cru: 42501 vira 403, e o resto lança um `Error` com
 * o original em `cause`, que `respostaDeErro` torna o 500 genérico.
 *
 * @RF09.15 post com fotos · @RF09.16 aba Publicações · @RF09.17 detalhe do post
 */

type ClienteDaSessao = Pick<SupabaseClient, "from" | "rpc">

export type { PessoaNoPost, ViagemDoPost }

/** A autora como o post a mostra: o link do perfil sai do username. */
export type AutorDoPost = { username: string; full_name: string | null; avatar_url: string | null }

/** O post como toda rota o devolve. */
export type PostVisto = {
  id: string
  autor: AutorDoPost
  caption: string | null
  /** URLs assinadas, na ordem do carrossel; `[]` só no post de viagem (ou se a assinatura falhar). */
  fotos: string[]
  marcados: PessoaNoPost[]
  created_at: string
  updated_at: string
  /** A sessão é a autora: só aí a tela oferece editar e excluir. */
  proprio: boolean
  viagem: ViagemDoPost | null
}

/** Um quadrado da grade "Publicações". */
export type QuadradoDaGrade = {
  id: string
  /** A 1ª foto assinada, ou nula (post de viagem sem foto: a tela desenha o grafismo com `semente = id`). */
  foto: string | null
  quantidade_fotos: number
  /** O texto do `alt`: a legenda, ou o título da viagem, ou "Publicação de @username". */
  descricao: string
}

export type PaginaDaGrade = { posts: QuadradoDaGrade[]; proximo: string | null }

/** Quantos posts cada página da grade traz. */
export const POR_PAGINA_GRADE = 12

/**
 * As colunas do post e a autora embutida (FK `posts_author_id_fkey`). Do grant
 * de SELECT: sem `trip_id`. `author_id` é lido para a autorização e para
 * `proprio`, e não sai.
 */
export const COLUNAS_POST_VISTO =
  "id, author_id, caption, photos, title, destination, start_date, end_date, items, places, created_at, updated_at, " +
  "autor:profiles!posts_author_id_fkey(id, username, full_name, avatar_url)"

const COLUNAS_GRADE = "id, caption, photos, title, created_at"

const SEM_PRIVILEGIO = "42501"

/** A linha de `posts` com a autora, como o PostgREST a devolve. */
export type LinhaDoPostVisto = {
  id: string
  author_id: string
  caption: unknown
  photos: unknown
  title: unknown
  destination: unknown
  start_date: unknown
  end_date: unknown
  items: unknown
  places: unknown
  created_at: string
  updated_at: string
  autor: PerfilLido | null
}

type LinhaDaGrade = { id: string; caption: unknown; photos: unknown; title: unknown; created_at: string }

/** "Publicação" é feminino: `naoEncontrado` diria "não encontrado". */
export const postNaoEncontrado = () => new ErroHttp(404, "Publicação não encontrada")

function erroDoBanco(error: { code?: string }, acao: string): Error {
  if (error.code === SEM_PRIVILEGIO) return new ErroHttp(403, `Sem permissão para ${acao}`)
  return new Error(`[post] não foi possível ${acao}`, { cause: error })
}

/** A legenda que vale mostrar, ou nula (vazia ou só invisíveis). */
function legenda(valor: unknown): string | null {
  return typeof valor === "string" ? limparTextoLivre(valor) : null
}

/**
 * Monta o `PostVisto` de cada linha, na ordem recebida — **o único lugar onde
 * ele nasce**. Linha sem autora legível com username fica de fora (quem publica
 * precisa de um, e ele não volta a nulo; é defesa). Lê as marcas de todos os
 * posts numa consulta e assina as fotos e os avatares em lote.
 */
export async function montarPostsVistos(
  supabase: ClienteDaSessao,
  criarAdmin: () => ClienteDeServico,
  linhas: readonly LinhaDoPostVisto[],
  sessaoId: string,
): Promise<PostVisto[]> {
  const validas = linhas.filter(
    (linha): linha is LinhaDoPostVisto & { autor: PerfilLido & { username: string } } => !!linha.autor?.username,
  )
  if (validas.length === 0) return []

  const marcadosPorPost = await perfisMarcadosDosPosts(
    supabase,
    validas.map((linha) => linha.id),
  )
  const fotosPorPost = validas.map((linha) => fotosGravadas(linha.photos))

  // Autoras e marcados, sem repetir, para uma chamada só ao Storage.
  const pessoas = new Map<string, PerfilLido>()
  for (const linha of validas) {
    pessoas.set(linha.autor.id, linha.autor)
    for (const perfil of marcadosPorPost.get(linha.id) ?? []) pessoas.set(perfil.id, perfil)
  }
  const listaDePessoas = [...pessoas.values()]

  const [links, avatares] = await Promise.all([
    assinarFotos(criarAdmin, fotosPorPost.flat()),
    assinarAvatares(criarAdmin, listaDePessoas),
  ])
  const avatarDe = new Map(listaDePessoas.map((perfil, i) => [perfil.id, avatares[i]]))

  return validas.map((linha, i) => ({
    id: linha.id,
    autor: {
      username: linha.autor.username,
      full_name: linha.autor.full_name,
      avatar_url: avatarDe.get(linha.autor.id) ?? null,
    },
    caption: legenda(linha.caption),
    fotos: fotosPorPost[i].flatMap((caminho) => links.get(caminho) ?? []),
    marcados: (marcadosPorPost.get(linha.id) ?? []).flatMap((perfil) =>
      perfil.username
        ? [
            {
              id: perfil.id,
              username: perfil.username,
              full_name: perfil.full_name,
              avatar_url: avatarDe.get(perfil.id) ?? null,
            },
          ]
        : [],
    ),
    created_at: linha.created_at,
    updated_at: linha.updated_at,
    proprio: linha.author_id === sessaoId,
    viagem: viagemDaLinha(linha),
  }))
}

/** A linha do post, se a RLS deixa a sessão vê-la; senão, `null`. */
export async function lerPost(supabase: ClienteDaSessao, postId: string): Promise<LinhaDoPostVisto | null> {
  const { data, error } = await supabase.from("posts").select(COLUNAS_POST_VISTO).eq("id", postId).maybeSingle()
  if (error) throw erroDoBanco(error, "ler a publicação")
  return (data as unknown as LinhaDoPostVisto | null) ?? null
}

/**
 * A sessão pode ver o post desta linha: é a autora, ou `pode_ver_rede` diz
 * que vê a rede dela. É a autorização explícita sobre a policy de SELECT.
 */
async function podeVer(supabase: ClienteDaSessao, linha: Pick<LinhaDoPostVisto, "author_id">, sessaoId: string) {
  return linha.author_id === sessaoId || (await podeVerRede(supabase, linha.author_id))
}

/** O post como a sessão o vê, ou `null` quando ele não existe ou ela não pode vê-lo. */
export async function postVisto(
  supabase: ClienteDaSessao,
  criarAdmin: () => ClienteDeServico,
  postId: string,
  sessaoId: string,
): Promise<PostVisto | null> {
  const linha = await lerPost(supabase, postId)
  if (!linha || !(await podeVer(supabase, linha, sessaoId))) return null
  const [post] = await montarPostsVistos(supabase, criarAdmin, [linha], sessaoId)
  return post ?? null
}

/**
 * O post, se a sessão for a autora. 404 quando ele não existe ou ela não pode
 * vê-lo (não revela que existe); 403 quando ela o vê e não é a autora.
 */
export async function exigirPostDaAutora(
  supabase: ClienteDaSessao,
  postId: string,
  sessaoId: string,
): Promise<LinhaDoPostVisto> {
  const linha = await lerPost(supabase, postId)
  if (!linha || !(await podeVer(supabase, linha, sessaoId))) throw postNaoEncontrado()
  if (linha.author_id !== sessaoId) throw semPermissao("esta publicação")
  return linha
}

/**
 * Grava o post sem viagem e devolve o id. Campo a campo, só nas colunas do
 * grant de INSERT: `author_id` (a policy exige a sessão), `caption` e
 * `photos` (os caminhos que `enviarFotos` acabou de enviar, na ordem). Sem
 * `trip_id` nem os campos da viagem (nulos por padrão: o CHECK de coerência
 * exige isso do post sem viagem).
 */
export async function criarPost(
  supabase: ClienteDaSessao,
  { autorId, fotos, legenda }: { autorId: string; fotos: readonly string[]; legenda: string | null },
): Promise<string> {
  const { data, error } = await supabase
    .from("posts")
    .insert({ author_id: autorId, caption: legenda, photos: [...fotos] })
    .select("id")
    .single()
  if (error) throw erroDoBanco(error, "publicar")
  return (data as { id: string }).id
}

/** Troca a legenda (ou a tira, com `null`). Devolve se o post da autora existia. */
export async function atualizarLegenda(
  supabase: ClienteDaSessao,
  postId: string,
  autorId: string,
  legendaNova: string | null,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("posts")
    .update({ caption: legendaNova })
    .eq("id", postId)
    .eq("author_id", autorId)
    .select("id")
    .maybeSingle()
  if (error) throw erroDoBanco(error, "editar a publicação")
  return !!data
}

/**
 * Apaga o post da autora e devolve as fotos dele, para a rota apagar os
 * arquivos. `null` quando nada foi apagado. Filtra por `author_id` além do id:
 * a rota já conferiu a autoria, e o filtro e a policy de DELETE repetem. As
 * marcas e as recusas por post saem em cascata.
 */
export async function excluirPost(
  supabase: ClienteDaSessao,
  postId: string,
  autorId: string,
): Promise<{ fotos: string[] } | null> {
  const { data, error } = await supabase
    .from("posts")
    .delete()
    .eq("id", postId)
    .eq("author_id", autorId)
    .select("photos")
    .maybeSingle()
  if (error) throw erroDoBanco(error, "excluir a publicação")
  if (!data) return null
  return { fotos: fotosGravadas((data as { photos: unknown }).photos) }
}

// ---------------------------------------------------------------------------
// A grade "Publicações"
// ---------------------------------------------------------------------------

/** O ponto da grade de onde a próxima página continua: o último post mostrado. */
export type CursorDaGrade = { created_at: string; id: string }

const FORMATO_MOMENTO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/
const FORMATO_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * @RF09.16 O momento do cursor existe no calendário, e não só no formato:
 * `Date.parse` não pode dar `NaN` (mês 13, dia 32, hora 25) e o valor tem de
 * voltar igual por `toISOString` (o 30 de fevereiro, que o `Date.parse` aceita
 * e empurra para março). A volta é na hora local do próprio fuso do texto, e
 * compara só até o milissegundo: o banco devolve microssegundos, que o `Date`
 * não guarda. Sem isso, a data impossível chegava ao Postgres e voltava 500.
 */
function momentoExiste(momento: string): boolean {
  const instante = Date.parse(momento)
  if (Number.isNaN(instante)) return false
  const fuso = /([+-])(\d{2}):(\d{2})$/.exec(momento)
  const minutosDoFuso = fuso ? (fuso[1] === "-" ? -1 : 1) * (Number(fuso[2]) * 60 + Number(fuso[3])) : 0
  const volta = new Date(instante + minutosDoFuso * 60_000).toISOString()
  const fracao = /\.(\d{1,6})/.exec(momento)?.[1] ?? ""
  return volta.slice(0, 19) === momento.slice(0, 19) && volta.slice(20, 23) === fracao.padEnd(3, "0").slice(0, 3)
}

/** O cursor opaco: o momento e o id do último post, em base64url. */
export function codificarCursor(cursor: CursorDaGrade): string {
  return Buffer.from(JSON.stringify([cursor.created_at, cursor.id]), "utf8").toString("base64url")
}

/**
 * O cursor recebido, conferido: base64url de `[momento, uuid]`, com o momento
 * no formato do `timestamptz` que o PostgREST devolve. Qualquer outra coisa é
 * `null` (a rota responde 400): o valor vai a um filtro, e não pode ser texto
 * livre.
 */
export function lerCursor(texto: string): CursorDaGrade | null {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(texto)) return null
  let valor: unknown
  try {
    valor = JSON.parse(Buffer.from(texto, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (!Array.isArray(valor) || valor.length !== 2) return null
  const [momento, id] = valor
  if (typeof momento !== "string" || !FORMATO_MOMENTO.test(momento) || !momentoExiste(momento)) return null
  if (typeof id !== "string" || !FORMATO_UUID.test(id)) return null
  return { created_at: momento, id }
}

/** O texto do `alt` do quadrado. */
function descricaoDoQuadrado(linha: LinhaDaGrade, username: string): string {
  return legenda(linha.caption) ?? (typeof linha.title === "string" && linha.title.trim() !== "" ? linha.title : null) ?? `Publicação de @${username}`
}

/**
 * Uma página da grade "Publicações" de `username`, do mais recente ao mais
 * antigo (`created_at desc, id desc`), com `POR_PAGINA_GRADE` posts. Sem
 * distinguir post de viagem: a viagem só muda o `alt` (o título) e a falta de
 * foto (o grafismo).
 *
 * Lança 404 se ninguém usa o username e 403 se a sessão não pode ver a rede
 * do perfil (perfil privado que ela não segue), como a aba Marcações. O
 * username já chega no formato (a rota valida).
 *
 * A paginação é por chave, como nas listas da rede (lib/social/rede.ts): com
 * cursor, primeiro os empatados no mesmo momento com id menor, depois os mais
 * antigos — juntos, a mesma ordem da primeira página.
 */
export async function postsDoPerfil(
  supabase: ClienteDaSessao,
  criarAdmin: () => ClienteDeServico,
  username: string,
  sessaoId: string,
  cursor: CursorDaGrade | null,
): Promise<PaginaDaGrade> {
  const perfil = await buscarPerfilPorUsername(supabase, username)
  if (!perfil) throw naoEncontrado("Perfil")
  if (perfil.id !== sessaoId && !(await podeVerRede(supabase, perfil.id))) {
    throw semPermissao("as publicações deste perfil")
  }

  const pedido = POR_PAGINA_GRADE + 1
  const doPerfil = () => supabase.from("posts").select(COLUNAS_GRADE).eq("author_id", perfil.id)
  const lerPagina = async (consulta: PromiseLike<{ data: unknown; error: { code?: string } | null }>) => {
    const { data, error } = await consulta
    if (error) throw erroDoBanco(error, "ler as publicações")
    return (data ?? []) as LinhaDaGrade[]
  }

  let linhas: LinhaDaGrade[]
  if (!cursor) {
    linhas = await lerPagina(
      doPerfil().order("created_at", { ascending: false }).order("id", { ascending: false }).limit(pedido),
    )
  } else {
    linhas = await lerPagina(
      doPerfil().eq("created_at", cursor.created_at).lt("id", cursor.id).order("id", { ascending: false }).limit(pedido),
    )
    if (linhas.length < pedido) {
      const antigos = await lerPagina(
        doPerfil()
          .lt("created_at", cursor.created_at)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(pedido - linhas.length),
      )
      linhas = [...linhas, ...antigos]
    }
  }

  const pagina = linhas.slice(0, POR_PAGINA_GRADE)
  const primeiras = pagina.map((linha) => fotosGravadas(linha.photos)[0] ?? null)
  const links = await assinarFotos(criarAdmin, primeiras)
  const ultimo = pagina[pagina.length - 1]

  return {
    posts: pagina.map((linha, i) => ({
      id: linha.id,
      foto: (primeiras[i] && links.get(primeiras[i])) || null,
      quantidade_fotos: fotosGravadas(linha.photos).length,
      descricao: descricaoDoQuadrado(linha, perfil.username),
    })),
    proximo: linhas.length > POR_PAGINA_GRADE ? codificarCursor({ created_at: ultimo.created_at, id: ultimo.id }) : null,
  }
}
