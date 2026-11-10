import type { SupabaseClient } from "@supabase/supabase-js"
import { assinarAvatares } from "./avatar"

/**
 * O histórico de pesquisa da aba Rede social (S05-M-pesquisa): os perfis que a
 * pessoa abriu pela pesquisa, do mais recente para o mais antigo, como os
 * "Recentes" do Instagram.
 *
 * Tudo com a sessão de quem está no histórico: a RLS de `search_history` só
 * deixa cada um ler, gravar e apagar o próprio. O banco mantém no máximo 15
 * entradas e apaga as vencidas no próximo registro e no job diário (migration
 * 20261021191609). Até o job rodar, o vencido continua visível ao próprio dono,
 * para ele conseguir apagá-lo; quem o tira da tela é esta leitura. A chave de
 * serviço só assina as fotos.
 *
 * A resposta leva o que a tela mostra, campo a campo, sem o `id`.
 *
 * @RF09.12 histórico de pesquisa
 */

type ClienteDaSessao = Pick<SupabaseClient, "from">
type ClienteDeServico = Pick<SupabaseClient, "storage">

/** O mesmo teto do trigger `search_history_podar`. */
export const LIMITE_RECENTES = 15

/** A mesma validade do trigger e do job diário. */
export const DIAS_RECENTES = 30

export type PessoaRecente = {
  username: string
  full_name: string | null
  avatar_url: string | null
  is_public: boolean
}

type PerfilAberto = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  is_public: boolean
}

// Dois caminhos de search_history até profiles (o dono e a pessoa aberta): o
// nome da FK diz qual.
const COLUNAS = "perfil:profiles!search_history_profile_id_fkey(id, username, full_name, avatar_url, is_public)"

export async function listarRecentes(
  supabase: ClienteDaSessao,
  criarAdmin: () => ClienteDeServico,
  dono: string,
  agora: Date = new Date(),
): Promise<PessoaRecente[]> {
  const validade = new Date(agora.getTime() - DIAS_RECENTES * 24 * 60 * 60 * 1000)
  const { data, error } = await supabase
    .from("search_history")
    .select(COLUNAS)
    .eq("user_id", dono)
    .gt("searched_at", validade.toISOString())
    .order("searched_at", { ascending: false })
    .limit(LIMITE_RECENTES)
  if (error) throw error

  // Sem username a conta não tem página (anterior ao social): não aparece.
  const perfis = (data as unknown as { perfil: PerfilAberto | null }[])
    .map(({ perfil }) => perfil)
    .filter((perfil): perfil is PerfilAberto & { username: string } => perfil?.username != null)

  const fotos = await assinarAvatares(criarAdmin, perfis)
  return perfis.map((perfil, i) => ({
    username: perfil.username,
    full_name: perfil.full_name,
    avatar_url: fotos[i],
    is_public: perfil.is_public,
  }))
}

/**
 * Registra quem foi aberto. Reabrir leva ao topo: apaga a entrada antiga e
 * grava de novo, com a data do banco. Dois cliques ao mesmo tempo não duplicam:
 * o segundo esbarra na chave, e o ON CONFLICT DO NOTHING o ignora.
 *
 * São duas chamadas, e não uma transação: se a gravação falhar depois de
 * apagar, a pessoa sai do histórico em vez de subir ao topo. É o histórico do
 * próprio usuário, e a próxima abertura a registra de novo.
 */
export async function registrarPesquisa(supabase: ClienteDaSessao, dono: string, perfil: string) {
  const antiga = await supabase.from("search_history").delete().eq("user_id", dono).eq("profile_id", perfil)
  if (antiga.error) throw antiga.error

  // Campo a campo, e só os dois que o grant de INSERT aceita.
  const { error } = await supabase
    .from("search_history")
    .upsert({ user_id: dono, profile_id: perfil }, { onConflict: "user_id,profile_id", ignoreDuplicates: true })
  if (error) throw error
}

/** O X de uma entrada. Apagar o que não está no histórico também é sucesso. */
export async function apagarDoHistorico(supabase: ClienteDaSessao, dono: string, perfil: string) {
  const { error } = await supabase.from("search_history").delete().eq("user_id", dono).eq("profile_id", perfil)
  if (error) throw error
}

/** O "Limpar tudo". */
export async function limparHistorico(supabase: ClienteDaSessao, dono: string) {
  const { error } = await supabase.from("search_history").delete().eq("user_id", dono)
  if (error) throw error
}
