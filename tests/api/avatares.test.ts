import { describe, it, expect, vi } from "vitest"
import { criarAssinadorDeAvatares, MAX_LINKS_GUARDADOS } from "@/api/arquivos/avatares"
import { REUSO_URL_AVATAR_S, VALIDADE_URL_AVATAR_S } from "@/lib/social/foto"

/**
 * Links assinados das fotos de perfil na API (`api/arquivos/avatares.ts`), com
 * a assinatura falsa: cada chamada devolve um token novo, como o S3, para o
 * reaproveitamento aparecer. A assinatura de verdade contra o armazenamento é
 * provada em `tests/integracao/foto.test.ts`.
 *
 * @RF02.2 foto de perfil
 */

const ANA = "11111111-1111-4111-8111-111111111111"
const BRUNO = "22222222-2222-4222-8222-222222222222"
const FOTO_ANA = `${ANA}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`
const FOTO_BRUNO = `${BRUNO}/1c7a3d5f-6e8b-4b9f-8c2d-3a4f5e6b7c8d.png`
const ana = { id: ANA, avatar_url: FOTO_ANA }
const bruno = { id: BRUNO, avatar_url: FOTO_BRUNO }

function montar(falhar: (caminho: string) => boolean = () => false) {
  let relogio = 1_000_000
  let token = 0
  const assinar = vi.fn(async (caminho: string, validade: number) => {
    if (falhar(caminho)) throw new Error("armazenamento fora")
    return `https://s3.teste/avatars/${caminho}?validade=${validade}&t=${++token}`
  })
  const assinador = criarAssinadorDeAvatares(assinar, () => relogio)
  return { ...assinador, assinar, avancar: (ms: number) => (relogio += ms) }
}

describe("criarAssinadorDeAvatares", () => {
  it("assina com a validade da constante e devolve na ordem pedida; sem foto é nulo", async () => {
    const { assinarAvatares, assinar } = montar()
    const urls = await assinarAvatares([bruno, { id: ANA, avatar_url: null }, ana])
    expect(urls[0]).toContain(FOTO_BRUNO)
    expect(urls[1]).toBeNull()
    expect(urls[2]).toContain(`validade=${VALIDADE_URL_AVATAR_S}`)
    expect(assinar).toHaveBeenCalledTimes(2)
  })

  it("a mesma foto pedida duas vezes na resposta é assinada uma vez só", async () => {
    const { assinarAvatares, assinar } = montar()
    const [a, b] = await assinarAvatares([ana, ana])
    expect(a).toBe(b)
    expect(assinar).toHaveBeenCalledTimes(1)
  })

  it("foto na pasta de outra pessoa, ou fora do formato, não é assinada", async () => {
    const { assinarAvatares, assinar } = montar()
    const urls = await assinarAvatares([
      { id: ANA, avatar_url: FOTO_BRUNO },
      { id: ANA, avatar_url: "../../segredo.webp" },
      { id: ANA, avatar_url: "javascript:alert(1)" },
    ])
    expect(urls).toEqual([null, null, null])
    expect(assinar).not.toHaveBeenCalled()
  })

  it("reaproveita o link dentro do tempo de reuso e assina de novo depois dele", async () => {
    const { assinarAvatar, assinar, avancar } = montar()
    const primeiro = await assinarAvatar(ana)
    avancar(REUSO_URL_AVATAR_S * 1000 - 1)
    expect(await assinarAvatar(ana)).toBe(primeiro)
    avancar(1)
    expect(await assinarAvatar(ana)).not.toBe(primeiro)
    expect(assinar).toHaveBeenCalledTimes(2)
  })

  it("foto trocada é outro caminho: o link da antiga nunca é devolvido para a nova", async () => {
    const { assinarAvatar } = montar()
    const antiga = await assinarAvatar(ana)
    const nova = await assinarAvatar({ id: ANA, avatar_url: `${ANA}/9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b.jpg` })
    expect(nova).not.toBe(antiga)
  })

  it(`guarda no máximo ${MAX_LINKS_GUARDADOS} links: acima disso, o mais antigo sai`, async () => {
    const { assinarAvatares, assinar } = montar()
    const perfis = Array.from({ length: MAX_LINKS_GUARDADOS + 1 }, (_, i) => ({
      id: ANA,
      avatar_url: `${ANA}/${i.toString(16).padStart(8, "0")}-0000-4000-8000-000000000000.webp`,
    }))
    await assinarAvatares(perfis)
    assinar.mockClear()
    await assinarAvatares([perfis[0]])
    expect(assinar).toHaveBeenCalledTimes(1)
    await assinarAvatares([perfis[MAX_LINKS_GUARDADOS]])
    expect(assinar).toHaveBeenCalledTimes(1)
  })

  it("falha ao assinar vira foto nula com log, só na foto que falhou, e não fica guardada", async () => {
    let fora = true
    const { assinarAvatares, assinar } = montar((caminho) => fora && caminho === FOTO_ANA)
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const [daAna, doBruno] = await assinarAvatares([ana, bruno])
    expect(daAna).toBeNull()
    expect(doBruno).toContain(FOTO_BRUNO)
    expect(log).toHaveBeenCalled()

    fora = false
    expect((await assinarAvatares([ana]))[0]).toContain(FOTO_ANA)
    expect(assinar).toHaveBeenCalledTimes(3)
    log.mockRestore()
  })
})
