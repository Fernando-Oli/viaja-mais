import type { SupabaseClient } from "@supabase/supabase-js"
import { assinarAvatares } from "./avatar"

/**
 * As solicitações para seguir que um perfil recebeu (S05-M-solicitacoes): a
 * Zona 1 da central de Notificações, acionável e persistente até o dono aprovar
 * ou recusar.
 *
 * Não há tabela própria: cada solicitação é um vínculo `pending` em `follows`,
 * em que o dono é o followee. Tudo com a sessão do dono: a RLS de `follows`
 * mostra o vínculo às duas partes, deixa só o followee aprovar (e só para
 * `accepted`) e qualquer das duas apagar (migration 20261007105848). A chave de
 * serviço só assina as fotos.
 *
 * A resposta leva o que a tela mostra, campo a campo, sem o `id`.
 *
 * @RF09.3 ver solicitações pendentes · @RF09.4 aprovar ou recusar · @RF13.2 Zona 1 da central
 */

type ClienteDaSessao = Pick<SupabaseClient, "from">
type ClienteDeServico = Pick<SupabaseClient, "storage">

/** Quantas a lista traz de uma vez; o total vem do banco. */
export const LIMITE_SOLICITACOES = 50

export type Solicitacao = {
  username: string
  full_name: string | null
  avatar_url: string | null
  is_public: boolean
}

type QuemPediu = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  is_public: boolean
}

// Dois caminhos de follows até profiles (quem pediu e o dono): o nome da FK diz
// qual. O `!inner` deixa o filtro de username valer para a linha inteira, e
// assim também para o total: uma conta sem username (anterior ao social) não
// tem página nem endereço para ser aprovada, e não aparece nem conta.
const COLUNAS = "perfil:profiles!follows_follower_id_fkey!inner(id, username, full_name, avatar_url, is_public)"

export async function listarSolicitacoes(
  supabase: ClienteDaSessao,
  criarAdmin: () => ClienteDeServico,
  dono: string,
): Promise<{ solicitacoes: Solicitacao[]; total: number }> {
  const { data, count, error } = await supabase
    .from("follows")
    .select(COLUNAS, { count: "exact" })
    .eq("followee_id", dono)
    .eq("status", "pending")
    .not("perfil.username", "is", null)
    .order("created_at", { ascending: false })
    .limit(LIMITE_SOLICITACOES)
  if (error) throw error

  const perfis = (data as unknown as { perfil: QuemPediu }[]).map(({ perfil }) => perfil)
  const fotos = await assinarAvatares(criarAdmin, perfis)
  return {
    solicitacoes: perfis.map((perfil, i) => ({
      username: perfil.username,
      full_name: perfil.full_name,
      avatar_url: fotos[i],
      is_public: perfil.is_public,
    })),
    total: count ?? perfis.length,
  }
}

/**
 * Só o total de pendentes, para a bolinha do sino: o banco conta (`head: true`
 * não traz linha nenhuma), sem foto e sem cliente de serviço. O embed fica só
 * com o username, para a regra ser a mesma da lista: conta sem username não
 * conta.
 */
export async function contarSolicitacoes(supabase: ClienteDaSessao, dono: string): Promise<number> {
  const { count, error } = await supabase
    .from("follows")
    .select("perfil:profiles!follows_follower_id_fkey!inner(username)", { count: "exact", head: true })
    .eq("followee_id", dono)
    .eq("status", "pending")
    .not("perfil.username", "is", null)
  if (error) throw error
  return count ?? 0
}

/**
 * Aprova: o vínculo pendente vira aceito. Devolve se havia uma pendente; um
 * vínculo já aceito não é tocado, e quem pediu não aprova a si mesmo, porque o
 * filtro é pelo dono e a RLS só deixa o followee atualizar.
 */
export async function aprovarSolicitacao(supabase: ClienteDaSessao, dono: string, quemPediu: string) {
  const { data, error } = await supabase
    .from("follows")
    .update({ status: "accepted" })
    .eq("followee_id", dono)
    .eq("follower_id", quemPediu)
    .eq("status", "pending")
    .select("follower_id")
  if (error) throw error
  return data.length > 0
}

/** Recusa: apaga a pendente, em silêncio. Quem pediu pode pedir de novo. Devolve se havia uma. */
export async function recusarSolicitacao(supabase: ClienteDaSessao, dono: string, quemPediu: string) {
  const { data, error } = await supabase
    .from("follows")
    .delete()
    .eq("followee_id", dono)
    .eq("follower_id", quemPediu)
    .eq("status", "pending")
    .select("follower_id")
  if (error) throw error
  return data.length > 0
}
