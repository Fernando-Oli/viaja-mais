import type { SupabaseClient } from "@supabase/supabase-js"
import { ErroHttp } from "@/lib/http"
import { assinarAvatares, type ClienteDeServico } from "./avatar"
import { ErroComCodigo } from "./post-http"

/**
 * Marcações de um post (RF09.13): quem está marcado, quem pode ser marcado,
 * quem recusou, e a troca de uma lista pela outra.
 *
 * **Quem pode ser marcado** (decisão de 18/11, noite, "como no Instagram"):
 * qualquer perfil **com username**, menos a autora — também no post de viagem,
 * onde antes só membros podiam. `validarMarcados` confere isso no servidor,
 * antes de gravar qualquer coisa, lendo `profiles` (domínio Social, que a RLS
 * deixa qualquer autenticado ler): uuid que não é de ninguém, que é da própria
 * autora ou de uma conta sem username é 400 `marcado_invalido`.
 *
 * **Os membros da viagem** viram só **sugestão** no post de viagem
 * (`membrosMarcaveis`, pela função `social_membros_marcaveis`: a RLS de
 * `trip_members` não deixa a sessão listar os outros membros, e o Social não
 * consulta tabela da Plataforma direto).
 *
 * **Quem recusou**: quem removeu a própria marca não volta a ser marcado por
 * aquela autora — no post de viagem, por (viagem, autora, pessoa), e sobrevive
 * a despublicar (`recusasDaViagem`, função `social_recusas_da_viagem`); no post
 * sem viagem, por (post, pessoa) (`recusasDoPost`, função
 * `social_recusas_do_post`). As duas respondem só sobre a sessão. Marcar quem
 * recusou é 400 `marcado_recusou` (`conferirRecusas`) antes de gravar; a
 * função `social_pode_marcar` recusa o mesmo no banco (42501), como segunda
 * linha, e também recusa o marcado sem username ou a própria autora.
 *
 * **Quem está marcado** vem de `post_tags` com o perfil embutido, com a sessão
 * (a policy deixa quem enxerga o post ler as marcas). A foto de cada pessoa
 * sai assinada; quem monta a resposta (lib/social/post.ts) assina as fotos da
 * autora e dos marcados numa chamada só, então aqui sai o perfil cru
 * (`perfisMarcadosDosPosts`) ou já assinado (`comFoto`).
 *
 * A escrita (`sincronizarMarcacoes`) usa o cliente da sessão, nas colunas do
 * grant de INSERT; a policy de `post_tags` é a segunda linha.
 *
 * Erro do banco nunca sai cru: 42501 vira 403 (no INSERT da marca, 400
 * `marcado_recusou`), 23505 vira 409, o 23514 do limite de 20 marcas
 * (`posts_marcados_limite`) vira 400 `limite_de_marcados`, e o resto lança um `Error` com o
 * original em `cause`, que `respostaDeErro` torna o 500 genérico.
 *
 * @RF09.13 marcar qualquer perfil com username, menos a autora e quem recusou
 */

type ClienteDaSessao = Pick<SupabaseClient, "from" | "rpc">

/** Uma pessoa num post (marcada, sugerida ou achada na busca): o formato `PessoaNoPost` do contrato. */
export type PessoaNoPost = {
  id: string
  username: string
  full_name: string | null
  /** URL assinada da foto, ou nula. */
  avatar_url: string | null
}

/** O nome antigo, para quem já importava. */
export type PessoaMarcada = PessoaNoPost

/** Uma sugestão do post de viagem: `recusou` quando ela removeu uma marca desta autora nesta viagem. */
export type PessoaMarcavel = PessoaNoPost & { recusou: boolean }

/** O perfil como sai do banco: `avatar_url` ainda é o caminho no bucket. */
export type PerfilLido = { id: string; username: string | null; full_name: string | null; avatar_url: string | null }

/** O código que a rota devolve quando um marcado não pode ser marcado. */
export const MARCADO_INVALIDO = "marcado_invalido"
/** O código que a rota devolve quando um marcado removeu uma marca desta autora. */
export const MARCADO_RECUSOU = "marcado_recusou"

