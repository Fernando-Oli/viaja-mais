import { describe, it, expect, beforeAll, vi } from "vitest"
import { crc32, deflateSync } from "node:zlib"
import sharp from "sharp"
import { ErroHttp } from "@/lib/http"
import {
  LADO_CAPA,
  LADO_FOTO,
  LIMITE_BYTES_DECODIFICADOS,
  LIMITE_PIXELS_ENTRADA,
  TIPO_REPROCESSADO,
  custoDecodificado,
  reprocessarImagem,
} from "@/lib/social/imagem"
import { LIMITE_FOTO_BYTES } from "@/lib/social/foto"
import {
  MARCAS,
  POLIGLOTA_JPEG,
  chunksDoWebp,
  contemTexto,
  jpegComGps,
  jpegMeioAMeio,
  pngComTamanho,
  pngLiso,
  webpLiso,
} from "../fixtures/imagens"

/**
 * @RF02.2 @RF09.7 — reprocessamento da imagem enviada (foto de perfil e capa do
 * post) com o sharp de verdade, sem mock: o que sai é um WebP novo, sem EXIF,
 * GPS nem XMP, girado pelo EXIF e dentro do lado pedido; o que não é imagem
 * inteira é 400 com mensagem amigável.
 */

/** Só estes chunks podem existir no WebP gerado: imagem, alfa e o cabeçalho estendido. */
const CHUNKS_DE_IMAGEM = new Set(["VP8 ", "VP8L", "VP8X", "ALPH"])
/** Bits do VP8X que anunciam ICC (0x20), EXIF (0x08) e XMP (0x04). */
const FLAGS_DE_METADADO = 0x20 | 0x08 | 0x04

async function recusa(promessa: Promise<unknown>) {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  )
  expect(erro).toBeInstanceOf(ErroHttp)
  return erro as ErroHttp
}

/** Cor do pixel (x, y) da imagem decodificada. */
async function pixel(bytes: Uint8Array, x: number, y: number) {
  const { data, info } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
  const i = (y * info.width + x) * info.channels
  return [data[i], data[i + 1], data[i + 2]]
}

let jpegComMetadados: Uint8Array

beforeAll(async () => {
  jpegComMetadados = await jpegComGps({ largura: 64, altura: 48 })
})

describe("reprocessarImagem — sai um WebP novo, sem metadado (@RF02.2 @RF09.7)", () => {
  it("a imagem de teste tem mesmo EXIF, GPS e XMP na entrada", async () => {
    // Sem isto, o teste abaixo passaria com uma entrada que já viesse limpa.
    const meta = await sharp(jpegComMetadados).metadata()
    expect(meta.exif).toBeDefined()
    expect(meta.xmp).toBeDefined()
    for (const marca of [MARCAS.exif, MARCAS.gps, MARCAS.xmp]) expect(contemTexto(jpegComMetadados, marca)).toBe(true)
  })

  it("JPEG com GPS vira WebP sem chunk de EXIF, XMP ou ICC e sem nenhum texto do metadado", async () => {
    const saida = await reprocessarImagem(jpegComMetadados, { lado: LADO_FOTO })

    expect(saida.tipo).toBe(TIPO_REPROCESSADO)
    expect(saida.tipo).toBe("image/webp")
    const { chunks, flagsVp8x } = chunksDoWebp(saida.bytes)
    expect(chunks.filter((c) => !CHUNKS_DE_IMAGEM.has(c))).toEqual([])
    expect((flagsVp8x ?? 0) & FLAGS_DE_METADADO).toBe(0)
    for (const marca of [MARCAS.exif, MARCAS.gps, MARCAS.xmp, "Exif", "GPS", "xmpmeta", "Celular de Teste"]) {
      expect(contemTexto(saida.bytes, marca)).toBe(false)
    }

    const meta = await sharp(saida.bytes).metadata()
    expect(meta.format).toBe("webp")
    expect(meta.exif).toBeUndefined()
    expect(meta.xmp).toBeUndefined()
    expect(meta.icc).toBeUndefined()
  })

  it("devolve as dimensões e um Uint8Array com exatamente os bytes do WebP", async () => {
    const saida = await reprocessarImagem(jpegComMetadados, { lado: LADO_FOTO })

    expect(saida.bytes).toBeInstanceOf(Uint8Array)
    expect([saida.largura, saida.altura]).toEqual([64, 48])
    const meta = await sharp(saida.bytes).metadata()
    expect([meta.width, meta.height]).toEqual([64, 48])
  })

  it.each([
    ["PNG", () => pngLiso(40, 30)],
    ["WebP", () => webpLiso(40, 30)],
  ])("%s também sai como WebP", async (_nome, gerar) => {
    const saida = await reprocessarImagem(await gerar(), { lado: LADO_FOTO })

    expect((await sharp(saida.bytes).metadata()).format).toBe("webp")
  })

  it("chunk desconhecido do PNG não sobrevive", async () => {
    const png = await pngComTamanho(4096)
    expect(contemTexto(png, MARCAS.png)).toBe(true)

    const saida = await reprocessarImagem(png, { lado: LADO_FOTO })

    expect(contemTexto(saida.bytes, MARCAS.png)).toBe(false)
  })

  it("bytes anexados depois do fim do JPEG (poliglota JPEG+script) não sobrevivem", async () => {
    const anexo = new TextEncoder().encode("<script>alert(1)</script>PK\u0003\u0004")
    const poliglota = new Uint8Array([...jpegComMetadados, ...anexo])

    const saida = await reprocessarImagem(poliglota, { lado: LADO_FOTO })

    expect(contemTexto(saida.bytes, "<script>")).toBe(false)
  })
})

