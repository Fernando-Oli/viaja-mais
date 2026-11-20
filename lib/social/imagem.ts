import sharp, { type OutputInfo } from "sharp"
import { ErroHttp } from "@/lib/http"

/**
 * Reprocessamento de imagem enviada pelo usuário, no servidor, com o `sharp`:
 * a foto de perfil (app/api/social/perfil/foto) e a capa do post
 * (app/api/social/viagens/[tripId]/post/capa) passam por aqui antes de ir ao
 * Storage. É a decisão registrada em docs/plans/S04-M-foto-perfil.md (ação 2
 * dos riscos da foto) e confirmada pelo Micael em 18/11 para as duas rotas.
 *
 * **Por que reprocessar, e não só conferir os primeiros bytes.** `tipoDaImagem`
 * (lib/social/foto.ts) olha só a assinatura: um arquivo que começa com
 * `FF D8 FF` e traz qualquer coisa depois passava, e uma foto de celular ia ao
 * bucket com o EXIF inteiro — GPS de onde foi tirada, modelo do aparelho, data
 * e hora. Aqui a imagem é decodificada de verdade e uma imagem **nova** é
 * gerada a partir dos pixels: o que não é pixel (EXIF, GPS, XMP, perfil ICC,
 * comentário, bytes anexados depois do fim da imagem) não tem como sobreviver.
 * A conferência pela assinatura continua antes, nas rotas, porque é barata e
 * recusa o óbvio sem acordar o decodificador.
 *
 * **O que sai.** Sempre WebP, sem `withMetadata`/`keepExif` (o padrão do sharp
 * é não copiar metadado nenhum), girado conforme o `Orientation` do EXIF — que
 * vai embora com o resto, então a rotação tem de ser aplicada nos pixels — e
 * reduzido para caber num quadrado de `lado` × `lado`, sem ampliar a imagem
 * pequena.
 *
 * **Limites contra bomba de descompressão.** O arquivo já chega com no máximo
 * 2 MB, mas 2 MB de PNG liso viram dezenas de milhares de pixels por lado.
 * Duas barreiras, ambas pelo cabeçalho, antes de alocar um pixel:
 *
 * - o `limitInputPixels` recusa a imagem com pixels demais
 *   (`LIMITE_PIXELS_ENTRADA`);
 * - o custo decodificado (`custoDecodificado`: largura × altura × canais ×
 *   bytes por canal) recusa a que cabe no limite de pixels mas pesa o dobro
 *   por pixel. Só o limite de pixels deixava passar um PNG RGBA de 16 bits de
 *   6300×6300 (39,7 MP, 300 KB no disco), que decodifica em 303 MiB; medido
 *   em 18/11, uma única requisição subia o pico de memória do processo em
 *   324 MB. Recusado pelo custo, sobe 1 MB (ver `LIMITE_BYTES_DECODIFICADOS`).
 *
 * O `failOn: "error"` recusa erro do decodificador — o PNG ou o JPEG cortado
 * no meio dos pixels — e deixa passar o aviso (o "bytes estranhos antes do
 * marcador" comum em JPEG de câmera), para não recusar foto legítima. Ele
 * **não** recusa todo arquivo truncado: um PNG com os pixels inteiros e sem o
 * chunk final (IEND) é aceito. Isso não é risco, porque o que vai ao bucket é
 * sempre uma imagem nova, gerada dos pixels decodificados — o arquivo recebido,
 * inteiro ou não, nunca é gravado.
 *
 * **Configuração global do sharp** (vale para o processo todo; neste projeto o
 * sharp só roda aqui, porque o `next/image` está com `unoptimized: true`):
 *
 * - `sequentialRead: true` em cada entrada: já é o padrão do sharp 0.35, mas
 *   fica explícito, porque é o que deixa o libvips ler o arquivo de cima para
 *   baixo, em faixas, em vez de pedir a imagem inteira na memória — e um
 *   padrão de biblioteca pode mudar numa atualização.
 * - `sharp.concurrency(2)`: o padrão é uma thread do libvips por núcleo, por
 *   imagem, e cada thread aloca o próprio buffer de trabalho. Medido em 18/11,
 *   com um PNG RGBA legítimo de 6000×6000: o pico de memória subia 181 MB com
 *   12 threads e 95 MB com 2, no mesmo tempo (0,7 s). O número de imagens
 *   processadas ao mesmo tempo continua limitado pelo pool do libuv (4); o que
 *   cai é o custo de cada uma. É o que o próprio Next faz no otimizador de
 *   imagem (núcleos ÷ 2 em produção).
 * - `sharp.cache(false)`: o cache do libvips guarda até 50 MB de resultados
 *   para reaproveitar quando a mesma entrada volta. Aqui cada envio é um
 *   arquivo novo: o cache nunca acerta e só segura memória entre requisições.
 *
 * O limite de **quantos** envios cada pessoa faz é das rotas
 * (`exigirLimite(supabase, LIMITES.fotoPerfil)`), não daqui.
 *
 * **Erros.** Tudo o que o sharp recusa vira `ErroHttp(400)` com mensagem
 * amigável; a mensagem crua da lib (que cita o libvips e o decodificador) nunca
 * vai à resposta.
 *
 * Função pura de servidor: sem I/O, sem cliente Supabase, sem variável de
 * ambiente. O sharp é módulo nativo do Node — o Next 16 já o põe na lista de
 * `serverExternalPackages` e as rotas rodam no runtime `nodejs` (o padrão), sem
 * configuração extra.
 *
 * @RF02.2 foto de perfil · @RF09.7 capa do post
 */