/** O código que a rota devolve quando o post passaria de 20 pessoas marcadas. */
export const LIMITE_DE_MARCADOS = "limite_de_marcados"

export const COLUNAS_PERFIL = "id, username, full_name, avatar_url"
const SEM_PRIVILEGIO = "42501"
const CHAVE_REPETIDA = "23505"
const VIOLA_CHECK = "23514"
/** O nome que o trigger `social_limitar_marcas_do_post` põe em CONSTRAINT (migration 20261118174100, seção 9). */
const CONSTRAINT_DO_LIMITE = "posts_marcados_limite"
/** A mensagem do mesmo trigger. */
const MENSAGEM_DO_LIMITE = /no máximo 20 pessoas marcadas/i

export const marcadoInvalido = () =>
  new ErroComCodigo(400, "Só dá para marcar perfis com nome de usuário, e não você mesma(o)", MARCADO_INVALIDO)

/** 400 `marcado_recusou`, com os ids (em minúsculas) de quem recusou e foi pedido. */
export const marcadoRecusou = (recusados: readonly string[]) =>
  new ErroComCodigo(
    400,
    "Quem removeu a própria marcação numa publicação sua não pode ser marcado de novo nela",
    MARCADO_RECUSOU,
    [...recusados],
  )

export const limiteDeMarcados = () =>
  new ErroComCodigo(400, "Uma publicação pode ter no máximo 20 pessoas marcadas", LIMITE_DE_MARCADOS)

type ErroLido = { code?: string; message?: string; details?: string | null; hint?: string | null; constraint?: string }

/**
 * O 23514 do limite de 20 marcas. O mesmo código vem dos CHECKs (por exemplo
 * `post_tags_nao_marca_a_si`), então o que decide é o nome da constraint. O
 * PostgREST só devolve `code`, `message`, `details` e `hint` — o CONSTRAINT do
 * RAISE não chega ao cliente —, por isso vale o nome em qualquer campo ou a
 * mensagem do trigger.
 */
function ehLimiteDeMarcados(error: ErroLido): boolean {
  if (error.code !== VIOLA_CHECK) return false
  const textos = [error.constraint, error.message, error.details, error.hint].filter(
    (texto): texto is string => typeof texto === "string",
  )
  return textos.some((texto) => texto.includes(CONSTRAINT_DO_LIMITE) || MENSAGEM_DO_LIMITE.test(texto))
}

function erroDoBanco(error: ErroLido, acao: string): Error {
  if (error.code === SEM_PRIVILEGIO) return new ErroHttp(403, `Sem permissão para ${acao}`)
  if (ehLimiteDeMarcados(error)) return limiteDeMarcados()
  if (error.code === CHAVE_REPETIDA) {
    return new ErroHttp(409, "As marcações mudaram em outra aba. Recarregue a página e tente de novo.")
  }
  return new Error(`[marcações do post] não foi possível ${acao}`, { cause: error })
}

/**
 * Perfis com username, campo a campo e com a foto assinada, na ordem recebida.
 * Sem username a pessoa não tem página na rede, e não aparece.
 */
