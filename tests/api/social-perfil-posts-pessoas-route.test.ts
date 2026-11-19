import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  ANA,
  BIA,
  CAIO,
  CHAVES_PESSOA,
  CHAVES_QUADRADO,
  DORA,
  EVA,
  VIAGEM,
  banco,
  conferirResposta,
  fotoDe,
  semearPerfis,
  semearPost,
  urlDe,
} from "./banco-falso"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"
import { codificarCursor } from "@/lib/social/post"

/**
 * @RF09.16 GET /api/social/perfis/[username]/posts — a grade "Publicações":
 * 12 por página, `created_at desc, id desc`, cursor opaco; 403 perfil privado
 * sem acesso; 404 username inexistente.
 *
 * @RF09.13 GET /api/social/pessoas?q= — a busca do "Marcar pessoas": até 10,
 * só com username, sem a sessão, pelo começo do username ou do nome.
 */

vi.mock("@/lib/supabase/server", async () => {
  const { banco } = await import("./banco-falso")
  return { createClient: async () => banco.clienteDaSessao() }
})
vi.mock("@/lib/supabase/admin", async () => {
  const { banco } = await import("./banco-falso")
  return { criarClienteAdmin: () => banco.clienteDeServico() }
})

import { GET as GRADE } from "@/app/api/social/perfis/[username]/posts/route"
import { GET as PESSOAS } from "@/app/api/social/pessoas/route"

async function conferir(resposta: Response) {
  const r = await conferirResposta(resposta)
  expect(r.cache).toBe("private, no-store")
  expect(r.proibidas).toEqual([])
  expect(r.crus).toEqual([])
  return r
}

const grade = async (username: string, cursor?: string) => {
  const url = `http://localhost/api/social/perfis/${username}/posts${cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`}`
  return conferir(await GRADE(new Request(url), { params: Promise.resolve({ username }) }))
}
const buscar = async (q: string) => conferir(await PESSOAS(new Request(`http://localhost/api/social/pessoas?q=${encodeURIComponent(q)}`)))

beforeEach(() => {
  banco.reiniciar()
  semearPerfis()
  esquecerLinksEmitidos()
  banco.sessao = ANA
  return () => vi.restoreAllMocks()
})

describe("GET /api/social/perfis/[username]/posts (@RF09.16)", () => {
  it("200: quadrados com as chaves exatas — 1ª foto assinada, quantidade, descrição (legenda, título, ou padrão)", async () => {
    const comLegenda = semearPost({ author_id: BIA, caption: "Serra", photos: [fotoDe(BIA, 1), fotoDe(BIA, 2)] })
    const deViagem = semearPost({
      author_id: BIA,
      trip_id: VIAGEM,
      title: "Chapada",
      destination: "GO",
      start_date: "2026-12-01",
      end_date: "2026-12-02",
      photos: [],
    })
    const semLegenda = semearPost({ author_id: BIA, photos: [fotoDe(BIA, 3)] })

    const { status, corpo } = await grade("bia")
    expect(status).toBe(200)
    expect(Object.keys(corpo).sort()).toEqual(["posts", "proximo"])
    for (const q of corpo.posts) expect(Object.keys(q).sort()).toEqual(CHAVES_QUADRADO)
    expect(corpo).toEqual({
      posts: [
        { id: semLegenda.id, foto: urlDe(fotoDe(BIA, 3)), quantidade_fotos: 1, descricao: "Publicação de @bia" },
        { id: deViagem.id, foto: null, quantidade_fotos: 0, descricao: "Chapada" },
        { id: comLegenda.id, foto: urlDe(fotoDe(BIA, 1)), quantidade_fotos: 2, descricao: "Serra" },
      ],
      proximo: null,
    })
    // Só a 1ª foto de cada post é assinada, numa chamada só.
    expect(banco.storage.assinaturas).toEqual([
      { bucket: "capas-posts", caminhos: [fotoDe(BIA, 3), fotoDe(BIA, 1)], validade: 600 },
    ])
  })

  it("200: pagina de 12 em 12 pelo cursor, sem repetir nem pular, inclusive com empate de created_at", async () => {
    const ids: string[] = []
    for (let i = 0; i < 26; i++) ids.push(semearPost({ author_id: BIA, photos: [fotoDe(BIA)] }).id as string)
    // Empate: os quatro primeiros com o mesmo momento.
    const mesmo = banco.tabelas.posts[0].created_at
    for (const p of banco.tabelas.posts.slice(0, 4)) p.created_at = mesmo

    const vistos: string[] = []
    let cursor: string | undefined
    let paginas = 0
    do {
      const { status, corpo } = await grade("bia", cursor)
      expect(status).toBe(200)
      expect(corpo.posts.length).toBeLessThanOrEqual(12)
      vistos.push(...corpo.posts.map((q: { id: string }) => q.id))
      cursor = corpo.proximo ?? undefined
      paginas++
    } while (cursor)
    expect(paginas).toBe(3)
    expect(new Set(vistos).size).toBe(26)
    const esperado = [...banco.tabelas.posts]
      .sort((a, b) => (a.created_at === b.created_at ? (a.id! < b.id! ? 1 : -1) : String(a.created_at) < String(b.created_at) ? 1 : -1))
      .map((p) => p.id)
    expect(vistos).toEqual(esperado)
  })

  it("403: perfil privado que a sessão não segue, sem listar", async () => {
    semearPost({ author_id: EVA, photos: [fotoDe(EVA)] })
    const { status } = await grade("eva")
    expect(status).toBe(403)
    expect(banco.consultas.some((c) => c.tabela === "posts")).toBe(false)
  })

  it("200: a própria pessoa e a seguidora aceita veem a grade privada", async () => {
    semearPost({ author_id: EVA, photos: [fotoDe(EVA)] })
    banco.segue.add(`${ANA}->${EVA}`)
    expect((await grade("eva")).corpo.posts).toHaveLength(1)
    banco.sessao = EVA
    expect((await grade("eva")).corpo.posts).toHaveLength(1)
  })

  it("404: username inexistente", async () => {
    expect((await grade("ninguem")).status).toBe(404)
  })

  it.each([
    ["username fora do formato", "Nao Pode", undefined],
    ["cursor que não é base64url", "bia", "%%%"],
    ["cursor com JSON de outra forma", "bia", Buffer.from('{"a":1}').toString("base64url")],
    ["cursor com data fora do formato", "bia", codificarCursor({ created_at: "ontem", id: BIA })],
    ["cursor com id que não é uuid", "bia", codificarCursor({ created_at: "2026-11-19T10:00:00+00:00", id: "1 or 1=1" })],
  ])("400: %s", async (_caso, username, cursor) => {
    expect((await grade(username, cursor)).status).toBe(400)
  })

  // @RF09.16 Data no formato mas fora do calendário: 400 antes do banco, não 500.
  it.each([
    ["tudo 9", "9999-99-99T99:99:99Z", "ffffffff-ffff-4fff-8fff-ffffffffffff"],
    ["mês 13", "2026-13-19T10:00:00.123456+00:00", BIA],
    ["dia 32", "2026-11-32T10:00:00.123456+00:00", BIA],
    ["hora 25", "2026-11-19T25:00:00.123456+00:00", BIA],
  ])("400: cursor com data impossível (%s), sem consultar posts", async (_caso, created_at, id) => {
    semearPost({ author_id: BIA, photos: [fotoDe(BIA)] })
    expect((await grade("bia", codificarCursor({ created_at, id }))).status).toBe(400)
    expect(banco.consultas.some((c) => c.tabela === "posts")).toBe(false)
  })

  it("200: o cursor emitido pela própria rota (microssegundos do banco) continua valendo", async () => {
    for (let i = 0; i < 13; i++) semearPost({ author_id: BIA, photos: [fotoDe(BIA)] })
    const primeira = await grade("bia")
    expect(primeira.status).toBe(200)
    expect(primeira.corpo.proximo).toEqual(expect.any(String))
    const segunda = await grade("bia", primeira.corpo.proximo)
    expect(segunda.status).toBe(200)
    expect(segunda.corpo.posts).toHaveLength(1)
  })

  it("401: sem sessão", async () => {
    banco.sessao = null
    expect((await grade("bia")).status).toBe(401)
  })
})

