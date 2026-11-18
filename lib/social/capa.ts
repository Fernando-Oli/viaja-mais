import { randomUUID } from "node:crypto"
import { assinarCaminhos, type ClienteDeServico } from "./avatar"
import { FORMATO_CAMINHO, LIMITE_FOTO_BYTES, TIPOS_FOTO, caminhoApagavel, caminhoDaNovaFoto, type TipoFoto } from "./foto"

/**
 * Capa de um post de viagem: caminho, envio, remoção e link assinado.
 *
 * A capa é um upload opcional (decisão do Micael em 11/11), num bucket
 * **privado** (`capas-posts`, migration social_trip_posts) que não tem policy
 * nenhuma em storage.objects: ninguém envia, apaga nem assina com o JWT do
 * navegador. Tudo passa pelo servidor, com a chave de serviço — por isso cada
 * função recebe o cliente de lib/supabase/admin.ts (ou a fábrica dele) por
 * parâmetro, e este módulo não cria cliente nem lê variável de ambiente
 * (regras 4 e 5 do CLAUDE.md). A chave ignora a RLS: quem decide o que pode ser
 * gravado ou apagado é a checagem de caminho daqui.
 *
 * O formato é o da foto de perfil, e as regras vêm de lib/social/foto.ts, não
 * de uma cópia: `trip_posts.cover_path` guarda `<author_id>/<uuid>.(webp|jpg|png)`,
 * nunca uma URL, e um CHECK no banco exige o formato e a pasta do autor. Os
 * limites (2 MB, JPEG/PNG/WebP pelos bytes) são os mesmos, e o bucket repete os
 * dois atrás da rota.
 *
 * A tela recebe a capa como URL assinada, que vale o mesmo que a da foto (10
 * min, reaproveitada por 5) e é emitida pelo mesmo assinador
 * (`assinarCaminhos`, lib/social/avatar.ts) depois de a rota decidir que a
 * pessoa pode ver o post. Sem capa, ou com a assinatura falhando, a tela mostra
 * o fundo com o destino: uma capa que não abre não derruba o perfil.
 *
 * Erro do Storage no envio e na remoção lança um `Error` comum, com o original
 * em `cause`: `respostaDeErro` (lib/http.ts) o transforma no 500 genérico, e a
 * mensagem crua só vai ao log.
 *
 * @RF09.7 publicar viagem — capa do post
 */

export const BUCKET_CAPAS = "capas-posts"

/** Espelha o `file_size_limit` do bucket: o mesmo da foto. */
export const LIMITE_CAPA_BYTES = LIMITE_FOTO_BYTES

/** Espelha o `allowed_mime_types` do bucket: os mesmos da foto, conferidos pelos bytes com `tipoDaImagem`. */
export const TIPOS_CAPA = TIPOS_FOTO
export type TipoCapa = TipoFoto

const MENSAGENS_DE_ASSINATURA = {
  lote: "[capa do post] não foi possível assinar as capas",
  item: "[capa do post] capa não assinada",
}

/**
 * Caminho da capa nova: na pasta do autor, com um nome que não se repete e a
 * extensão do tipo detectado pelos bytes. Lança se o resultado não casar com o
 * CHECK do banco (autor que não é uuid em minúsculas): melhor falhar antes do
 * envio do que deixar um arquivo que nenhum post pode apontar.
 */
export function caminhoDaNovaCapa(authorId: string, tipo: TipoCapa): string {
  const caminho = caminhoDaNovaFoto(authorId, randomUUID(), tipo)
  if (FORMATO_CAMINHO.exec(caminho)?.[1] !== authorId) {
    throw new Error("[capa do post] autor fora do formato de uuid")
  }
  return caminho
}

/**
 * O `cover_path` que pode ser apagado com a chave de serviço: só no formato da
 * rota e na pasta do próprio autor. Qualquer outra coisa (pasta alheia, `..`,
 * subpasta, URL) devolve nulo.
 */
export function capaApagavel(coverPath: string | null | undefined, authorId: string): string | null {
  return caminhoApagavel(coverPath ?? null, authorId)
}

/**
 * Envia os bytes já conferidos para `caminho` (de `caminhoDaNovaCapa`). Sem
 * `upsert`: o nome é novo a cada envio, e um caminho que já existe é erro, não
 * sobrescrita de capa alheia. Recusa caminho fora do formato: com a chave de
 * serviço, o Storage gravaria em qualquer pasta.
 */
export async function enviarCapa(
  admin: ClienteDeServico,
  caminho: string,
  bytes: Uint8Array,
  tipo: TipoCapa,
): Promise<void> {
  if (!FORMATO_CAMINHO.test(caminho)) {
    throw new Error("[capa do post] caminho de envio fora do formato")
  }
  const { error } = await admin.storage.from(BUCKET_CAPAS).upload(caminho, bytes, { contentType: tipo, upsert: false })
  if (error) throw new Error("[capa do post] envio falhou", { cause: error })
}

/**
 * Apaga a capa do autor, se `coverPath` for dele (`capaApagavel`); o que não for
 * fica, e a função devolve `false` sem ir ao Storage. Arquivo que já não existe
 * não é erro (o Storage devolve a lista vazia): devolve `false`. Erro do Storage
 * lança — quem chama decide se a operação principal já valeu e só registra.
 *
 * @returns se um arquivo saiu do bucket.
 */
export async function removerCapa(
  admin: ClienteDeServico,
  coverPath: string | null | undefined,
  authorId: string,
): Promise<boolean> {
  const caminho = capaApagavel(coverPath, authorId)
  if (!caminho) return false
  const { data, error } = await admin.storage.from(BUCKET_CAPAS).remove([caminho])
  if (error) throw new Error("[capa do post] remoção falhou", { cause: error })
  return (data?.length ?? 0) > 0
}

/**
 * URLs assinadas das capas, em lote: mapa caminho → URL, só dos caminhos no
 * formato que foram assinados. Nulo, vazio ou fora do formato fica de fora sem
 * ir ao Storage; a pasta do autor já é garantida pelo CHECK de
 * `trip_posts.cover_path`, de onde vêm os caminhos. Nunca lança.
 *
 * Recebe a fábrica do cliente, como `assinarAvatares`: a lista de posts de um
 * perfil sem nenhuma capa não cria o cliente de serviço.
 */
export async function assinarCapas(
  criarAdmin: () => ClienteDeServico,
  caminhos: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const validos = caminhos.map((c) => (c && FORMATO_CAMINHO.test(c) ? c : null))
  return assinarCaminhos(criarAdmin, BUCKET_CAPAS, validos, MENSAGENS_DE_ASSINATURA)
}

/** Atalho para uma capa só: a URL assinada ou nulo. */
export async function assinarCapa(
  criarAdmin: () => ClienteDeServico,
  caminho: string | null | undefined,
): Promise<string | null> {
  const links = await assinarCapas(criarAdmin, [caminho])
  return (caminho && links.get(caminho)) || null
}