/** O WebP é o único formato de saída. */
export const TIPO_REPROCESSADO = "image/webp" as const

/** Lado da foto de perfil: a tela já recorta em 512×512 (lib/social/foto.ts). */
export const LADO_FOTO = 512

/**
 * Lado da capa do post. O cartão mostra a capa na largura da coluna do feed e
 * do perfil (até ~800 px de CSS); 1600 cobre essa largura em tela de densidade
 * 2x sem ampliar, e um WebP de 1600 px de foto real fica na casa das centenas de
 * KB — longe dos 2 MB do bucket. Mais que isso só pesaria o download de quem
 * rola o feed, sem ganho visível.
 */
export const LADO_CAPA = 1600

/**
 * Teto de pixels da imagem de entrada: 40 MP. Cobre com folga a foto de
 * celular que cabe em 2 MB (12 a 24 MP, até 48 MP em JPEG bem comprimido no
 * limite) e recusa, pelo cabeçalho, a imagem lisa de 2 MB que se declara com
 * centenas de megapixels. O padrão do sharp é 268 MP (16383²), que num PNG
 * RGBA decodificado passa de 1 GB de memória por envio.
 */
export const LIMITE_PIXELS_ENTRADA = 40_000_000

/**
 * Teto do custo decodificado da entrada: 160 MB, o de uma imagem RGBA de 8 bits
 * no limite de pixels (40 MP × 4 canais × 1 byte). Assim, toda foto de 8 bits
 * que o `limitInputPixels` já aceitava continua aceita — JPEG de celular é
 * sempre 8 bits —, e o teto só pega o que custa mais por pixel: o PNG de 16
 * bits por canal, que passa a valer até 20 MP em RGBA ou 26 MP em RGB. Uma
 * foto de 16 bits maior que isso é rara para capa ou perfil e, exportada em 8
 * bits, passa.
 */
export const LIMITE_BYTES_DECODIFICADOS = LIMITE_PIXELS_ENTRADA * 4

/**
 * Bytes por canal de cada `depth` do libvips. JPEG e WebP são sempre `uchar`;
 * PNG pode ser `ushort` (16 bits). Os outros não saem desses três formatos,
 * mas estão aqui para a conta nunca subestimar.
 */
const BYTES_POR_CANAL: Record<string, number> = {
  uchar: 1,
  char: 1,
  ushort: 2,
  short: 2,
  uint: 4,
  int: 4,
  float: 4,
  complex: 8,
  double: 8,
  dpcomplex: 16,
}

/** `depth` que o libvips não informou ou que não está na tabela: conta como o pior caso. */
const BYTES_POR_CANAL_DESCONHECIDO = 16

/**
 * Quanto a imagem ocupa decodificada, em bytes, só pelo cabeçalho:
 * largura × altura × canais × bytes por canal. `null` quando o cabeçalho não
 * traz as dimensões (a imagem não é legível).
 */
export function custoDecodificado(meta: {
  width?: number
  height?: number
  channels?: number
  depth?: string
}): number | null {
  const { width, height, channels, depth } = meta
  if (!width || !height || !channels) return null
  const porCanal = (depth && BYTES_POR_CANAL[depth]) || BYTES_POR_CANAL_DESCONHECIDO
  return width * height * channels * porCanal
}

/** Threads do libvips por imagem (ver o comentário do módulo). */
const THREADS_POR_IMAGEM = 2

