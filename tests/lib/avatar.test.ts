import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { SEM_CACHE_COMPARTILHADO, assinarAvatar, assinarAvatares, esquecerLinksEmitidos } from "@/lib/social/avatar"
import { REUSO_URL_AVATAR_S, VALIDADE_URL_AVATAR_S } from "@/lib/social/foto"

/**
 * @RF02.2 — URLs assinadas das fotos de perfil (bucket privado, S04-M-foto-privada).
 *
 * O cliente de serviço é falso: registra quantas vezes foi criado e cada chamada
 * de assinatura (bucket, caminhos e validade), e responde como o Storage — uma
 * URL assinada por caminho, um erro por item ou um erro da chamada inteira. Cada
 * assinatura sai com um token diferente, como no Storage de verdade, para o
 * reaproveitamento aparecer.
 */

const ANA = "11111111-1111-4111-8111-111111111111"
const BRUNO = "22222222-2222-4222-8222-222222222222"
const FOTO_ANA = `${ANA}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`
const FOTO_BRUNO = `${BRUNO}/1c7a3d5f-6e8b-4b9f-8c2d-3a4f5e6b7c8d.png`
const ana = { id: ANA, avatar_url: FOTO_ANA }
const bruno = { id: BRUNO, avatar_url: FOTO_BRUNO }
const semFoto = { id: ANA, avatar_url: null }

type Item = { path: string | null; signedUrl: string | null; error: string | null }

let emissao = 0
const assinada = (caminho: string, token: number) =>
  `https://storage.teste/storage/v1/object/sign/avatars/${caminho}?token=t${token}`

const chamadas: { bucket: string; caminhos: string[]; validade: number }[] = []
let clientesCriados = 0
let semChave = false
let resposta: (caminhos: string[]) => { data: Item[] | null; error: { message: string } | null }

const criarAdmin = () => {
  if (semChave) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada")
  clientesCriados++
  return {
    storage: {
      from: (bucket: string) => ({
        async createSignedUrls(caminhos: string[], validade: number) {
          chamadas.push({ bucket, caminhos, validade })
          return resposta(caminhos)
        },
      }),
    },
  } as unknown as ReturnType<Parameters<typeof assinarAvatares>[0]>
}

beforeEach(() => {
  esquecerLinksEmitidos()
  chamadas.length = 0
  clientesCriados = 0
  semChave = false
  resposta = (caminhos) => {
    emissao++
    return { data: caminhos.map((path) => ({ path, signedUrl: assinada(path, emissao), error: null })), error: null }
  }
})

afterEach(() => {
  vi.useRealTimers()
})

describe("assinarAvatares — o que vai ao Storage", () => {
  it("assina no bucket avatars, com a validade da constante, e devolve na ordem pedida", async () => {
    const urls = await assinarAvatares(criarAdmin, [bruno, semFoto, ana])

    expect(urls).toEqual([assinada(FOTO_BRUNO, emissao), null, assinada(FOTO_ANA, emissao)])
    expect(chamadas).toEqual([{ bucket: "avatars", caminhos: [FOTO_BRUNO, FOTO_ANA], validade: VALIDADE_URL_AVATAR_S }])
    expect(VALIDADE_URL_AVATAR_S).toBe(10 * 60)
  })

  it("a mesma foto pedida duas vezes é assinada uma vez só, numa chamada só", async () => {
    const urls = await assinarAvatares(criarAdmin, [ana, bruno, ana])

    expect(urls[0]).toBe(urls[2])
    expect(chamadas).toHaveLength(1)
    expect(chamadas[0].caminhos).toEqual([FOTO_ANA, FOTO_BRUNO])
  })

  it.each([
    ["URL antiga (o pixel rastreador)", "https://exemplo.com/a.png"],
    ["URL pública do próprio bucket", `https://x.supabase.co/storage/v1/object/public/avatars/${FOTO_ANA}`],
    ["javascript:", "javascript:alert(1)"],
    ["URL sem esquema", "//exemplo.com/a.png"],
    ["subida de pasta", `${ANA}/../../../rest/v1/profiles`],
    ["nome que não é uuid", `${ANA}/foto.webp`],
    ["extensão disfarçada", `${FOTO_ANA}.svg`],
    ["quebra de linha no fim", `${FOTO_ANA}\n`],
    ["maiúsculas", FOTO_ANA.toUpperCase()],
    ["vazio", ""],
  ])("valor fora do formato (%s) vira nulo sem ir ao Storage", async (_caso, valor) => {
    expect(await assinarAvatares(criarAdmin, [{ id: ANA, avatar_url: valor }])).toEqual([null])
    expect(chamadas).toEqual([])
    expect(clientesCriados).toBe(0)
  })

  it("foto na pasta de outra pessoa não é assinada, mesmo no formato", async () => {
    // O trigger de profiles já barra isso; a checagem é a defesa para quando
    // outra tabela, sem o trigger, reusar o helper.
    expect(await assinarAvatares(criarAdmin, [{ id: BRUNO, avatar_url: FOTO_ANA }])).toEqual([null])
    expect(chamadas).toEqual([])
  })

  it("sem nenhuma foto, não cria o cliente de serviço nem chama o Storage", async () => {
    expect(await assinarAvatares(criarAdmin, [])).toEqual([])
    expect(await assinarAvatares(criarAdmin, [semFoto, semFoto])).toEqual([null, null])
    expect(clientesCriados).toBe(0)
    expect(chamadas).toEqual([])
  })
})

