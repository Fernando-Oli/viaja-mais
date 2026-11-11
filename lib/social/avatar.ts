import type { SupabaseClient } from "@supabase/supabase-js"
import { BUCKET_AVATARES, FORMATO_CAMINHO, REUSO_URL_AVATAR_S, VALIDADE_URL_AVATAR_S } from "./foto"

/**
 * URLs assinadas das fotos de perfil, a partir do que está em `profiles.avatar_url`.
 *
 * É o helper que toda rota que devolve foto de perfil usa — o Perfil, o menu
 * lateral, a busca e, depois, o feed. O bucket é privado (S04-M-foto-privada): o
 * banco guarda o caminho no bucket, e o navegador só recebe um link temporário,
 * que vale `VALIDADE_URL_AVATAR_S` e deixa de abrir quando o arquivo é apagado.
 *
 * Quem assina é o servidor, com a chave de serviço: a rota passa a fábrica do
 * cliente de `lib/supabase/admin.ts`, depois de decidir que a pessoa pode ver. O
 * bucket não tem policy para usuário, então ninguém assina com o próprio JWT — e
 * por isso ninguém escolhe a validade do link.
 *
 * Só assina o que está no formato do trigger e na pasta do próprio perfil: o
 * trigger já garante isso em `profiles`, e a checagem aqui é a defesa para
 * quando outra tabela (o feed) reusar o helper.
 *
 * O mesmo link é devolvido por `REUSO_URL_AVATAR_S` (assinatura nova = URL nova =
 * download novo no navegador). O cliente de serviço só é criado quando há o que
 * assinar, e uma chamada ao Storage cobre a resposta inteira. Se faltar a chave
 * ou o Storage falhar, a foto vem nula e o erro vai ao log: uma foto que não
 * abre não pode derrubar o perfil nem o menu.
 *
 * @RF02.2 foto de perfil
 */

type ClienteDeServico = Pick<SupabaseClient, "storage">
type PerfilComFoto = { id: string; avatar_url: string | null }

/** Cabeçalhos das respostas que levam link assinado: ele vale como senha, não pode ir para cache compartilhado. */
export const SEM_CACHE_COMPARTILHADO = { "Cache-Control": "private, no-store" } as const

/** Teto de links guardados por instância do servidor; acima dele, sai o mais antigo. */
const MAX_LINKS_GUARDADOS = 1000
const linksEmitidos = new Map<string, { url: string; emitidoEm: number }>()

/** Para os testes: esquece os links já emitidos. */
export function esquecerLinksEmitidos() {
  linksEmitidos.clear()
}

function linkAindaReaproveitavel(caminho: string, agora: number) {
  const guardado = linksEmitidos.get(caminho)
  if (!guardado) return null
  if (agora - guardado.emitidoEm < REUSO_URL_AVATAR_S * 1000) return guardado.url
  linksEmitidos.delete(caminho)
  return null
}

function guardarLink(caminho: string, url: string, agora: number) {
  linksEmitidos.delete(caminho)
  linksEmitidos.set(caminho, { url, emitidoEm: agora })
  // O Map guarda a ordem de inserção: a primeira chave é a mais antiga, e acima
  // do teto ela sempre existe.
  if (linksEmitidos.size > MAX_LINKS_GUARDADOS) linksEmitidos.delete(linksEmitidos.keys().next().value!)
}

/** O caminho da foto, se ele está no formato do trigger e na pasta do próprio perfil. */
function caminhoDaFoto({ id, avatar_url }: PerfilComFoto): string | null {
  if (!avatar_url) return null
  const casou = FORMATO_CAMINHO.exec(avatar_url)
  return casou && casou[1] === id ? avatar_url : null
}

/** A URL assinada da foto de cada perfil, na mesma ordem, ou nulo. */
export async function assinarAvatares(
  criarAdmin: () => ClienteDeServico,
  perfis: readonly PerfilComFoto[],
): Promise<(string | null)[]> {
  const agora = Date.now()
  const caminhos = perfis.map(caminhoDaFoto)
  const faltando = Array.from(
    new Set(caminhos.filter((c): c is string => c !== null && !linkAindaReaproveitavel(c, agora))),
  )

  if (faltando.length > 0) {
    try {
      const { data, error } = await criarAdmin()
        .storage.from(BUCKET_AVATARES)
        .createSignedUrls(faltando, VALIDADE_URL_AVATAR_S)
      if (error || !data) throw error ?? new Error("o Storage não devolveu as assinaturas")
      for (const item of data) {
        if (item.path && item.signedUrl && !item.error) guardarLink(item.path, item.signedUrl, agora)
        else console.error("[foto de perfil] foto não assinada", item.path, item.error)
      }
    } catch (erro) {
      // Chave de serviço ausente, rede ou Storage fora do ar: as fotos faltantes
      // vêm nulas, e o resto da resposta segue.
      console.error("[foto de perfil] não foi possível assinar as fotos", erro)
    }
  }

  return caminhos.map((caminho) => (caminho ? (linksEmitidos.get(caminho)?.url ?? null) : null))
}

/** Atalho para um perfil só. */
export async function assinarAvatar(
  criarAdmin: () => ClienteDeServico,
  perfil: PerfilComFoto,
): Promise<string | null> {
  const [url] = await assinarAvatares(criarAdmin, [perfil])
  return url
}