describe("reprocessarImagem — tamanho e orientação (@RF02.2 @RF09.7)", () => {
  it("PNG grande é reduzido para caber no lado da capa, mantendo a proporção", async () => {
    const saida = await reprocessarImagem(await pngLiso(3200, 2000), { lado: LADO_CAPA })

    expect(LADO_CAPA).toBe(1600)
    expect([saida.largura, saida.altura]).toEqual([1600, 1000])
  })

  it("a imagem em pé é limitada pela altura", async () => {
    const saida = await reprocessarImagem(await pngLiso(600, 1200), { lado: LADO_FOTO })

    expect([saida.largura, saida.altura]).toEqual([256, 512])
  })

  it("JPEG com GPS maior que o lado da foto sai dentro de 512×512 e sem metadado", async () => {
    const grande = await jpegComGps({ largura: 2000, altura: 1500 })

    const saida = await reprocessarImagem(grande, { lado: LADO_FOTO })

    expect([saida.largura, saida.altura]).toEqual([512, 384])
    expect(contemTexto(saida.bytes, MARCAS.gps)).toBe(false)
  })

  it("imagem menor que o lado não é ampliada", async () => {
    const saida = await reprocessarImagem(await pngLiso(100, 80), { lado: LADO_CAPA })

    expect([saida.largura, saida.altura]).toEqual([100, 80])
  })

  it("a rotação do EXIF é aplicada nos pixels, já que o EXIF sai", async () => {
    // Orientation 6: a câmera gravou deitado; quem vê deve ver em pé, com a
    // metade vermelha (a da esquerda no arquivo) em cima.
    const entrada = await jpegMeioAMeio(6)
    expect((await sharp(entrada).metadata()).orientation).toBe(6)

    const saida = await reprocessarImagem(entrada, { lado: LADO_FOTO })

    expect([saida.largura, saida.altura]).toEqual([20, 40])
    const [r, , b] = await pixel(saida.bytes, 10, 5)
    expect(r).toBeGreaterThan(200)
    expect(b).toBeLessThan(60)
    const [r2, , b2] = await pixel(saida.bytes, 10, 35)
    expect(r2).toBeLessThan(60)
    expect(b2).toBeGreaterThan(200)
    expect((await sharp(saida.bytes).metadata()).orientation).toBeUndefined()
  })

  it("sem Orientation, a imagem não é girada", async () => {
    const saida = await reprocessarImagem(await jpegMeioAMeio(1), { lado: LADO_FOTO })

    expect([saida.largura, saida.altura]).toEqual([40, 20])
  })
})

