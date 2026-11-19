import type { SupabaseClient } from "@supabase/supabase-js"
import { naoEncontrado, semPermissao } from "@/lib/http"
import { assinarAvatares, type ClienteDeServico } from "./avatar"
import { assinarFotos } from "./capa"
import { fotosGravadas } from "./posts"
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
 *   do banco, a mesma das listas da rede; fora dela, 403 sem listar nada.
 *   **Essa regra vale só nesta rota, e não na RLS** (decisão de 18/11, "igual
 *   ao Instagram"): a marca é visível a quem vê o post, e a policy de SELECT de
 *   `post_tags` deixa quem enxerga o post ler as marcas dele pela Data API,
 *   inclusive a de uma pessoa com perfil privado que essa sessão não segue;
 * - **ser marcado não abre o post** (opção 2, como no Instagram). Cada post
 *   segue a RLS de `posts` (`pode_ver_rede(author_id)`): se quem vê
 *   enxerga o post, o cartão leva o resumo; se não enxerga e é a própria pessoa
 *   marcada, o cartão leva só quem a marcou; para os outros, o cartão não sai.
 *
 * Tudo com o cliente da sessão, numa consulta: `post_tags` com o autor
 * (`profiles`, pela FK `author_id`) e o post (`posts`, pela FK `post_id`)
 * embutidos. O embed do post passa pela RLS dele: post que a sessão não
 * enxerga volta `null`, e é isso que separa os dois cartões. A RLS de
 * `post_tags` (migration 20261116234030) esconde de terceiros só a marca de
 * post que eles não enxergam, e o filtro daqui repete essa regra. Ela não é a
 * segunda linha do "perfil privado só abre a seguidores": essa fica só no
 * `podeVerRede` desta lib. A chave de serviço só assina as fotos.
 *
 * O que sai, campo a campo: o id do post (para remover a marca e linkar ao
 * detalhe, /feed/<post_id>), quando a pessoa foi marcada, o autor pelo
 * username (nunca o `author_id`), e do post só título, destino e datas (nulos
 * no post sem viagem, 18/11 noite), legenda e a 1ª foto assinada (`foto`; nula
 * só no post de viagem sem fotos, que a tela desenha com o grafismo). Nunca
 * `trip_id` (nem é legível), caminho do Storage, itinerário, lugares, e-mail ou
 * outros marcados.
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
  /** Os quatro da viagem: nulos no post sem viagem. */
  title: string | null
  destination: string | null
  start_date: string | null
  end_date: string | null
  caption: string | null
  /** A 1ª foto assinada; nula só no post de viagem sem fotos (ou se a assinatura falhar). */
  foto: string | null
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
  "post:posts!post_tags_post_id_fkey(title, destination, start_date, end_date, caption, photos)"

type LinhaDoAutor = { id: string; username: string | null; full_name: string | null; avatar_url: string | null }
type LinhaDoPost = {
  title: string | null
  destination: string | null
  start_date: string | null
  end_date: string | null
  caption: unknown
  photos: unknown
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

  const primeiras = linhas.map(({ post }) => (post ? (fotosGravadas(post.photos)[0] ?? null) : null))
  const [fotos, links] = await Promise.all([
    assinarAvatares(
      criarAdmin,
      linhas.map(({ autor }) => ({ id: autor.id, avatar_url: autor.avatar_url })),
    ),
    assinarFotos(criarAdmin, primeiras),
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
            foto: (primeiras[i] && links.get(primeiras[i]!)) || null,
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
