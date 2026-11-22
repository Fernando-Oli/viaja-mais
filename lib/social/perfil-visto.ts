import type { SupabaseClient } from "@supabase/supabase-js"
import { assinarAvatar } from "./avatar"

/**
 * O perfil de outra pessoa como quem o visita o vê (S05-M-seguir): os dados
 * básicos, o vínculo de quem vê com ele e quantos seguidores e seguidos ele tem.
 * É a mesma resposta das três rotas (ver o perfil, seguir e deixar de seguir),
 * para a tela sempre receber o estado já atualizado.
 *
 * - Os dados básicos vêm com a sessão de quem vê: a RLS de `profiles` deixa
 *   qualquer autenticado lê-los, também em perfil privado (catálogo, RF02).
 * - O vínculo vem da linha de `follows` em que quem vê é o seguidor, que a RLS
 *   sempre mostra a ele, pendente ou aceito.
 * - Os contadores vêm da função `contar_rede` do banco, também com a sessão de
 *   quem vê. Pela RLS, um visitante não vê um vínculo entre dois perfis
 *   privados, e contar as linhas daria errado; a função devolve só os dois
 *   números (migration 20261021165006). Se a contagem falhar, os números vêm
 *   nulos e o perfil continua: um contador não derruba a página.
 * - A foto vai como URL assinada (lib/social/avatar.ts). É o único uso da chave
 *   de serviço, e só quando há foto.
 *
 * - `publicacoes` conta os posts do perfil (S06-M-perfil-instagram), também com
 *   a sessão de quem vê. Fora da rede visível ele vem nulo: a RLS de `posts`
 *   (pode_ver_rede) esconderia as linhas e a contagem daria 0, o que seria
 *   falso. A regra local é a mesma da função do banco: o dono, quem segue com
 *   vínculo aceito, ou perfil público. Se a contagem falhar, vem nulo também.
 *
 * - `sem_username` diz se quem vê ainda não escolheu um nome de usuário: sem
 *   ele, ninguém entra na rede de ninguém (migration 20261110200043,
 *   S05-M-listas), e a tela mostra o aviso no lugar do Seguir.
 *
 * A resposta é montada campo a campo: o `id` serve às consultas e não sai como
 * campo (o caminho da foto assinada o contém, e ele não é segredo desde a S03).
 *
 * @RF02.8 perfil de outro usuário · @RF09.1 @RF09.2 @RF09.5 seguir · @RF09.9 sem username, fora da rede
 * @RF09.16 contador de publicações
 */

type ClienteDaSessao = Pick<SupabaseClient, "from" | "rpc">
type ClienteDeServico = Pick<SupabaseClient, "storage">
type Contagem = { seguidores: number | null; seguindo: number | null }

export type Vinculo = "proprio" | "nenhum" | "solicitado" | "seguindo"

export type PerfilVisto = {
  username: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  is_public: boolean
  vinculo: Vinculo
  seguidores: number | null
  seguindo: number | null
  publicacoes: number | null
  sem_username: boolean
}

export type PerfilAlvo = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  is_public: boolean
}

const COLUNAS = "id, username, full_name, avatar_url, bio, is_public"

/** O perfil dono do username (já normalizado pelo schema), ou nulo se ninguém o usa. */
export async function buscarPerfilPorUsername(supabase: ClienteDaSessao, username: string): Promise<PerfilAlvo | null> {
  const { data, error } = await supabase.from("profiles").select(COLUNAS).eq("username", username).maybeSingle()
  if (error) throw error
  return (data as PerfilAlvo | null) ?? null
}

/**
 * Se a pessoa já escolheu um username. Sem ele, ela não segue ninguém: a rota de
 * seguir recusa antes, e a policy `follows_insert` recusa no banco.
 */
export async function temUsername(supabase: ClienteDaSessao, id: string): Promise<boolean> {
  const { data, error } = await supabase.from("profiles").select("username").eq("id", id).maybeSingle()
  if (error) throw error
  return data?.username != null
}

async function vinculoCom(supabase: ClienteDaSessao, quemVe: string, alvo: string): Promise<Vinculo> {
  if (quemVe === alvo) return "proprio"
  const { data, error } = await supabase
    .from("follows")
    .select("status")
    .eq("follower_id", quemVe)
    .eq("followee_id", alvo)
    .maybeSingle()
  if (error) throw error
  if (!data) return "nenhum"
  return data.status === "accepted" ? "seguindo" : "solicitado"
}

async function contarRede(supabase: ClienteDaSessao, perfil: string): Promise<Contagem> {
  try {
    const { data, error } = await supabase.rpc("contar_rede", { perfil }).single()
    if (error) throw error
    const { seguidores, seguindo } = data as { seguidores: number; seguindo: number }
    return { seguidores, seguindo }
  } catch (erro) {
    console.error("[perfil visto] não foi possível contar a rede", erro)
    return { seguidores: null, seguindo: null }
  }
}

async function contarPublicacoes(supabase: ClienteDaSessao, perfil: string): Promise<number | null> {
  try {
    const { count, error } = await supabase
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("author_id", perfil)
    if (error) throw error
    return count ?? 0
  } catch (erro) {
    console.error("[perfil visto] não foi possível contar as publicações", erro)
    return null
  }
}

/** Os mesmos três casos da função `pode_ver_rede` do banco. */
function podeVerRede(vinculo: Vinculo, perfil: PerfilAlvo) {
  return vinculo === "proprio" || vinculo === "seguindo" || perfil.is_public
}

export async function montarPerfilVisto(
  supabase: ClienteDaSessao,
  criarAdmin: () => ClienteDeServico,
  quemVe: string,
  perfil: PerfilAlvo,
): Promise<PerfilVisto> {
  // No próprio perfil o username é o da página, então não precisa ler de novo.
  const [contagem, vinculo, avatar_url, comUsername, publicacoes] = await Promise.all([
    contarRede(supabase, perfil.id),
    vinculoCom(supabase, quemVe, perfil.id),
    assinarAvatar(criarAdmin, perfil),
    quemVe === perfil.id ? true : temUsername(supabase, quemVe),
    contarPublicacoes(supabase, perfil.id),
  ])

  return {
    username: perfil.username,
    full_name: perfil.full_name,
    avatar_url,
    bio: perfil.bio,
    is_public: perfil.is_public,
    vinculo,
    seguidores: contagem.seguidores,
    seguindo: contagem.seguindo,
    publicacoes: podeVerRede(vinculo, perfil) ? publicacoes : null,
    sem_username: !comUsername,
  }
}