describe("reprocessarImagem — o que não é imagem inteira é 400 (@RF02.2 @RF09.7)", () => {
  it("poliglota: começa como JPEG (FF D8 FF) e traz lixo depois", async () => {
    const erro = await recusa(reprocessarImagem(POLIGLOTA_JPEG, { lado: LADO_FOTO }))

    expect(erro.status).toBe(400)
    expect(erro.message).toBe("Não foi possível ler a imagem. Envie uma foto JPEG, PNG ou WebP válida.")
    // A mensagem crua do libvips não vaza.
    expect(erro.message).not.toMatch(/vips|jpeg image|corrupt header/i)
  })

  it.each([
    ["JPEG", async () => sharp(ruido(300, 300), { raw: { width: 300, height: 300, channels: 3 } }).jpeg().toBuffer()],
    ["PNG", async () => sharp(ruido(300, 300), { raw: { width: 300, height: 300, channels: 3 } }).png().toBuffer()],
  ])("%s truncado no meio dos pixels", async (_nome, gerar) => {
    const inteiro = await gerar()
    const truncado = new Uint8Array(inteiro.subarray(0, Math.floor(inteiro.length * 0.7)))

    const erro = await recusa(reprocessarImagem(truncado, { lado: LADO_FOTO }))

    expect(erro.status).toBe(400)
    expect(erro.message).not.toMatch(/vips|libpng|premature/i)
  })

  it.each([
    ["PNG de 12 bytes (só a assinatura)", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])],
    ["texto", new TextEncoder().encode("isto não é uma imagem")],
    ["vazio", new Uint8Array()],
  ])("%s", async (_nome, bytes) => {
    expect((await recusa(reprocessarImagem(bytes, { lado: LADO_FOTO }))).status).toBe(400)
  })

  it("formato que o sharp abre mas o bucket não aceita (GIF) é 400", async () => {
    const gif = new Uint8Array(await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).gif().toBuffer())

    const erro = await recusa(reprocessarImagem(gif, { lado: LADO_FOTO }))

    expect(erro.status).toBe(400)
    expect(erro.message).toContain("JPEG, PNG ou WebP")
  })

  it("bomba de descompressão: PNG liso acima do teto de pixels é recusado pelo cabeçalho", async () => {
    // 7000 × 7000 = 49 MP > 40 MP, num PNG liso de poucas centenas de KB.
    const bomba = await pngLiso(7000, 7000)
    expect(bomba.byteLength).toBeLessThan(LIMITE_FOTO_BYTES)
    expect(7000 * 7000).toBeGreaterThan(LIMITE_PIXELS_ENTRADA)

    const erro = await recusa(reprocessarImagem(bomba, { lado: LADO_CAPA }))

    expect(erro.status).toBe(400)
    expect(erro.message).toBe("A imagem tem resolução grande demais. Envie uma foto menor.")
  })

  it("bomba de 16 bits: PNG RGBA de 6300×6300 cabe no teto de pixels, mas é recusado pelo custo, sem decodificar", async () => {
    // 39,7 MP < 40 MP: só o limite de pixels deixava passar. Decodificado,
    // seriam 6300 × 6300 × 4 canais × 2 bytes = 303 MiB.
    const bomba = pngRgba16Liso(6300, 6300)
    expect(bomba.byteLength).toBeLessThan(LIMITE_FOTO_BYTES)
    expect(6300 * 6300).toBeLessThan(LIMITE_PIXELS_ENTRADA)
    const meta = await sharp(bomba).metadata()
    expect([meta.channels, meta.depth]).toEqual([4, "ushort"])
    expect(custoDecodificado(meta)).toBe(6300 * 6300 * 4 * 2)

    // Sem decodificar: o que decodifica é `toBuffer`, e a resposta sai antes de
    // ele ser chamado. Num PNG liso desse tamanho o decodificador levaria segundos.
    const espiao = vi.spyOn(sharp.prototype, "toBuffer")
    const inicio = Date.now()
    const erro = await recusa(reprocessarImagem(bomba, { lado: LADO_CAPA }))

    expect(erro.status).toBe(400)
    expect(erro.message).toBe("A imagem é pesada demais para processar. Envie uma foto menor ou salva em 8 bits por cor.")
    expect(espiao).not.toHaveBeenCalled()
    expect(Date.now() - inicio).toBeLessThan(500)
    espiao.mockRestore()
  })

  it("PNG RGBA de 8 bits no limite do custo ainda passa (o teto não recusa foto de 8 bits dentro dos 40 MP)", async () => {
    // 2000 × 2000 × 4 × 1 = 16 MB: bem abaixo do teto. A borda exata é provada em `custoDecodificado`.
    const saida = await reprocessarImagem(await pngLiso(2000, 2000), { lado: LADO_CAPA })

    expect([saida.largura, saida.altura]).toEqual([1600, 1600])
  })

  it("PNG de 16 bits pequeno passa: o teto é de custo, não de profundidade", async () => {
    const saida = await reprocessarImagem(pngRgba16Liso(64, 48), { lado: LADO_FOTO })

    expect([saida.largura, saida.altura]).toEqual([64, 48])
    expect((await sharp(saida.bytes).metadata()).format).toBe("webp")
  })

  it("WebP gerado acima do limite de bytes é 400, não vai ao bucket para virar 500", async () => {
    const erro = await recusa(reprocessarImagem(await pngLiso(200, 200), { lado: LADO_FOTO, limiteBytes: 10 }))

    expect(erro.status).toBe(400)
    expect(erro.message).toContain("grande demais depois de otimizada")
  })

  it("dentro do limite de bytes, passa", async () => {
    const saida = await reprocessarImagem(await pngLiso(200, 200), { lado: LADO_FOTO, limiteBytes: LIMITE_FOTO_BYTES })

    expect(saida.bytes.byteLength).toBeLessThanOrEqual(LIMITE_FOTO_BYTES)
  })

  it.each([0, -1, 1.5, Number.NaN])("lado inválido (%s) é erro de programação, não 400", async (lado) => {
    const erro = await reprocessarImagem(jpegComMetadados, { lado }).catch((e: unknown) => e)

    expect(erro).toBeInstanceOf(Error)
    expect(erro).not.toBeInstanceOf(ErroHttp)
  })
})

