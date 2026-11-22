import type { SupabaseClient } from "@supabase/supabase-js"
import type { ClienteDeServico } from "./avatar"
import { juntarResultados } from "./busca"
import { COLUNAS_PERFIL, comFoto, type PerfilLido, type PessoaNoPost } from "./marcacoes"

/**
 * A busca de pessoas para **marcar** num post ("Marcar pessoas", RF09.13).
 *
 * Reaproveita a busca da aba Rede social (RF09.10): o termo passa pelo mesmo
 * schema (`buscaPessoasSchema`, lib/schemas/busca.ts: NFC, sem `@`, 2 a 60
 * caracteres, só letras, números, espaço e ' ’ . _ -) e o resultado é juntado
 * e ordenado por `juntarResultados` (lib/social/busca.ts: o username exato
 * primeiro). A rota de lá (GET /api/social/perfis) não serve aqui porque não
 * devolve o `id`, e marcar pede o id; ela também busca "contém", e marcar
 * busca o **começo** do username ou do nome (de qualquer palavra do nome),
 * como no Instagram.
 *
 * Ficam de fora a própria sessão e as contas sem username (não há página para
 * onde a marca leve, e o banco recusaria a marca). Até `LIMITE_PESSOAS`.
 *
 * O termo vai como valor de `.ilike()`, uma consulta por critério, e não
 * montado num `.or(...)`: lá dentro, vírgula e parêntese virariam parte do
 * filtro do PostgREST. `%` e `*` nunca chegam (o schema os recusa); o `_`,
 * que existe em username, é escapado.
 *
 * @RF09.13 marcar pessoas · @RF09.10 busca de pessoas
 */

type ClienteDaSessao = Pick<SupabaseClient, "from">

/** Quantas pessoas a busca para marcar devolve. */
export const LIMITE_PESSOAS = 10

/** O `_` do username é procurado como `_`, e não como curinga. */
const escapar = (termo: string) => termo.replace(/_/g, "\\_")

/** "Começa com o termo". */
export const padraoComeco = (termo: string) => `${escapar(termo)}%`
/** "Alguma palavra (depois da primeira) começa com o termo". */
export const padraoPalavra = (termo: string) => `% ${escapar(termo)}%`

/**
 * As pessoas que a sessão pode marcar cujo username ou nome começa com
 * `termo` (já normalizado pelo schema), com a foto assinada.
 */
export async function buscarPessoasParaMarcar(
  supabase: ClienteDaSessao,
  criarAdmin: () => ClienteDeServico,
  termo: string,
  sessaoId: string,
): Promise<PessoaNoPost[]> {
  const outrasPessoas = () =>
    supabase.from("profiles").select(COLUNAS_PERFIL).neq("id", sessaoId).not("username", "is", null)
  const emOrdemDeNome = { ascending: true, nullsFirst: true }

  const consultas = await Promise.all([
    outrasPessoas().ilike("username", padraoComeco(termo.toLowerCase())).order("username").limit(LIMITE_PESSOAS),
    outrasPessoas().ilike("full_name", padraoComeco(termo)).order("full_name", emOrdemDeNome).limit(LIMITE_PESSOAS),
    outrasPessoas().ilike("full_name", padraoPalavra(termo)).order("full_name", emOrdemDeNome).limit(LIMITE_PESSOAS),
  ])
  for (const { error } of consultas) {
    if (error) throw new Error("[busca para marcar] não foi possível buscar", { cause: error })
  }

  const encontradas = juntarResultados(
    consultas.map(({ data }) => ((data ?? []) as PerfilLido[]).filter((p): p is PerfilLido & { username: string } => !!p.username)),
    termo,
    LIMITE_PESSOAS,
  )
  return comFoto(criarAdmin, encontradas)
}