describe("GET /api/social/pessoas (@RF09.13)", () => {
  it("200: pelo começo do username ou de uma palavra do nome; chaves exatas; sem a sessão nem quem não tem username", async () => {
    const porUsername = await buscar("bi")
    expect(porUsername.status).toBe(200)
    expect(Object.keys(porUsername.corpo)).toEqual(["pessoas"])
    expect(porUsername.corpo.pessoas.map((p: { id: string }) => p.id)).toEqual([BIA])
    for (const p of porUsername.corpo.pessoas) expect(Object.keys(p).sort()).toEqual(CHAVES_PESSOA)

    expect((await buscar("reis")).corpo.pessoas.map((p: { id: string }) => p.id)).toEqual([CAIO])
    // "ana" é a própria sessão; "dora" não tem username.
    expect((await buscar("ana")).corpo.pessoas).toEqual([])
    expect((await buscar("dora")).corpo.pessoas).toEqual([])
    expect(DORA).toBeTruthy()
    // Perfil privado também aparece (nome e username são visíveis: RF09.10).
    expect((await buscar("@eva")).corpo.pessoas.map((p: { id: string }) => p.id)).toEqual([EVA])
    // "contém" não vale: "ia" está dentro de "bia", mas não no começo.
    expect((await buscar("ia")).corpo.pessoas).toEqual([])
  })

  it("200: no máximo 10, e o username exato primeiro", async () => {
    for (let i = 0; i < 14; i++) {
      banco.tabelas.profiles.push({ id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`, username: `bia_${i}`, full_name: `Bia ${i}`, avatar_url: null })
    }
    const { corpo } = await buscar("bia")
    expect(corpo.pessoas).toHaveLength(10)
    expect(corpo.pessoas[0].username).toBe("bia")
  })

  it("o _ do termo é literal, não curinga", async () => {
    banco.tabelas.profiles.push({ id: "66666666-6666-4666-8666-666666666666", username: "caxo", full_name: null, avatar_url: null })
    expect((await buscar("ca_")).corpo.pessoas).toEqual([])
  })

  it.each([["curto", "a"], ["vazio", ""], ["com %", "a%b"], ["longo", "a".repeat(61)]])("400: termo %s", async (_caso, q) => {
    expect((await buscar(q)).status).toBe(400)
  })

  it("401: sem sessão", async () => {
    banco.sessao = null
    expect((await buscar("bia")).status).toBe(401)
  })

  it("500: erro do banco não vaza", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    banco.falhas.push({ tabela: "profiles", operacao: "select", erro: { code: "XX000", message: "detalhe cru" } })
    const { status, corpo } = await buscar("bia")
    expect(status).toBe(500)
    expect(JSON.stringify(corpo)).not.toContain("detalhe cru")
  })
})