// Global do processo, aplicada uma vez ao carregar o módulo. Só reduz: se
// alguém já configurou menos threads, fica como está.
if (sharp.concurrency() > THREADS_POR_IMAGEM) sharp.concurrency(THREADS_POR_IMAGEM)
sharp.cache(false)

/** Qualidade do WebP: a do padrão do sharp, que não mostra perda em foto. */
export const QUALIDADE_WEBP = 80

/** Formatos que o decodificador pode ter reconhecido: os mesmos de `TIPOS_FOTO`. */
const FORMATOS_ACEITOS = new Set(["jpeg", "png", "webp"])

const MENSAGEM_ILEGIVEL = "Não foi possível ler a imagem. Envie uma foto JPEG, PNG ou WebP válida."
const MENSAGEM_PIXELS = "A imagem tem resolução grande demais. Envie uma foto menor."
const MENSAGEM_TAMANHO_FINAL = "A imagem ficou grande demais depois de otimizada. Envie uma foto menor."
const MENSAGEM_CUSTO = "A imagem é pesada demais para processar. Envie uma foto menor ou salva em 8 bits por cor."

export type OpcoesDoReprocessamento = {
  /** Lado do quadrado em que a imagem tem de caber, em pixels. */
  lado: number
  /**
   * Tamanho máximo do WebP gerado, em bytes — o `file_size_limit` do bucket.
   * Passou dele (imagem cheia de ruído, por exemplo), é 400: o bucket
   * recusaria do mesmo jeito, mas como um 500 sem explicação.
   */
  limiteBytes?: number
}

export type ImagemReprocessada = {
  bytes: Uint8Array
  tipo: typeof TIPO_REPROCESSADO
  largura: number
  altura: number
}

/** O sharp lança `Error` comum; o de pixels demais é o único que pede outra mensagem. */
function recusa(erro: unknown): ErroHttp {
  const mensagem = erro instanceof Error ? erro.message : ""
  return new ErroHttp(400, /pixel limit/i.test(mensagem) ? MENSAGEM_PIXELS : MENSAGEM_ILEGIVEL)
}

/**
 * Decodifica `bytes` e devolve uma imagem nova: WebP, sem metadado, girada pelo
 * EXIF e dentro de `lado` × `lado`. Lança `ErroHttp(400)` se a entrada não for
 * uma imagem JPEG, PNG ou WebP inteira e legível.
 */
export async function reprocessarImagem(
  bytes: Uint8Array,
  { lado, limiteBytes }: OpcoesDoReprocessamento,
): Promise<ImagemReprocessada> {
  if (!Number.isInteger(lado) || lado <= 0) throw new Error("[imagem] lado inválido")

  const entrada = () =>
    sharp(bytes, { limitInputPixels: LIMITE_PIXELS_ENTRADA, failOn: "error", sequentialRead: true })

  let saida: { data: Buffer; info: OutputInfo }
  try {
    // O formato vem do decodificador, não da assinatura que a rota conferiu: o
    // sharp também abriria GIF, TIFF, AVIF e SVG, que o bucket não aceita.
    // `metadata()` lê só o cabeçalho: nada é decodificado até o custo passar.
    const meta = await entrada().metadata()
    if (!meta.format || !FORMATOS_ACEITOS.has(meta.format)) throw new ErroHttp(400, MENSAGEM_ILEGIVEL)

    const custo = custoDecodificado(meta)
    if (custo === null) throw new ErroHttp(400, MENSAGEM_ILEGIVEL)
    // Pixels primeiro, para a mensagem certa: o `limitInputPixels` recusaria
    // do mesmo jeito, mas só ao decodificar. Ele continua ali como segunda trava.
    if ((meta.width ?? 0) * (meta.height ?? 0) > LIMITE_PIXELS_ENTRADA) throw new ErroHttp(400, MENSAGEM_PIXELS)
    if (custo > LIMITE_BYTES_DECODIFICADOS) throw new ErroHttp(400, MENSAGEM_CUSTO)

    saida = await entrada()
      .rotate()
      .resize(lado, lado, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: QUALIDADE_WEBP })
      .toBuffer({ resolveWithObject: true })
  } catch (erro) {
    if (erro instanceof ErroHttp) throw erro
    throw recusa(erro)
  }

  if (limiteBytes !== undefined && saida.data.byteLength > limiteBytes) {
    throw new ErroHttp(400, MENSAGEM_TAMANHO_FINAL)
  }

  return {
    bytes: new Uint8Array(saida.data.buffer, saida.data.byteOffset, saida.data.byteLength),
    tipo: TIPO_REPROCESSADO,
    largura: saida.info.width,
    altura: saida.info.height,
  }
}
