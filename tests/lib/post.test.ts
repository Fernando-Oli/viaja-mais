import { describe, it, expect, vi, beforeEach } from "vitest"
import { ANA, BIA, CAIO, DORA, banco, fotoDe, semearMarca, semearPerfis, semearPost } from "../api/banco-falso"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"
import { ErroHttp } from "@/lib/http"
import {
  COLUNAS_POST_VISTO,
  atualizarLegenda,
  codificarCursor,
  criarPost,
  excluirPost,
  exigirPostDaAutora,
  lerCursor,
  montarPostsVistos,
  postVisto,
  type LinhaDoPostVisto,
} from "@/lib/social/post"

/**
 * @RF09.15 @RF09.16 @RF09.17 O post (lib/social/post.ts): o `PostVisto` nasce
 * num lugar só, campo a campo; autorização explícita (404 que não revela, 403
 * de quem não é a autora); escrita só nas colunas do grant; cursor opaco
 * conferido.
 */

const sessao = () => banco.clienteDaSessao()
const admin = () => banco.clienteDeServico()

beforeEach(() => {
  banco.reiniciar()
  semearPerfis()
  esquecerLinksEmitidos()
  banco.sessao = ANA
  return () => vi.restoreAllMocks()
})

describe("montarPostsVistos", () => {
  it("as colunas nunca pedem trip_id nem *", () => {
    expect(COLUNAS_POST_VISTO).not.toMatch(/trip_id|\*/)
  })

  it("vários posts: uma assinatura de fotos e uma de avatares; marcado sem username e linha sem autora ficam de fora", async () => {
    const a = semearPost({ author_id: BIA, photos: [fotoDe(BIA, 1)], caption: "​" })
    const b = semearPost({ author_id: CAIO, photos: [fotoDe(CAIO, 1), fotoDe(CAIO, 2)] })
    semearMarca(a.id, BIA, DORA)
    semearMarca(b.id, CAIO, BIA)
    const linhas = [
      { ...a, autor: { id: BIA, username: "bia", full_name: "Bia", avatar_url: null } },
      { ...b, autor: { id: CAIO, username: "caio", full_name: null, avatar_url: null } },
      { ...b, id: "x", autor: null },
    ] as unknown as LinhaDoPostVisto[]
    const vistos = await montarPostsVistos(sessao(), admin, linhas, ANA)
    expect(vistos.map((p) => p.id)).toEqual([a.id, b.id])
    expect(vistos[0]).toMatchObject({ caption: null, marcados: [], proprio: false })
    expect(vistos[1].fotos).toHaveLength(2)
    expect(vistos[1].marcados.map((p) => p.id)).toEqual([BIA])
    expect(banco.storage.assinaturas.map((s) => s.bucket).sort()).toEqual(["avatars", "capas-posts"])
  })

  it("lista vazia não consulta nada", async () => {
    expect(await montarPostsVistos(sessao(), admin, [], ANA)).toEqual([])
    expect(banco.consultas).toEqual([])
  })
})

describe("autorização", () => {
  it("postVisto: null quando não existe; a autorização explícita repete a policy (pode_ver_rede)", async () => {
    expect(await postVisto(sessao(), admin, "99999999-0000-4000-8000-000000000000", ANA)).toBeNull()
    const daBia = semearPost({ author_id: BIA, photos: [fotoDe(BIA)] })
    expect(await postVisto(sessao(), admin, daBia.id as string, ANA)).not.toBeNull()
    expect(banco.rpcs.some((r) => r.nome === "pode_ver_rede")).toBe(true)
  })

  it("exigirPostDaAutora: 403 para quem vê e não é a autora; a autora recebe a linha sem consultar pode_ver_rede", async () => {
    const daBia = semearPost({ author_id: BIA, photos: [fotoDe(BIA)] })
    await expect(exigirPostDaAutora(sessao(), daBia.id as string, ANA)).rejects.toMatchObject({ status: 403 })
    banco.sessao = BIA
    banco.rpcs = []
    expect((await exigirPostDaAutora(sessao(), daBia.id as string, BIA)).id).toBe(daBia.id)
    expect(banco.rpcs).toEqual([])
  })

  it("erro do banco: 42501 vira 403; outro, Error sem a mensagem crua", async () => {
    banco.falhas.push({ tabela: "posts", operacao: "select", erro: { code: "42501" } })
    await expect(postVisto(sessao(), admin, "99999999-0000-4000-8000-000000000000", ANA)).rejects.toMatchObject({ status: 403 })
    banco.falhas.push({ tabela: "posts", operacao: "select", erro: { code: "XX000", message: "cru" } })
    const erro = await postVisto(sessao(), admin, "99999999-0000-4000-8000-000000000000", ANA).catch((e: Error) => e)
    expect(erro).not.toBeInstanceOf(ErroHttp)
    expect((erro as Error).message).not.toContain("cru")
  })
})

