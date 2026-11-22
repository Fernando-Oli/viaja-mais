import { randomUUID } from "node:crypto"
import { ErroHttp } from "@/lib/http"
import { MAXIMO_FOTOS } from "@/lib/schemas/post"
import { assinarCaminhos, type ClienteDeServico } from "./avatar"
import { FORMATO_CAMINHO, LIMITE_FOTO_BYTES, TIPOS_FOTO, caminhoApagavel, tipoDaImagem, type TipoFoto } from "./foto"
import { LADO_CAPA, TIPO_REPROCESSADO, reprocessarImagem, type ImagemReprocessada } from "./imagem"

/**
 * As fotos de um post (o carrossel, de 1 a 3; 0 a 3 no post de viagem):
 * conferir o que chegou no multipart, regerar, enviar, apagar e assinar.
 *
 * O nome do arquivo ficou "capa" porque nasceu com a capa do post de viagem
 * (11/11). Desde 18/11 (noite) o post tem fotos (`posts.photos text[]`, na
 * ordem do carrossel), e a capa virou a 1ª foto; o bucket continua o mesmo,
 * `capas-posts`, e guarda todas as fotos de post.
 *
 * O bucket é **privado** e não tem policy nenhuma em storage.objects: ninguém
 * envia, apaga nem assina com o JWT do navegador. Tudo passa pelo servidor,
 * com a chave de serviço — por isso cada função recebe o cliente de
 * lib/supabase/admin.ts (ou a fábrica dele) por parâmetro, e este módulo não
 * cria cliente nem lê variável de ambiente (regras 4 e 5 do CLAUDE.md). A
 * chave ignora a RLS: quem decide o que pode ser gravado ou apagado é a
 * checagem de caminho daqui (`FORMATO_CAMINHO` e a pasta do autor).
 *
 * **O que vai ao bucket é sempre uma imagem nova**: cada foto é conferida pela
 * assinatura dos bytes (`tipoDaImagem`, a recusa barata) e depois regerada
 * pelo sharp (`reprocessarImagem`, lib/social/imagem.ts) — WebP de até
 * `LADO_CAPA` px, sem EXIF/GPS. O caminho é `<autor>/<uuid>.webp`, o formato
 * que o CHECK de `posts.photos` exige.
 *
 * **Limites.** Cada foto até 2 MB (o `file_size_limit` do bucket); acima, 413.
 * Mais fotos que o permitido, nenhuma quando é obrigatória, campo que não é
 * arquivo ou bytes que não são JPEG/PNG/WebP: 400.
 *
 * As URLs assinadas valem o mesmo que as da foto de perfil (10 min,
 * reaproveitadas por 5) e saem do mesmo assinador (`assinarCaminhos`,
 * lib/social/avatar.ts), depois de a rota decidir que a pessoa pode ver o post.
 *
 * Erro do Storage no envio e na remoção lança um `Error` comum, com o original
 * em `cause`: `respostaDeErro` (lib/http.ts) o transforma no 500 genérico.
 *
 * @RF09.15 post com fotos · @RF09.7 fotos do post de viagem
 */

export const BUCKET_CAPAS = "capas-posts"

/** Espelha o `file_size_limit` do bucket: o mesmo da foto de perfil. */
export const LIMITE_CAPA_BYTES = LIMITE_FOTO_BYTES
/** O mesmo limite, pelo nome novo. */
export const LIMITE_FOTO_POST_BYTES = LIMITE_FOTO_BYTES

/** Espelha o `allowed_mime_types` do bucket, conferidos pelos bytes com `tipoDaImagem`. */
export const TIPOS_CAPA = TIPOS_FOTO
export type TipoCapa = TipoFoto

/** O campo do multipart que leva as fotos, repetido uma vez por foto, na ordem do carrossel. */
export const CAMPO_FOTOS = "fotos"

/** Folga do multipart (fronteiras, cabeçalhos e os campos de texto) sobre o tamanho das fotos. */
export const FOLGA_MULTIPART = 64 * 1024

const MENSAGEM_TAMANHO = "Cada foto pode ter até 2 MB"