describe("custoDecodificado — o custo pelo cabeçalho (@RF02.2 @RF09.7)", () => {
  it("largura × altura × canais × bytes por canal", () => {
    expect(custoDecodificado({ width: 10, height: 20, channels: 3, depth: "uchar" })).toBe(600)
    expect(custoDecodificado({ width: 10, height: 20, channels: 4, depth: "ushort" })).toBe(1600)
    expect(custoDecodificado({ width: 10, height: 20, channels: 1, depth: "float" })).toBe(800)
    expect(custoDecodificado({ width: 1, height: 1, channels: 1, depth: "dpcomplex" })).toBe(16)
  })

  it("depth ausente ou desconhecido conta como o pior caso, nunca subestima", () => {
    expect(custoDecodificado({ width: 10, height: 10, channels: 1 })).toBe(1600)
    expect(custoDecodificado({ width: 10, height: 10, channels: 1, depth: "quark" })).toBe(1600)
  })

  it.each([
    [{ height: 10, channels: 3, depth: "uchar" }],
    [{ width: 10, channels: 3, depth: "uchar" }],
    [{ width: 10, height: 10, depth: "uchar" }],
    [{ width: 0, height: 10, channels: 3, depth: "uchar" }],
  ])("sem dimensão ou canal (%o) é null: a imagem não é legível", (meta) => {
    expect(custoDecodificado(meta)).toBeNull()
  })

  it("o teto é o de um RGBA de 8 bits no limite de pixels: 160 MB", () => {
    expect(LIMITE_BYTES_DECODIFICADOS).toBe(160_000_000)
    expect(custoDecodificado({ width: 8000, height: 5000, channels: 4, depth: "uchar" })).toBe(LIMITE_BYTES_DECODIFICADOS)
    // 16 bits: o mesmo custo com metade dos pixels.
    expect(custoDecodificado({ width: 5000, height: 4000, channels: 4, depth: "ushort" })).toBe(LIMITE_BYTES_DECODIFICADOS)
  })

  it("o módulo reduz as threads do libvips por imagem", () => {
    expect(sharp.concurrency()).toBeLessThanOrEqual(2)
  })
})

/**
 * PNG RGBA de 16 bits por canal, todo preto, escrito à mão (o sharp não grava
 * PNG de 16 bits a partir do `create`): é o arquivo da revisão de segurança
 * (scratchpad SEG2/bomb.mjs), ~300 KB para 6300×6300.
 */
function pngRgba16Liso(largura: number, altura: number) {
  const chunk = (tipo: string, dados: Buffer) => {
    const corpo = Buffer.concat([Buffer.from(tipo, "latin1"), dados])
    const saida = Buffer.alloc(8 + dados.length + 4)
    saida.writeUInt32BE(dados.length, 0)
    corpo.copy(saida, 4)
    saida.writeUInt32BE(crc32(corpo) >>> 0, 8 + dados.length)
    return saida
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largura, 0)
  ihdr.writeUInt32BE(altura, 4)
  ihdr[8] = 16 // bits por canal
  ihdr[9] = 6 // RGBA
  // Cada linha: 1 byte de filtro + largura × 4 canais × 2 bytes.
  const idat = deflateSync(Buffer.alloc((1 + largura * 8) * altura), { level: 9 })
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ])
  return new Uint8Array(png.buffer, png.byteOffset, png.byteLength)
}

/** Ruído determinístico: comprime mal, então o corte cai no meio dos pixels. */
function ruido(largura: number, altura: number) {
  const b = Buffer.alloc(largura * altura * 3)
  let x = 2463534242
  for (let i = 0; i < b.length; i++) {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    b[i] = x & 0xff
  }
  return b
}
