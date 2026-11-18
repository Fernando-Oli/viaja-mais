import type { SupabaseClient } from "@supabase/supabase-js"
import { naoEncontrado, semPermissao } from "@/lib/http"
import { assinarAvatares, type ClienteDeServico } from "./avatar"
import { assinarCapas } from "./capa"
import { buscarPerfilPorUsername } from "./perfil-visto"
import { podeVerRede } from "./rede"

/**
 * A aba "Marcações" do perfil (S06-M-publicar-viagem, RF09.14): os posts em que
 * uma pessoa foi marcada, do mais recente ao mais antigo, e a pessoa marcada
 * removendo a própria marca.
 *
 * Decisões do Micael (16/11 e 18/11, docs/plans/S06-M-publicar-viagem.md):
 * - a aba segue a visibilidade do perfil da pessoa MARCADA: perfil privado, só
 *   ela e os seguidores aceitos a veem. Quem decide é a função `pode_ver_rede`
 *   do banco, a mesma das listas da rede; fora dela, 403 sem listar nada;
 * - **ser marcado não abre o post** (opção 2, como no Instagram). Cada post
 *   segue a RLS de `trip_posts` (`pode_ver_rede(author_id)`): se quem vê
 *   enxerga o post, o cartão leva o resumo; se não enxerga e é a própria pessoa
 *   marcada, o cartão leva só quem a marcou; para os outros, o cartão não sai.
 *
 * Tudo com o cliente da sessão, numa consulta: `post_tags` com o autor
 * (`profiles`, pela FK `author_id`) e o post (`trip_posts`, pela FK `post_id`)
 * embutidos. O embed do post passa pela RLS dele: post que a sessão não
 * enxerga volta `null`, e é isso que separa os dois cartões. A RLS de
 * `post_tags` (migration 20261116234030) já esconde de terceiros a marca de
 * post que eles não enxergam; o filtro daqui repete a regra, e é ele que a
 * resposta segue. A chave de serviço só assina fotos e capas.
 *
 * O que sai, campo a campo: o id do post (para remover a marca), quando a
 * pessoa foi marcada, o autor pelo username (nunca o `author_id`), e do post só
 * título, destino, datas, legenda e a capa assinada. Nunca `trip_id` (nem é
 * legível), `cover_path` cru, itinerário, lugares, e-mail ou outros marcados.
 *
 * Sem paginação: a aba traz as `LIMITE_MARCACOES` mais recentes.
 *
 * @RF09.14 aba Marcações e remover a própria marca
 */

type ClienteDaSessao = Pick<SupabaseClient, "from" | "rpc">

/** Quantas marcações a aba traz, das mais recentes. */
export const LIMITE_MARCACOES = 50

/** Do autor, só o que o cartão mostra; o link do perfil sai do username. */
export type AutorDaMarcacao = {
  username: string
  full_name: string | null
  avatar_url: string | null
}

/** O resumo do post que o cartão mostra, quando quem vê enxerga o post. */
export type ResumoDoPost = {
  title: string
  destination: string
  start_date: string
  end_date: string
  caption: string | null
  cover_url: string | null
}

/**
 * Uma marcação na aba. `post` nulo: quem vê é a própria pessoa marcada e não
 * enxerga o post (autor privado que ela não segue): o cartão mostra só o autor.
 */
export type Marcacao = {
  post_id: string
  marcado_em: string
  autor: AutorDaMarcacao
  post: ResumoDoPost | null
}

export type AbaMarcacoes = {
  marcacoes: Marcacao[]
  /** Se a aba é da própria sessão: só aí a tela oferece remover. */
  proprio: boolean
}

/**
 * O post vem pela FK `post_tags_post_id_fkey`, com as colunas do grant de
 * SELECT (que não tem `trip_id`); o autor, pela `post_tags_author_id_fkey`.
 */
export const COLUNAS_MARCACAO =
  "post_id, created_at, " +
  "autor:profiles!post_tags_author_id_fkey(id, username, full_name, avatar_url), " +
  "post:trip_posts!post_tags_post_id_fkey(title, destination, start_date, end_date, caption, cover_path)"