const MENSAGENS_DE_ASSINATURA = {
  lote: "[fotos do post] não foi possível assinar as fotos",
  item: "[fotos do post] foto não assinada",
}

/**
 * Caminho de uma foto nova: na pasta do autor, com um nome que não se repete,
 * sempre `.webp` (a foto é regerada). Lança se o autor não for um uuid em
 * minúsculas: melhor falhar antes do envio do que deixar um arquivo que nenhum
 * post pode apontar.
 */
export function caminhoDaNovaFotoDoPost(autorId: string): string {
  const caminho = `${autorId}/${randomUUID()}.webp`
  if (FORMATO_CAMINHO.exec(caminho)?.[1] !== autorId) {
    throw new Error("[fotos do post] autor fora do formato de uuid")
  }
  return caminho
}

/**
 * O caminho que pode ser apagado com a chave de serviço: só no formato e na
 * pasta do próprio autor. Qualquer outra coisa (pasta alheia, `..`, subpasta,
 * URL) devolve nulo.
 */
export function fotoApagavel(caminho: string | null | undefined, autorId: string): string | null {
  return caminhoApagavel(caminho ?? null, autorId)
}

/**
 * Recusa pelo `Content-Length`, antes de montar o formulário: mais que
 * `maximo` fotos de 2 MB mais a folga já não tem como caber. Não evita a
 * leitura do corpo (o Next já o leu); poupa copiar arquivos só para descobrir
 * que eram grandes.
 */
export function conferirTamanhoDeclarado(request: Request, maximo: number = MAXIMO_FOTOS): void {
  const declarado = Number(request.headers.get("content-length") ?? 0)
  if (declarado > maximo * LIMITE_FOTO_POST_BYTES + FOLGA_MULTIPART) throw new ErroHttp(413, MENSAGEM_TAMANHO)
}

/**
 * Os bytes das fotos do campo `fotos`, na ordem em que vieram, conferidos:
 * quantidade, que cada uma é arquivo, tamanho real e tipo pelos bytes. É só a
 * conferência barata; quem decodifica de verdade é `reprocessarFotos`.
 */
export async function fotosDoFormulario(
  formulario: FormData,
  { minimo, maximo = MAXIMO_FOTOS }: { minimo: number; maximo?: number },
): Promise<Uint8Array[]> {
  const entradas = formulario.getAll(CAMPO_FOTOS)
  if (entradas.length < minimo || entradas.length > maximo) {
    const faixa = minimo === maximo ? `${minimo}` : `de ${minimo} a ${maximo}`
    throw new ErroHttp(400, `Envie ${faixa} ${maximo === 1 ? "foto" : "fotos"} no campo "${CAMPO_FOTOS}"`)
  }

  const fotos: Uint8Array[] = []
  for (const entrada of entradas) {
    if (!(entrada instanceof File) || entrada.size === 0) throw new ErroHttp(400, `Envie as fotos como arquivos no campo "${CAMPO_FOTOS}"`)
    if (entrada.size > LIMITE_FOTO_POST_BYTES) throw new ErroHttp(413, MENSAGEM_TAMANHO)
    // O tipo vem dos bytes, não do nome nem do content-type que o cliente mandou.
    const bytes = new Uint8Array(await entrada.arrayBuffer())
    if (!tipoDaImagem(bytes)) throw new ErroHttp(400, "Envie fotos JPEG, PNG ou WebP")
    fotos.push(bytes)
  }
  return fotos
}

/**
 * Regera cada foto, uma de cada vez (o sharp já usa duas threads por imagem, e
 * em série o pico de memória é o de uma foto). A primeira que o sharp recusa
 * para tudo com 400, antes de qualquer envio.
 */
export async function reprocessarFotos(fotos: readonly Uint8Array[]): Promise<ImagemReprocessada[]> {
  const regeradas: ImagemReprocessada[] = []
  for (const foto of fotos) {
    regeradas.push(await reprocessarImagem(foto, { lado: LADO_CAPA, limiteBytes: LIMITE_FOTO_POST_BYTES }))
  }
  return regeradas
}

