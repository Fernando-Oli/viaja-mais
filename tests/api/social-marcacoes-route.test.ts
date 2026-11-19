import { describe, it, expect, vi, beforeEach } from "vitest"
import { ANA, BIA, CAIO, EVA, VIAGEM, banco, conferirResposta, fotoDe, semearMarca, semearPerfis, semearPost, urlDe } from "./banco-falso"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"

/**
 * @RF09.14 A aba "Marcações": GET /api/social/perfis/[username]/marcacoes (os
 * posts em que a pessoa foi marcada, lendo `posts`, com a 1ª foto assinada e o
 * `post_id` para linkar ao detalhe) e DELETE /api/social/marcacoes/[postId]
 * (a pessoa marcada remove a própria marca; o banco grava a recusa).
 *
 * As libs reais rodam sobre o banco falso (./banco-falso.ts).
 */

vi.mock("@/lib/supabase/server", async () => {
  const { banco } = await import("./banco-falso")
  return { createClient: async () => banco.clienteDaSessao() }
})
vi.mock("@/lib/supabase/admin", async () => {
  const { banco } = await import("./banco-falso")
  return { criarClienteAdmin: () => banco.clienteDeServico() }
})

import { GET as abaRota } from "@/app/api/social/perfis/[username]/marcacoes/route"
import { DELETE as removerRota } from "@/app/api/social/marcacoes/[postId]/route"

async function conferir(resposta: Response) {
  const r = await conferirResposta(resposta)
  expect(r.cache).toBe("private, no-store")
  expect(r.proibidas).toEqual([])
  expect(r.crus).toEqual([])
  return r
}

const aba = async (username: string) =>
  conferir(await abaRota(new Request(`http://localhost/api/social/perfis/${username}/marcacoes`), { params: Promise.resolve({ username }) }))
const remover = async (postId: string) =>
  conferir(await removerRota(new Request(`http://localhost/api/social/marcacoes/${postId}`, { method: "DELETE" }), { params: Promise.resolve({ postId }) }))

let deFotos: Record<string, unknown>
let deViagem: Record<string, unknown>
let daEva: Record<string, unknown>

beforeEach(() => {
  banco.reiniciar()
  semearPerfis()
  esquecerLinksEmitidos()
  banco.sessao = ANA
  deFotos = semearPost({ author_id: BIA, caption: "Serra", photos: [fotoDe(BIA, 1), fotoDe(BIA, 2)] })
  deViagem = semearPost({ author_id: CAIO, trip_id: VIAGEM, title: "Chapada", destination: "GO", start_date: "2026-12-01", end_date: "2026-12-02", photos: [] })
  daEva = semearPost({ author_id: EVA, caption: "privado", photos: [fotoDe(EVA)] })
  semearMarca(deFotos.id, BIA, ANA)
  semearMarca(deViagem.id, CAIO, ANA)
  semearMarca(daEva.id, EVA, ANA)
  return () => vi.restoreAllMocks()
})

describe("GET /api/social/perfis/[username]/marcacoes (@RF09.14)", () => {
  it("200 na própria aba: chaves exatas; post sem viagem com a 1ª foto, de viagem sem foto, invisível só com quem marcou", async () => {
    const { status, corpo } = await aba("ana")
    expect(status).toBe(200)
    expect(Object.keys(corpo).sort()).toEqual(["marcacoes", "proprio"])
    expect(corpo.proprio).toBe(true)
    for (const m of corpo.marcacoes) expect(Object.keys(m).sort()).toEqual(["autor", "marcado_em", "post", "post_id"])

    const porPost = new Map(corpo.marcacoes.map((m: { post_id: string }) => [m.post_id, m]))
    expect(porPost.get(deFotos.id)).toMatchObject({
      autor: { username: "bia" },
      post: { title: null, destination: null, start_date: null, end_date: null, caption: "Serra", foto: urlDe(fotoDe(BIA, 1)) },
    })
    expect(Object.keys((porPost.get(deFotos.id) as { post: object }).post).sort()).toEqual(
      ["caption", "destination", "end_date", "foto", "start_date", "title"],
    )
    expect(porPost.get(deViagem.id)).toMatchObject({ post: { title: "Chapada", foto: null } })
    // Ser marcado não abre o post: a Eva é privada e a Ana não a segue.
    expect(porPost.get(daEva.id)).toMatchObject({ autor: { username: "eva" }, post: null })
  })

  it("200 na aba de outra pessoa: o post invisível não sai", async () => {
    semearMarca(daEva.id, EVA, BIA)
    const { corpo } = await aba("bia")
    expect(corpo.proprio).toBe(false)
    expect(corpo.marcacoes).toEqual([])
  })

  it("403 perfil privado sem acesso; 404 username inexistente; 400 formato; 401", async () => {
    expect((await aba("eva")).status).toBe(403)
    expect((await aba("ninguem")).status).toBe(404)
    expect((await aba("Nao Pode")).status).toBe(400)
    banco.sessao = null
    expect((await aba("ana")).status).toBe(401)
  })
})

describe("DELETE /api/social/marcacoes/[postId] (@RF09.14)", () => {
  it("200: a pessoa marcada remove a própria marca; o banco grava a recusa por post (sem viagem)", async () => {
    const { status, corpo } = await remover(deFotos.id as string)
    expect(status).toBe(200)
    expect(corpo).toEqual({ ok: true })
    expect(banco.tabelas.post_tags.find((t) => t.post_id === deFotos.id)).toBeUndefined()
    expect(banco.tabelas.post_tag_recusas).toEqual([{ trip_id: null, post_id: deFotos.id, author_id: BIA, tagged_id: ANA }])
  })

  it("200 mesmo sem enxergar o post (perfil privado)", async () => {
    expect((await remover(daEva.id as string)).status).toBe(200)
  })

  it("404: a autora não desmarca os outros por aqui", async () => {
    banco.sessao = BIA
    expect((await remover(deFotos.id as string)).status).toBe(404)
    expect(banco.tabelas.post_tags.find((t) => t.post_id === deFotos.id)).toBeDefined()
  })

  it("400 e 401", async () => {
    expect((await remover("x")).status).toBe(400)
    banco.sessao = null
    expect((await remover(deFotos.id as string)).status).toBe(401)
  })
})
