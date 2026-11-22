import sharp from "sharp"
import { crc32 } from "node:zlib"

/**
 * Imagens de verdade para os testes do reprocessamento (lib/social/imagem.ts) e
 * das rotas que gravam imagem: a foto de perfil e a capa do post.
 *
 * Geradas na hora com o próprio sharp, sem arquivo binário no repositório. As
 * que carregam metadado levam marcas em texto (`MARCAS`) que dá para procurar
 * nos bytes: se uma delas aparecer na saída, o metadado vazou.
 *
 * @RF02.2 @RF09.7
 */

/** Texto que só existe nos metadados das imagens de teste. */
export const MARCAS = {
  exif: "SEGREDO-EXIF",
  gps: "SEGREDO-GPS",
  xmp: "SEGREDO-XMP",
  png: "SEGREDO-PNG",
} as const

const paraUint8 = (b: Buffer) => new Uint8Array(b.buffer, b.byteOffset, b.byteLength)

function lisa(largura: number, altura: number, cor = "#3a7bd5") {
  return sharp({ create: { width: largura, height: altura, channels: 3, background: cor } })
}

/**
 * JPEG como o de um celular: EXIF com descrição e aparelho, bloco de GPS com a
 * posição (Alto Paraíso, GO) e um XMP. `orientacao` grava o `Orientation` do EXIF.
 */
export async function jpegComGps({ largura = 64, altura = 48, orientacao }: { largura?: number; altura?: number; orientacao?: number } = {}) {
  let imagem = lisa(largura, altura).jpeg({ quality: 90 })
  imagem = imagem.withExif({
    IFD0: { ImageDescription: MARCAS.exif, Make: "Celular de Teste", Model: "Modelo X" },
    IFD3: {
      GPSMapDatum: MARCAS.gps,
      GPSLatitudeRef: "S",
      GPSLatitude: "14/1 8/1 0/1",
      GPSLongitudeRef: "W",
      GPSLongitude: "47/1 31/1 0/1",
    },
  })
  imagem = imagem.withXmp(`<x:xmpmeta xmlns:x="adobe:ns:meta/"><desc>${MARCAS.xmp}</desc></x:xmpmeta>`)
  if (orientacao !== undefined) imagem = imagem.withMetadata({ orientation: orientacao })
  return paraUint8(await imagem.toBuffer())
}

/**
 * JPEG 40×20: metade esquerda vermelha, direita azul, com o `Orientation` dado.
 * Com 6 (girar 90° no sentido horário), a imagem certa é 20×40 com o vermelho
 * em cima.
 */
export async function jpegMeioAMeio(orientacao: number) {
  const vermelho = { create: { width: 20, height: 20, channels: 3 as const, background: "#ff0000" } }
  const b = await lisa(40, 20, "#0000ff")
    .composite([{ input: vermelho, left: 0, top: 0 }])
    .jpeg({ quality: 95 })
    .withMetadata({ orientation: orientacao })
    .toBuffer()
  return paraUint8(b)
}

export async function pngLiso(largura: number, altura: number) {
  return paraUint8(await lisa(largura, altura).png().toBuffer())
}

export async function webpLiso(largura: number, altura: number) {
  return paraUint8(await lisa(largura, altura).webp().toBuffer())
}

/** Chunk PNG: tamanho, tipo, dados e CRC do tipo mais os dados. */
function chunkPng(tipo: string, dados: Uint8Array) {
  const corpo = Buffer.concat([Buffer.from(tipo, "latin1"), dados])
  const chunk = Buffer.alloc(8 + dados.byteLength + 4)
  chunk.writeUInt32BE(dados.byteLength, 0)
  corpo.copy(chunk, 4)
  chunk.writeUInt32BE(crc32(corpo), 8 + dados.byteLength)
  return chunk
}

/**
 * PNG válido de exatamente `tamanho` bytes: uma imagem pequena com um chunk
 * privado e opcional (`prVt`, que o decodificador ignora) cheio de `MARCAS.png`
 * antes do IEND. Serve para o limite de 2 MB com imagem de verdade — e prova
 * que chunk desconhecido também não chega ao bucket.
 */
export async function pngComTamanho(tamanho: number) {
  const base = Buffer.from(await pngLiso(32, 32))
  const iend = base.subarray(base.length - 12)
  const semIend = base.subarray(0, base.length - 12)
  const dadosLen = tamanho - base.length - 12
  if (dadosLen < 0) throw new Error("tamanho menor que o PNG base")
  const dados = Buffer.alloc(dadosLen, MARCAS.png)
  const png = Buffer.concat([semIend, chunkPng("prVt", dados), iend])
  if (png.length !== tamanho) throw new Error(`PNG com ${png.length} bytes, esperado ${tamanho}`)
  return paraUint8(png)
}

/** Bytes que imitam o começo de um JPEG e trazem só lixo depois. */
export const POLIGLOTA_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode("<?php system($_GET['c']); ?>".repeat(8))])

export function contemTexto(bytes: Uint8Array, texto: string) {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(Buffer.from(texto, "latin1"))
}

/**
 * Os chunks de um WebP (RIFF): os FourCC na ordem e as flags do VP8X, se houver.
 * Lança se o arquivo não for um RIFF/WEBP bem formado.
 */
export function chunksDoWebp(bytes: Uint8Array) {
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (b.toString("latin1", 0, 4) !== "RIFF" || b.toString("latin1", 8, 12) !== "WEBP") throw new Error("não é WebP")
  if (b.readUInt32LE(4) + 8 !== b.length) throw new Error("tamanho do RIFF não confere")
  const chunks: string[] = []
  let flagsVp8x: number | null = null
  for (let i = 12; i < b.length; ) {
    const tipo = b.toString("latin1", i, i + 4)
    const tamanho = b.readUInt32LE(i + 4)
    if (tipo === "VP8X") flagsVp8x = b[i + 8]
    chunks.push(tipo)
    i += 8 + tamanho + (tamanho % 2)
  }
  return { chunks, flagsVp8x }
}
