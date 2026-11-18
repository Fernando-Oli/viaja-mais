import type { SupabaseClient } from "@supabase/supabase-js"
import { ErroHttp } from "@/lib/http"
import { assinarAvatares, type ClienteDeServico } from "./avatar"

/**
 * Marcações de um post de viagem (S06-M-publicar-viagem, "Quem viajou com
 * você"): quem pode ser marcado, quem está marcado, e a troca de uma lista pela
 * outra.
 *
 * **Quem pode ser marcado** vem da função `social_membros_marcaveis` do banco
 * (migration de legenda e lugares, 18/11): os membros da viagem com username,
 * menos a sessão, e só se a sessão participa da viagem. Ela existe porque a RLS
 * de `trip_members` não deixa a sessão listar os outros membros, e o Social não
 * consulta tabela da Plataforma direto. Os dados de cada pessoa saem de
 * `profiles` (domínio Social), que a RLS deixa qualquer autenticado ler.
 *
 * **Quem está marcado** vem de `post_tags` (migration 20261116234030), também
 * com a sessão: o autor vê as marcas do próprio post.
 *
 * As fotos saem assinadas como em todo o domínio social
 * (`assinarAvatares`, lib/social/avatar.ts): a rota passa a fábrica do cliente
 * de serviço, e este módulo não cria cliente nem lê variável de ambiente. A
 * resposta é campo a campo: `id`, `username`, `full_name` e `avatar_url`, sem
 * e-mail nem nada da viagem.
 *
 * A escrita (`sincronizarMarcacoes`) usa o cliente da sessão: a policy de
 * INSERT de `post_tags` (`social_pode_marcar`) é a segunda linha, depois da
 * conferência contra os permitidos, que é da rota e repetida aqui.
 *
 * Erro do banco nunca sai cru: 42501 vira 403, 23505 vira 409, e o resto lança
 * um `Error` com o original em `cause`, que `respostaDeErro` torna o 500 genérico.
 *
 * @RF09.13 marcar no post os membros da viagem que têm username
 */

type ClienteDaSessao = Pick<SupabaseClient, "from" | "rpc">

/** Uma pessoa como o diálogo a mostra: marcável ou marcada. */
export type PessoaMarcada = {
  id: string
  username: string
  full_name: string | null
  /** URL assinada da foto, ou nula. */
  avatar_url: string | null
}

type PerfilLido = { id: string; username: string | null; full_name: string | null; avatar_url: string | null }

/** O código que a rota devolve quando um marcado não pode ser marcado. */
export const MARCADO_INVALIDO = "marcado_invalido"

const COLUNAS_PERFIL = "id, username, full_name, avatar_url"
const SEM_PRIVILEGIO = "42501"
const CHAVE_REPETIDA = "23505"

function erroDoBanco(error: { code?: string }, acao: string): Error {
  if (error.code === SEM_PRIVILEGIO) return new ErroHttp(403, `Sem permissão para ${acao}`)
  if (error.code === CHAVE_REPETIDA) {
    return new ErroHttp(409, "As marcações mudaram em outra aba. Recarregue a página e tente de novo.")
  }
  return new Error(`[marcações do post] não foi possível ${acao}`, { cause: error })
}

/**
 * Perfis com username, campo a campo e com a foto assinada, na ordem recebida.
 * Sem username a pessoa não tem página na rede, e não aparece.
 */
async function comFoto(criarAdmin: () => ClienteDeServico, perfis: PerfilLido[]): Promise<PessoaMarcada[]> {
  const comNome = perfis.filter((perfil): perfil is PerfilLido & { username: string } => !!perfil.username)
  const fotos = await assinarAvatares(criarAdmin, comNome)
  return comNome.map((perfil, i) => ({
    id: perfil.id,
    username: perfil.username,
    full_name: perfil.full_name,
    avatar_url: fotos[i],
  }))
}

/**
 * Os membros que a sessão pode marcar no post desta viagem, em ordem de
 * username. Lista vazia se ela não participa da viagem (a função responde
 * vazio) ou se ninguém mais tem username: nesse caso nem lê `profiles`.
 */