type LinhaDoAutor = { id: string; username: string | null; full_name: string | null; avatar_url: string | null }
type LinhaDoPost = {
  title: string
  destination: string
  start_date: string
  end_date: string
  caption: unknown
  cover_path: string | null
}
type LinhaDaMarcacao = {
  post_id: string
  created_at: string
  autor: LinhaDoAutor | null
  post: LinhaDoPost | null
}

/** Legenda que vale mostrar: texto com algo além de espaços; o resto vira nulo. */
function legenda(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() !== "" ? valor : null
}

/**
 * As marcações de `username`, como a sessão `sessaoId` pode vê-las.
 *
 * Lança `naoEncontrado` (404) se ninguém usa o username, e `semPermissao`
 * (403) se a sessão não pode ver a rede do perfil. O username já chega no
 * formato (a rota valida). Erro do banco lança um `Error` comum, com o
 * original em `cause`: `respostaDeErro` o transforma no 500 genérico.
 */
export async function marcacoesDoPerfil(
  supabase: ClienteDaSessao,
  username: string,
  sessaoId: string,
  criarAdmin: () => ClienteDeServico,
): Promise<AbaMarcacoes> {
  const perfil = await buscarPerfilPorUsername(supabase, username)
  if (!perfil) throw naoEncontrado("Perfil")
  if (!(await podeVerRede(supabase, perfil.id))) throw semPermissao("as marcações deste perfil")

  const proprio = perfil.id === sessaoId

  const { data, error } = await supabase
    .from("post_tags")
    .select(COLUNAS_MARCACAO)
    .eq("tagged_id", perfil.id)
    .order("created_at", { ascending: false })
    .order("post_id", { ascending: true })
    .limit(LIMITE_MARCACOES)
  if (error) throw new Error("[marcações] não foi possível ler as marcações", { cause: error })

  // O autor sempre tem username (quem publica precisa de um, e ele não volta a
  // nulo); a linha sem autor legível fica de fora, por defesa. Post invisível
  // só sai para a própria pessoa marcada.
  const linhas = ((data ?? []) as unknown as LinhaDaMarcacao[]).filter(
    (linha): linha is LinhaDaMarcacao & { autor: LinhaDoAutor & { username: string } } =>
      !!linha.autor?.username && (linha.post !== null || proprio),
  )

  const [fotos, capas] = await Promise.all([
    assinarAvatares(
      criarAdmin,
      linhas.map(({ autor }) => ({ id: autor.id, avatar_url: autor.avatar_url })),
    ),
    assinarCapas(
      criarAdmin,
      linhas.map(({ post }) => post?.cover_path ?? null),
    ),
  ])

  return {
    proprio,
    marcacoes: linhas.map((linha, i) => ({
      post_id: linha.post_id,
      marcado_em: linha.created_at,
      autor: {
        username: linha.autor.username,
        full_name: linha.autor.full_name,
        avatar_url: fotos[i],
      },
      post: linha.post
        ? {
            title: linha.post.title,
            destination: linha.post.destination,
            start_date: linha.post.start_date,
            end_date: linha.post.end_date,
            caption: legenda(linha.post.caption),
            cover_url: (linha.post.cover_path && capas.get(linha.post.cover_path)) || null,
          }
        : null,
    })),
  }
}

/**
 * Remove a marca da sessão no post. Sempre filtrada por `tagged_id = sessaoId`:
 * a policy de DELETE também deixa o AUTOR apagar as marcas do post, e sem o
 * filtro o autor que chamasse esta rota desmarcaria todo mundo. Devolve se
 * havia a marca (falso: nunca houve, já foi removida, ou o post não existe).
 */
export async function removerMinhaMarcacao(
  supabase: ClienteDaSessao,
  postId: string,
  sessaoId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("post_tags")
    .delete()
    .eq("post_id", postId)
    .eq("tagged_id", sessaoId)
    .select("post_id")
  if (error) throw new Error("[marcações] não foi possível remover a marcação", { cause: error })
  return (data?.length ?? 0) > 0
}
