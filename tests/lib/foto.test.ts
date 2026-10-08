import { describe, it, expect } from "vitest"
import {
  caminhoApagavel,
  caminhoDaNovaFoto,
  tipoDaImagem,
  urlPublicaDoAvatar,
} from "@/lib/social/foto"
import { avatarPublico } from "@/lib/social/avatar"
import { env } from "@/lib/env"

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

describe("urlPublicaDoAvatar — só o caminho no formato exato vira URL", () => {
  it("monta a URL pública a partir do caminho no bucket", () => {
    expect(urlPublicaDoAvatar(CAMINHO_DA_ANA, "http://127.0.0.1:54321")).toBe(
      `http://127.0.0.1:54321/storage/v1/object/public/avatars/${CAMINHO_DA_ANA}`,
    )
  })

  it("não duplica a barra quando a URL do projeto termina com ela", () => {
    expect(urlPublicaDoAvatar(CAMINHO_DA_ANA, "https://projeto.supabase.co/")).toBe(
      `https://projeto.supabase.co/storage/v1/object/public/avatars/${CAMINHO_DA_ANA}`,
    )
  })

  it.each([
    ["nulo", null],
    ["vazio", ""],
    ["URL antiga (o pixel rastreador)", "https://exemplo.com/a.png"],
    ["URL http", "http://exemplo.com/a.png"],
    ["javascript:", "javascript:alert(1)"],
    ["URL sem esquema", "//exemplo.com/a.png"],
    ["subida de pasta", `${ANA}/../../../rest/v1/profiles`],
    ["nome que não é uuid", `${ANA}/foto.webp`],
    ["extensão disfarçada", `${CAMINHO_DA_ANA}.svg`],
    ["quebra de linha no fim", `${CAMINHO_DA_ANA}\n`],
    ["maiúsculas", CAMINHO_DA_ANA.toUpperCase()],
  ])("devolve nulo para %s", (_caso, valor) => {
    expect(urlPublicaDoAvatar(valor, "http://x")).toBeNull()
  })

  it("avatarPublico monta com o endereço do projeto em lib/env", () => {
    expect(avatarPublico(CAMINHO_DA_ANA)).toBe(
      `${env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/avatars/${CAMINHO_DA_ANA}`,
    )
    expect(avatarPublico("https://exemplo.com/a.png")).toBeNull()
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