describe("escrita", () => {
  it("criarPost insere só author_id, caption e photos", async () => {
    const id = await criarPost(sessao(), { autorId: ANA, fotos: [fotoDe(ANA)], legenda: "oi" })
    expect(banco.consultas.at(-1)).toMatchObject({ operacao: "insert", valores: { author_id: ANA, caption: "oi", photos: [fotoDe(ANA)] } })
    expect(banco.tabelas.posts[0].id).toBe(id)
  })

  it("criarPost: CHECK do banco (0 fotos sem viagem) não sai cru; 42501 vira 403", async () => {
    await expect(criarPost(sessao(), { autorId: ANA, fotos: [], legenda: null })).rejects.toThrow(/não foi possível/)
    await expect(criarPost(sessao(), { autorId: BIA, fotos: [fotoDe(BIA)], legenda: null })).rejects.toMatchObject({ status: 403 })
  })

  it("atualizarLegenda e excluirPost filtram pela autora — mesmo com as policies de escrita erradas", async () => {
    banco.escritaEmPostsSemPolicy = true
    const daBia = semearPost({ author_id: BIA, caption: "x", photos: [fotoDe(BIA)] })
    expect(await atualizarLegenda(sessao(), daBia.id as string, ANA, "y")).toBe(false)
    expect(await excluirPost(sessao(), daBia.id as string, ANA)).toBeNull()
    expect(daBia.caption).toBe("x")
    banco.sessao = BIA
    expect(await atualizarLegenda(sessao(), daBia.id as string, BIA, null)).toBe(true)
    expect(await excluirPost(sessao(), daBia.id as string, BIA)).toEqual({ fotos: [fotoDe(BIA)] })
  })
})

describe("cursor da grade", () => {
  const ok = { created_at: "2026-11-19T10:00:01.123456+00:00", id: ANA }

  it("ida e volta", () => {
    expect(lerCursor(codificarCursor(ok))).toEqual(ok)
    expect(lerCursor(codificarCursor({ created_at: "2026-11-19T10:00:01Z", id: ANA }))).not.toBeNull()
  })

  // @RF09.16 A data do cursor tem de existir, não só ter o formato.
  it.each([
    ["sem fração", "2026-11-19T10:00:01Z"],
    ["microssegundos do banco", "2026-11-19T10:00:01.123456+00:00"],
    ["fuso negativo que vira o dia em UTC", "2026-11-19T23:30:00.5-03:00"],
    ["fuso positivo", "2026-01-01T00:15:00.000999+05:30"],
    ["29 de fevereiro em ano bissexto", "2028-02-29T12:00:00Z"],
    ["último instante do dia", "2026-12-31T23:59:59.999999Z"],
  ])("data que existe (%s) → vale", (_caso, momento) => {
    expect(lerCursor(codificarCursor({ created_at: momento, id: ANA }))).toEqual({ created_at: momento, id: ANA })
  })

  it.each([
    ["tudo 9", "9999-99-99T99:99:99Z"],
    ["mês 13", "2026-13-01T10:00:00Z"],
    ["mês 00", "2026-00-10T10:00:00Z"],
    ["dia 32", "2026-01-32T10:00:00Z"],
    ["dia 00", "2026-01-00T10:00:00Z"],
    ["30 de fevereiro", "2026-02-30T10:00:00Z"],
    ["29 de fevereiro fora do bissexto", "2026-02-29T10:00:00.123456+00:00"],
    ["31 de abril", "2026-04-31T10:00:00Z"],
    ["hora 25", "2026-11-19T25:00:00Z"],
    ["hora 24", "2026-11-19T24:00:00Z"],
    ["minuto 60", "2026-11-19T10:60:00Z"],
    ["segundo 60", "2026-11-19T10:00:60Z"],
    ["fuso impossível", "2026-11-19T10:00:00+99:00"],
  ])("data impossível (%s) → null", (_caso, momento) => {
    expect(lerCursor(codificarCursor({ created_at: momento, id: ANA }))).toBeNull()
  })

  it.each([
    ["vazio", ""],
    ["fora do alfabeto", "a+b/c="],
    ["JSON inválido", Buffer.from("{").toString("base64url")],
    ["objeto", Buffer.from('{"a":1}').toString("base64url")],
    ["três itens", Buffer.from(JSON.stringify([ok.created_at, ANA, 1])).toString("base64url")],
    ["data fora do formato", codificarCursor({ created_at: "2026-11-19 10:00", id: ANA })],
    ["id maiúsculo", codificarCursor({ created_at: ok.created_at, id: ANA.replace(/1/g, "A") })],
    ["id não texto", Buffer.from(JSON.stringify([ok.created_at, 5])).toString("base64url")],
    ["longo demais", "a".repeat(201)],
  ])("%s → null", (_caso, texto) => {
    expect(lerCursor(texto)).toBeNull()
  })
})