export async function comFoto(criarAdmin: () => ClienteDeServico, perfis: readonly PerfilLido[]): Promise<PessoaNoPost[]> {
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
 * Os membros da viagem que a sessão pode marcar, em ordem de username: as
 * **sugestões** do post de viagem. Lista vazia se ela não participa da viagem
 * (a função responde vazio) ou se ninguém mais tem username.
 */
export async function membrosMarcaveis(
  supabase: ClienteDaSessao,
  tripId: string,
  criarAdmin: () => ClienteDeServico,
): Promise<PessoaNoPost[]> {
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
 * Quem está marcado em cada post, na ordem em que foi marcado, com o perfil
 * cru (a foto ainda é o caminho). Post sem marca nenhuma não aparece no mapa.
 * Lista de posts vazia não vai ao banco.
 */
export async function perfisMarcadosDosPosts(
  supabase: ClienteDaSessao,
  postIds: readonly string[],
): Promise<Map<string, PerfilLido[]>> {
  const porPost = new Map<string, PerfilLido[]>()
  if (postIds.length === 0) return porPost

  const { data, error } = await supabase
    .from("post_tags")
    .select(`post_id, perfil:profiles!post_tags_tagged_id_fkey(${COLUNAS_PERFIL})`)
    .in("post_id", [...new Set(postIds)])
    .order("created_at", { ascending: true })
    .order("tagged_id", { ascending: true })
  if (error) throw erroDoBanco(error, "ler as marcações")

  for (const linha of (data ?? []) as unknown as { post_id: string; perfil: PerfilLido | null }[]) {
    if (!linha.perfil) continue
    const lista = porPost.get(linha.post_id) ?? []
    lista.push(linha.perfil)
    porPost.set(linha.post_id, lista)
  }
  return porPost
}

/** Quem está marcado no post, com a foto assinada, na ordem em que foi marcado. */
export async function marcadosDoPost(
  supabase: ClienteDaSessao,
  postId: string,
  criarAdmin: () => ClienteDeServico,
): Promise<PessoaNoPost[]> {
  const perfis = await perfisMarcadosDosPosts(supabase, [postId])
  return comFoto(criarAdmin, perfis.get(postId) ?? [])
}

/**
 * Lança 400 `marcado_invalido` se algum marcado não é um perfil com username
 * ou é a própria autora. Lista vazia não vai ao banco. Compara em minúsculas.
 * A rota chama antes de gravar, para um marcado inválido não deixar um post
 * pela metade.
 */
export async function validarMarcados(
  supabase: ClienteDaSessao,
  marcados: readonly string[],
  autorId: string,
): Promise<void> {
  const pedidos = [...new Set(marcados.map((id) => id.toLowerCase()))]
  if (pedidos.length === 0) return
  if (pedidos.includes(autorId.toLowerCase())) throw marcadoInvalido()

  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .in("id", pedidos)
    .not("username", "is", null)
  if (error) throw erroDoBanco(error, "conferir quem foi marcado")

  const achados = new Set(((data ?? []) as { id: string }[]).map((perfil) => perfil.id.toLowerCase()))
  if (pedidos.some((id) => !achados.has(id))) throw marcadoInvalido()
}

/** Os ids de uma função `setof uuid`, em minúsculas. */
function idsDaFuncao(data: unknown): Set<string> {
  const ids: unknown[] = Array.isArray(data) ? data : []
  return new Set(ids.flatMap((id) => (typeof id === "string" ? [id.toLowerCase()] : [])))
}

/**
 * Quem removeu uma marca posta pela sessão nesta viagem. Pergunta à função
 * `social_recusas_da_viagem` (SECURITY DEFINER, só sobre `auth.uid()` como
 * autora). Responde também antes do primeiro POST, e depois de despublicar.
 */
export async function recusasDaViagem(supabase: ClienteDaSessao, tripId: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("social_recusas_da_viagem", { viagem: tripId })
  if (error) throw erroDoBanco(error, "ler quem removeu a marcação")
  return idsDaFuncao(data)
}

/**
 * Quem removeu a própria marca deste post (sem viagem). Pergunta à função
 * `social_recusas_do_post`, que só responde à autora do post (para os outros,
 * vazio).
 */
export async function recusasDoPost(supabase: ClienteDaSessao, postId: string): Promise<Set<string>> {
  const { data, error } = await supabase.rpc("social_recusas_do_post", { post: postId })
  if (error) throw erroDoBanco(error, "ler quem removeu a marcação")
  return idsDaFuncao(data)
}

/** As sugestões com `recusou`, campo a campo. */
export function comRecusas(pessoas: readonly PessoaNoPost[], recusas: ReadonlySet<string>): PessoaMarcavel[] {
  return pessoas.map((pessoa) => ({
    id: pessoa.id,
    username: pessoa.username,
    full_name: pessoa.full_name,
    avatar_url: pessoa.avatar_url,
    recusou: recusas.has(pessoa.id.toLowerCase()),
  }))
}

/**
 * Lança 400 `marcado_recusou` se algum marcado está nas recusas. Compara em
 * minúsculas. Pura: a rota a chama antes de gravar, e `sincronizarMarcacoes`
 * repete.
 */
export function conferirRecusas(marcados: readonly string[], recusas: Iterable<string>): void {
  const recusados = new Set(Array.from(recusas, (id) => id.toLowerCase()))
  const barrados = [...new Set(marcados.map((id) => id.toLowerCase()))].filter((id) => recusados.has(id))
  if (barrados.length > 0) throw marcadoRecusou(barrados)
}

/**
 * Na corrida do INSERT recusado: quem dos `novos` está nas recusas do post
 * agora (`social_recusas_do_post` cobre as por post e, no post de viagem, as
 * da viagem). Sem resposta útil (a recusa não é o motivo, ou a leitura falhou),
 * devolve os `novos`: são eles que a tela precisa rever.
 */
async function quemRecusouAgora(supabase: ClienteDaSessao, postId: string, novos: string[]): Promise<string[]> {
  try {
    const recusas = await recusasDoPost(supabase, postId)
    const barrados = novos.filter((id) => recusas.has(id))
    return barrados.length > 0 ? barrados : novos
  } catch {
    return novos
  }
}

/**
 * Deixa as marcas do post iguais a `marcados`: insere as novas e apaga as que
 * saíram; as que ficam não são tocadas (mantêm a data). Confere as recusas
 * antes de escrever qualquer coisa. Quem chama já validou os marcados
 * (`validarMarcados`).
 *
 * Campo a campo, nas colunas do grant de INSERT (`post_id`, `tagged_id`,
 * `author_id`). A policy (`social_pode_marcar`) confere de novo que a sessão é
 * a autora e que o marcado tem username, não é ela e não recusou.
 *
 * Ordem: apagar antes de inserir. O trigger `post_tags_limite_por_post` conta
 * as marcas que já estão no post: num post com 20, trocar uma pessoa por outra
 * na ordem inversa pediria a 21ª e daria 23514. O INSERT é um comando só: se o
 * banco recusar uma pessoa, nenhuma marca do lote entra — mas as que saíram já
 * saíram (são duas requisições, sem transação entre elas), e a tela recarrega
 * as marcas a partir do erro.
 *
 * Erros: 23514 do limite vira 400 `limite_de_marcados`.
 */
export async function sincronizarMarcacoes(
  supabase: ClienteDaSessao,
  postId: string,
  autorId: string,
  marcados: readonly string[],
  recusas: Iterable<string> = [],
): Promise<void> {
  conferirRecusas(marcados, recusas)
  const desejados = new Set(marcados.map((id) => id.toLowerCase()))

  const { data, error } = await supabase.from("post_tags").select("tagged_id").eq("post_id", postId)
  if (error) throw erroDoBanco(error, "ler as marcações")
  const atuais = new Set(((data ?? []) as { tagged_id: string }[]).map((linha) => linha.tagged_id.toLowerCase()))

  const novos = [...desejados].filter((id) => !atuais.has(id))
  const removidos = [...atuais].filter((id) => !desejados.has(id))

  if (removidos.length > 0) {
    const remocao = await supabase.from("post_tags").delete().eq("post_id", postId).in("tagged_id", removidos)
    if (remocao.error) throw erroDoBanco(remocao.error, "desmarcar")
  }

  if (novos.length > 0) {
    const insercao = await supabase
      .from("post_tags")
      .insert(novos.map((id) => ({ post_id: postId, tagged_id: id, author_id: autorId })))
    // Corrida: a pessoa removeu a própria marca (ou apagou o username) entre a
    // conferência da rota e este INSERT. A `social_pode_marcar` recusa (42501),
    // e a resposta é a de quando a rota pega a recusa antes: 400
    // `marcado_recusou`, e não um 403 genérico, que a tela mostraria como "sem
    // permissão" para quem é a autora.
    if (insercao.error?.code === SEM_PRIVILEGIO) throw marcadoRecusou(await quemRecusouAgora(supabase, postId, novos))
    if (insercao.error) throw erroDoBanco(insercao.error, "marcar")
  }
}