/**
 * Envia os bytes já regerados para `caminho`. Sem `upsert`: o nome é novo a
 * cada envio, e um caminho que já existe é erro, não sobrescrita. Recusa
 * caminho fora do formato: com a chave de serviço, o Storage gravaria em
 * qualquer pasta.
 */
export async function enviarFotoDoPost(admin: ClienteDeServico, caminho: string, bytes: Uint8Array): Promise<void> {
  if (!FORMATO_CAMINHO.test(caminho)) throw new Error("[fotos do post] caminho de envio fora do formato")
  const { error } = await admin.storage
    .from(BUCKET_CAPAS)
    .upload(caminho, bytes, { contentType: TIPO_REPROCESSADO, upsert: false })
  if (error) throw new Error("[fotos do post] envio falhou", { cause: error })
}

/**
 * Envia as fotos, na ordem, para a pasta do autor e devolve os caminhos na
 * mesma ordem. Se um envio falhar, apaga os que já subiram (sem post nenhum
 * apontando para eles, ficariam órfãos) e lança o erro do envio.
 */
export async function enviarFotos(
  admin: ClienteDeServico,
  autorId: string,
  fotos: readonly ImagemReprocessada[],
): Promise<string[]> {
  const enviados: string[] = []
  try {
    for (const foto of fotos) {
      const caminho = caminhoDaNovaFotoDoPost(autorId)
      await enviarFotoDoPost(admin, caminho, foto.bytes)
      enviados.push(caminho)
    }
  } catch (erro) {
    await removerFotosSemFalhar(admin, enviados, autorId)
    throw erro
  }
  return enviados
}

/**
 * Apaga as fotos do autor que estão no formato e na pasta dele
 * (`fotoApagavel`); as outras ficam, sem ir ao Storage. Arquivo que já não
 * existe não é erro. Erro do Storage lança.
 *
 * @returns quantos arquivos saíram do bucket.
 */
export async function removerFotosDoPost(
  admin: ClienteDeServico,
  caminhos: readonly (string | null | undefined)[],
  autorId: string,
): Promise<number> {
  const apagaveis = Array.from(new Set(caminhos.flatMap((c) => fotoApagavel(c, autorId) ?? [])))
  if (apagaveis.length === 0) return 0
  const { data, error } = await admin.storage.from(BUCKET_CAPAS).remove(apagaveis)
  if (error) throw new Error("[fotos do post] remoção falhou", { cause: error })
  return data?.length ?? 0
}

/**
 * Como `removerFotosDoPost`, para quando a operação principal já decidiu o
 * resultado (o post saiu, ou a troca já valeu): a falha só vai ao log, nunca à
 * resposta.
 */
export async function removerFotosSemFalhar(
  admin: ClienteDeServico,
  caminhos: readonly (string | null | undefined)[],
  autorId: string,
): Promise<void> {
  if (caminhos.length === 0) return
  try {
    const apagados = await removerFotosDoPost(admin, caminhos, autorId)
    if (apagados < caminhos.length) console.error("[fotos do post] nem todas as fotos foram apagadas", caminhos)
  } catch (erro) {
    console.error("[fotos do post] fotos não apagadas", caminhos, erro)
  }
}

/**
 * URLs assinadas das fotos, em lote: mapa caminho → URL, só dos caminhos no
 * formato que foram assinados. Nulo, vazio ou fora do formato fica de fora sem
 * ir ao Storage; a pasta do autor já é garantida pelo CHECK de `posts.photos`,
 * de onde vêm os caminhos. Nunca lança.
 *
 * Recebe a fábrica do cliente, como `assinarAvatares`: uma resposta sem foto
 * nenhuma não cria o cliente de serviço.
 */
export async function assinarFotos(
  criarAdmin: () => ClienteDeServico,
  caminhos: readonly (string | null | undefined)[],
): Promise<Map<string, string>> {
  const validos = caminhos.map((c) => (c && FORMATO_CAMINHO.test(c) ? c : null))
  return assinarCaminhos(criarAdmin, BUCKET_CAPAS, validos, MENSAGENS_DE_ASSINATURA)
}
