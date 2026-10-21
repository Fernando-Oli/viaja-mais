import { describe, it, expect } from "vitest"
import {
  REUSO_URL_AVATAR_S,
  VALIDADE_URL_AVATAR_S,
  caminhoApagavel,
  caminhoDaNovaFoto,
  tipoDaImagem,
} from "@/lib/social/foto"
import * as regrasDaFoto from "@/lib/social/foto"

/**
 * Regras da foto de perfil: o tipo vem dos bytes, o caminho fica na pasta de
 * quem envia, só um caminho no formato exato vira URL, e só se apaga o que a
 * própria pessoa gravou.
 *
 * @RF02.2
 */

const ANA = "11111111-1111-4111-8111-111111111111"
const BRUNO = "22222222-2222-4222-8222-222222222222"
const ARQUIVO = "0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c"
const CAMINHO_DA_ANA = `${ANA}/${ARQUIVO}.webp`

const bytes = (...valores: number[]) => new Uint8Array(valores)
const texto = (s: string) => new TextEncoder().encode(s)

describe("tipoDaImagem — pelo conteúdo, não pelo nome", () => {
  it("reconhece JPEG, PNG e WebP pela assinatura", () => {
    expect(tipoDaImagem(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg")
    expect(tipoDaImagem(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00))).toBe("image/png")
    expect(tipoDaImagem(texto("RIFF\u0000\u0000\u0000\u0000WEBPVP8 "))).toBe("image/webp")
  })

  it.each([
    ["PDF", texto("%PDF-1.4")],
    ["GIF", texto("GIF89a")],
    ["SVG", texto("<svg xmlns=")],
    ["RIFF que não é WebP (WAV)", texto("RIFF\u0000\u0000\u0000\u0000WAVEfmt ")],
    ["vazio", new Uint8Array()],
    ["PNG truncado", bytes(0x89, 0x50, 0x4e, 0x47)],
    ["JPEG truncado", bytes(0xff, 0xd8)],
  ])("recusa %s", (_caso, conteudo) => {
    expect(tipoDaImagem(conteudo)).toBeNull()
  })
})

describe("caminhoDaNovaFoto", () => {
  it("fica na pasta de quem envia, com a extensão do tipo real", () => {
    expect(caminhoDaNovaFoto(ANA, ARQUIVO, "image/webp")).toBe(`${ANA}/${ARQUIVO}.webp`)
    expect(caminhoDaNovaFoto(ANA, ARQUIVO, "image/jpeg")).toBe(`${ANA}/${ARQUIVO}.jpg`)
    expect(caminhoDaNovaFoto(ANA, ARQUIVO, "image/png")).toBe(`${ANA}/${ARQUIVO}.png`)
  })
})

describe("bucket privado — validade do link e cache (S04-M-foto-privada)", () => {
  it("a URL assinada vale 10 minutos, e o mesmo link é reaproveitado por 5", () => {
    // A validade é também quanto o navegador guarda a foto: o Storage serve a
    // URL assinada com Expires no fim dela (decisão do Micael em 21/10).
    expect(VALIDADE_URL_AVATAR_S).toBe(10 * 60)
    expect(REUSO_URL_AVATAR_S).toBe(5 * 60)
    expect(REUSO_URL_AVATAR_S).toBeLessThan(VALIDADE_URL_AVATAR_S)
  })

  it("não existe mais quem monte URL pública a partir do caminho", () => {
    // O bucket é privado: uma URL /object/public/ não abre. Quem precisa da foto
    // pede a URL assinada (lib/social/avatar.ts).
    expect("urlPublicaDoAvatar" in regrasDaFoto).toBe(false)
  })
})

describe("caminhoApagavel — só o que é da pessoa", () => {
  it("aceita um arquivo no formato da rota, na pasta dela", () => {
    expect(caminhoApagavel(CAMINHO_DA_ANA, ANA)).toBe(CAMINHO_DA_ANA)
  })

  it.each([
    ["nulo", null],
    ["URL antiga", "https://exemplo.com/a.png"],
    ["pasta de outra pessoa", `${BRUNO}/${ARQUIVO}.webp`],
    ["subpasta", `${ANA}/sub/${ARQUIVO}.webp`],
    ["nome fora do formato", `${ANA}/foto.webp`],
    ["prefixo parecido", `${ANA}x/${ARQUIVO}.webp`],
  ])("recusa %s", (_caso, valor) => {
    expect(caminhoApagavel(valor, ANA)).toBeNull()
  })
})
