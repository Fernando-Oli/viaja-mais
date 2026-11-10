import type { SupabaseClient } from "@supabase/supabase-js"
import { assinarAvatares } from "./avatar"

/**
 * A rede de um perfil (S05-M-listas): quem o segue e quem ele segue, as listas
 * que abrem pelos contadores do perfil, e remover um seguidor.
 *
 * Não há tabela própria: cada pessoa da lista é um vínculo `accepted` em
 * `follows`. Tudo com a sessão de quem vê. Quem decide se a rede é visível é a
 * função `pode_ver_rede` do banco (o próprio dono, quem segue com vínculo
 * aceito, ou perfil público), e a rota a chama antes de listar. A RLS de
 * `follows` é a segunda linha (migration 20261007105848). A chave de serviço só
 * assina as fotos.
 *
 * A paginação é por chave, sem expor `id`: a ordem é `created_at desc` e, no
 * empate, o username da outra pessoa; o cursor é o username da última pessoa já
 * mostrada (ver o plano, bloco 1).
 *
 * A resposta leva o que a tela mostra, campo a campo, sem o `id`.
 *
 * @RF09.6 listas de seguidores e de seguindo · @RF09.9 remover seguidor
 */

type ClienteDaSessao = Pick<SupabaseClient, "from" | "rpc">
type ClienteDeServico = Pick<SupabaseClient, "storage">

/** Quantas pessoas cada página traz. */
export const POR_PAGINA = 20

export type Lado = "seguidores" | "seguindo"

export type PessoaDaRede = {
  username: string
  full_name: string | null
  avatar_url: string | null
  is_public: boolean
}

type OutraPessoa = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  is_public: boolean
}

type Linha = { created_at: string; perfil: OutraPessoa }

/**
 * De que lado do vínculo está o dono da lista, e qual FK leva à outra pessoa.
 * Seguidores de X: X é o followee, e a outra pessoa é o follower. Seguindo: o
 * contrário. O `!inner` deixa o filtro de username valer para a linha inteira:
 * uma conta sem username (anterior ao social) não tem página e não aparece.
 */
const LADOS = {
  seguidores: {
    dono: "followee_id",
    colunas: "created_at, perfil:profiles!follows_follower_id_fkey!inner(id, username, full_name, avatar_url, is_public)",
  },
  seguindo: {
    dono: "follower_id",
    colunas: "created_at, perfil:profiles!follows_followee_id_fkey!inner(id, username, full_name, avatar_url, is_public)",
  },
} as const

/** Se quem está na sessão pode ver a rede do perfil: a mesma regra da RLS, pela função do banco. */
export async function podeVerRede(supabase: ClienteDaSessao, perfil: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("pode_ver_rede", { perfil })
  if (error) throw error
  return data === true
}

/** Os vínculos aceitos do lado pedido, com a outra pessoa embutida e com username. */
function vinculos(supabase: ClienteDaSessao, lado: Lado, dono: string) {
  const { dono: coluna, colunas } = LADOS[lado]
  return supabase
    .from("follows")
    .select(colunas)
    .eq(coluna, dono)
    .eq("status", "accepted")
    .not("perfil.username", "is", null)
}

/**
 * Uma página da lista. Sem cursor, a primeira; com cursor, a que vem depois da
 * pessoa do cursor. Devolve `null` quando o cursor não acha mais o vínculo
 * (a pessoa deixou a lista ou trocou de username): quem chama recomeça.
 */
export async function listarRede(
  supabase: ClienteDaSessao,
  criarAdmin: () => ClienteDeServico,
  dono: string,
  lado: Lado,
  cursor?: string,
): Promise<{ pessoas: PessoaDaRede[]; proximo: string | null } | null> {
  const pedido = POR_PAGINA + 1
  let linhas: Linha[]

  if (!cursor) {
    const { data, error } = await vinculos(supabase, lado, dono)
      .order("created_at", { ascending: false })
      .order("perfil(username)", { ascending: true })
      .limit(pedido)
    if (error) throw error
    linhas = data as unknown as Linha[]
  } else {
    const ancora = await vinculos(supabase, lado, dono).eq("perfil.username", cursor).maybeSingle()
    if (ancora.error) throw ancora.error
    if (!ancora.data) return null
    const momento = (ancora.data as unknown as Linha).created_at

    // Primeiro os empatados com o cursor (mesmo created_at, username depois do
    // dele); depois os mais antigos. Juntos, seguem a mesma ordem da primeira página.
    const empatados = await vinculos(supabase, lado, dono)
      .eq("created_at", momento)
      .gt("perfil.username", cursor)
      .order("perfil(username)", { ascending: true })
      .limit(pedido)
    if (empatados.error) throw empatados.error
    linhas = empatados.data as unknown as Linha[]

    if (linhas.length < pedido) {
      const antigos = await vinculos(supabase, lado, dono)
        .lt("created_at", momento)
        .order("created_at", { ascending: false })
        .order("perfil(username)", { ascending: true })
        .limit(pedido - linhas.length)
      if (antigos.error) throw antigos.error
      linhas = [...linhas, ...(antigos.data as unknown as Linha[])]
    }
  }

  const pagina = linhas.slice(0, POR_PAGINA).map(({ perfil }) => perfil)
  const fotos = await assinarAvatares(criarAdmin, pagina)
  return {
    pessoas: pagina.map((perfil, i) => ({
      username: perfil.username,
      full_name: perfil.full_name,
      avatar_url: fotos[i],
      is_public: perfil.is_public,
    })),
    proximo: linhas.length > POR_PAGINA ? pagina[pagina.length - 1].username : null,
  }
}

/**
 * Remove um seguidor do próprio perfil, em silêncio: apaga o vínculo aceito em
 * que o dono é o followee. Uma solicitação pendente não é tocada (ela se recusa
 * pelas Notificações). Nada impede o removido de seguir ou pedir de novo.
 * Devolve se havia o vínculo.
 */
export async function removerSeguidor(supabase: ClienteDaSessao, dono: string, seguidor: string) {
  const { data, error } = await supabase
    .from("follows")
    .delete()
    .eq("followee_id", dono)
    .eq("follower_id", seguidor)
    .eq("status", "accepted")
    .select("follower_id")
  if (error) throw error
  return data.length > 0
}