export async function membrosMarcaveis(
  supabase: ClienteDaSessao,
  tripId: string,
  criarAdmin: () => ClienteDeServico,
): Promise<PessoaMarcada[]> {
  const { data: ids, error: erroIds } = await supabase.rpc("social_membros_marcaveis", { viagem: tripId })
  if (erroIds) throw erroDoBanco(erroIds, "listar quem viajou com você")

  const lista = Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []
  if (lista.length === 0) return []

  const { data, error } = await supabase
    .from("profiles")
    .select(COLUNAS_PERFIL)
    .in("id", lista)
    .not("username", "is", null)
    .order("username", { ascending: true })
  if (error) throw erroDoBanco(error, "listar quem viajou com você")
  return comFoto(criarAdmin, (data ?? []) as PerfilLido[])
}

/**
 * Quem está marcado no post, na ordem em que foi marcado. Com a sessão: o autor
 * vê todas as marcas do próprio post, inclusive de quem já saiu da viagem (a
 * marca continua, e é a pessoa marcada quem a remove).
 */
export async function marcadosDoPost(
  supabase: ClienteDaSessao,
  postId: string,
  criarAdmin: () => ClienteDeServico,
): Promise<PessoaMarcada[]> {
  const { data, error } = await supabase
    .from("post_tags")
    .select(`perfil:profiles!post_tags_tagged_id_fkey(${COLUNAS_PERFIL})`)
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
  if (error) throw erroDoBanco(error, "ler as marcações")

  const perfis = ((data ?? []) as unknown as { perfil: PerfilLido | null }[]).flatMap(({ perfil }) =>
    perfil ? [perfil] : [],
  )
  return comFoto(criarAdmin, perfis)
}

/**
 * Lança `ErroHttp(400, "marcado_invalido")` se algum marcado não está em
 * `permitidos`. Compara em minúsculas. Pura: a rota a chama antes de gravar o
 * post, para um marcado inválido não deixar uma publicação pela metade.
 */
export function conferirMarcados(marcados: readonly string[], permitidos: Iterable<string>): void {
  const aceitos = new Set(Array.from(permitidos, (id) => id.toLowerCase()))
  if (marcados.some((id) => !aceitos.has(id.toLowerCase()))) throw new ErroHttp(400, MARCADO_INVALIDO)
}

/**
 * Deixa as marcas do post iguais a `marcados`: insere as novas e apaga as que
 * saíram; as que ficam não são tocadas (mantêm a data). Confere todos os
 * marcados contra `permitidos` antes de escrever qualquer coisa.
 *
 * `permitidos` é de quem chama: ao publicar, os marcáveis; ao atualizar, os
 * marcáveis mais os já marcados, para quem saiu da viagem continuar marcado até
 * remover a própria marca.
 *
 * Campo a campo, nas colunas do grant de INSERT (`post_id`, `tagged_id`,
 * `author_id`). A policy confere de novo que a sessão é a autora, participa da
 * viagem e marca outro membro com username.
 */
export async function sincronizarMarcacoes(
  supabase: ClienteDaSessao,
  postId: string,
  autorId: string,
  marcados: readonly string[],
  permitidos: Iterable<string>,
): Promise<void> {
  conferirMarcados(marcados, permitidos)
  const desejados = new Set(marcados.map((id) => id.toLowerCase()))

  const { data, error } = await supabase.from("post_tags").select("tagged_id").eq("post_id", postId)
  if (error) throw erroDoBanco(error, "ler as marcações")
  const atuais = new Set(((data ?? []) as { tagged_id: string }[]).map((linha) => linha.tagged_id.toLowerCase()))

  const novos = [...desejados].filter((id) => !atuais.has(id))
  const removidos = [...atuais].filter((id) => !desejados.has(id))

  if (novos.length > 0) {
    const insercao = await supabase
      .from("post_tags")
      .insert(novos.map((id) => ({ post_id: postId, tagged_id: id, author_id: autorId })))
    if (insercao.error) throw erroDoBanco(insercao.error, "marcar quem viajou com você")
  }

  if (removidos.length > 0) {
    const remocao = await supabase.from("post_tags").delete().eq("post_id", postId).in("tagged_id", removidos)
    if (remocao.error) throw erroDoBanco(remocao.error, "desmarcar")
  }
}