describe("assinarAvatares — reaproveitar o link", () => {
  it("devolve o mesmo link enquanto não passa o tempo de reuso, sem nova chamada", async () => {
    vi.useFakeTimers()
    const primeira = await assinarAvatar(criarAdmin, ana)

    vi.advanceTimersByTime(REUSO_URL_AVATAR_S * 1000 - 1)
    expect(await assinarAvatar(criarAdmin, ana)).toBe(primeira)
    expect(chamadas).toHaveLength(1)
    expect(clientesCriados).toBe(1)
  })

  it("passado o tempo de reuso, assina de novo e devolve um link novo", async () => {
    vi.useFakeTimers()
    const primeira = await assinarAvatar(criarAdmin, ana)

    vi.advanceTimersByTime(REUSO_URL_AVATAR_S * 1000)
    const segunda = await assinarAvatar(criarAdmin, ana)

    expect(segunda).not.toBe(primeira)
    expect(chamadas).toHaveLength(2)
    expect(REUSO_URL_AVATAR_S).toBe(5 * 60)
  })

  it("numa resposta com fotos novas e já assinadas, só as novas vão ao Storage", async () => {
    const daAna = await assinarAvatar(criarAdmin, ana)

    const urls = await assinarAvatares(criarAdmin, [ana, bruno])

    expect(urls[0]).toBe(daAna)
    expect(chamadas).toHaveLength(2)
    expect(chamadas[1].caminhos).toEqual([FOTO_BRUNO])
  })

  it("foto trocada é outro caminho: o link da antiga nunca é devolvido para a nova", async () => {
    await assinarAvatar(criarAdmin, ana)
    const nova = { id: ANA, avatar_url: `${ANA}/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d.webp` }

    expect(await assinarAvatar(criarAdmin, nova)).toContain(nova.avatar_url)
  })

  it("guarda no máximo 1000 links: acima disso, o mais antigo sai", async () => {
    const perfis = Array.from({ length: 1001 }, (_, i) => {
      const id = `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`
      return { id, avatar_url: `${id}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp` }
    })
    await assinarAvatares(criarAdmin, perfis)

    // O primeiro saiu do cache: pedi-lo de novo vai ao Storage; o último, não.
    await assinarAvatar(criarAdmin, perfis[1000])
    expect(chamadas).toHaveLength(1)
    await assinarAvatar(criarAdmin, perfis[0])
    expect(chamadas).toHaveLength(2)
  })
})

describe("assinarAvatares — falhas não derrubam a resposta", () => {
  it("sem a chave de serviço, as fotos vêm nulas e o erro vai ao log, sem lançar", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    semChave = true

    expect(await assinarAvatares(criarAdmin, [ana, semFoto])).toEqual([null, null])
    expect(log).toHaveBeenCalledWith("[foto de perfil] não foi possível assinar as fotos", expect.any(Error))
    log.mockRestore()
  })

  it("se a chamada falha, as fotos vêm nulas e o erro vai ao log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    resposta = () => ({ data: null, error: { message: "storage fora do ar" } })

    expect(await assinarAvatares(criarAdmin, [ana, bruno])).toEqual([null, null])
    expect(log).toHaveBeenCalledWith("[foto de perfil] não foi possível assinar as fotos", {
      message: "storage fora do ar",
    })
    log.mockRestore()
  })

  it("se o Storage não devolve nada, sem erro, as fotos também vêm nulas", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    resposta = () => ({ data: null, error: null })

    expect(await assinarAvatares(criarAdmin, [ana])).toEqual([null])
    log.mockRestore()
  })

  it("falha não fica guardada: na próxima resposta, tenta assinar de novo", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    resposta = () => ({ data: null, error: { message: "storage fora do ar" } })
    await assinarAvatar(criarAdmin, ana)

    resposta = (caminhos) => ({ data: caminhos.map((path) => ({ path, signedUrl: assinada(path, 99), error: null })), error: null })
    expect(await assinarAvatar(criarAdmin, ana)).toBe(assinada(FOTO_ANA, 99))
    log.mockRestore()
  })

  it("se um item falha (arquivo que não existe), só ele vem nulo, com log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    // A forma que o Storage local devolve para um arquivo que não existe.
    resposta = () => ({
      data: [
        { path: FOTO_ANA, signedUrl: assinada(FOTO_ANA, 1), error: null },
        { path: FOTO_BRUNO, signedUrl: null, error: "Either the object does not exist or you do not have access to it" },
      ],
      error: null,
    })

    expect(await assinarAvatares(criarAdmin, [ana, bruno])).toEqual([assinada(FOTO_ANA, 1), null])
    expect(log).toHaveBeenCalledWith("[foto de perfil] foto não assinada", FOTO_BRUNO, expect.any(String))
    log.mockRestore()
  })

  it("item com erro vem nulo mesmo que traga uma URL junto", async () => {
    // O Storage de hoje manda a URL nula quando há erro; a checagem do erro é a
    // defesa para o dia em que a biblioteca mudar.
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    resposta = () => ({ data: [{ path: FOTO_ANA, signedUrl: assinada(FOTO_ANA, 1), error: "sem acesso" }], error: null })

    expect(await assinarAvatares(criarAdmin, [ana])).toEqual([null])
    log.mockRestore()
  })

  it("item devolvido sem caminho não vira URL de ninguém", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    resposta = () => ({ data: [{ path: null, signedUrl: assinada(FOTO_ANA, 1), error: null }], error: null })

    expect(await assinarAvatares(criarAdmin, [ana])).toEqual([null])
    log.mockRestore()
  })
})

describe("SEM_CACHE_COMPARTILHADO", () => {
  it("é privado e sem armazenamento: o link assinado vale como senha", () => {
    expect(SEM_CACHE_COMPARTILHADO).toEqual({ "Cache-Control": "private, no-store" })
  })
})
