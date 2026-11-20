import { describe, it, expect, vi, beforeEach } from "vitest"
import {
  ANA,
  BIA,
  CAIO,
  CHAVES_AUTOR,
  CHAVES_PESSOA,
  CHAVES_POST_VISTO,
  CHAVES_VIAGEM,
  DORA,
  EVA,
  VIAGEM,
  banco,
  conferirResposta,
  fotoDe,
  semearMarca,
  semearPerfis,
  semearPost,
  urlDe,
} from "./banco-falso"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"

/**
 * @RF09.17 GET e DELETE /api/social/posts/[postId] — ver o post (404 quando
 * não existe ou a sessão não pode vê-lo, sem revelar) e excluí-lo (só a
 * autora; as fotos saem do bucket). @RF09.15 PATCH — editar a legenda e as
 * marcações depois de publicar. @RF09.13 marcar, com `marcado_invalido` e
 * `marcado_recusou` (com `recusados`).
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

// `after()` (next/server) agenda o esvaziamento da fila de fotos para depois
// da resposta. Fora do Next não há escopo de pedido (o `after` real lança): o
// dublê só guarda as tarefas, e o teste as roda quando quer. O esvaziamento é
// coberto em tests/lib/fila-fotos.test.ts; aqui só se prova que é agendado.
const agendadas = vi.hoisted(() => [] as (() => unknown)[])
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (tarefa: () => unknown) => {
    agendadas.push(tarefa)
  },
}))
vi.mock("@/lib/social/fila-fotos", () => ({ esvaziarFilaDeFotos: vi.fn(async () => 0) }))

import { DELETE, GET, PATCH } from "@/app/api/social/posts/[postId]/route"
import { esvaziarFilaDeFotos } from "@/lib/social/fila-fotos"

const contexto = (postId: string) => ({ params: Promise.resolve({ postId }) })
const rota = (postId: string) => `http://localhost/api/social/posts/${postId}`

async function conferir(resposta: Response) {
  const r = await conferirResposta(resposta)
  expect(r.cache).toBe("private, no-store")
  expect(r.proibidas).toEqual([])
  expect(r.crus).toEqual([])
  return r
}

const ver = async (postId: string) => conferir(await GET(new Request(rota(postId)), contexto(postId)))
const excluir = async (postId: string) => conferir(await DELETE(new Request(rota(postId), { method: "DELETE" }), contexto(postId)))
const editar = async (postId: string, corpo: unknown) =>
  conferir(
    await PATCH(
      new Request(rota(postId), {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
      }),
      contexto(postId),
    ),
  )

let postDaBia: Record<string, unknown>
let postDeViagemDaAna: Record<string, unknown>
let postDaEva: Record<string, unknown>

beforeEach(() => {
  banco.reiniciar()
  semearPerfis()
  esquecerLinksEmitidos()
  agendadas.length = 0
  vi.mocked(esvaziarFilaDeFotos).mockClear()
  banco.sessao = ANA
  banco.membros.set(VIAGEM, [ANA, BIA])
  postDaBia = semearPost({ author_id: BIA, caption: "Serra", photos: [fotoDe(BIA, 1), fotoDe(BIA, 2)] })
  semearMarca(postDaBia.id, BIA, ANA)
  postDeViagemDaAna = semearPost({
    author_id: ANA,
    trip_id: VIAGEM,
    title: "Chapada",
    destination: "Alto Paraíso",
    start_date: "2026-12-01",
    end_date: "2026-12-05",
    items: [{ title: "Trilha", notes: "senha", latitude: -14 }],
    places: [{ name: "Mirante", place_id: "ChIJ" }],
    photos: [],
  })
  postDaEva = semearPost({ author_id: EVA, caption: "privado", photos: [fotoDe(EVA)] })
  return () => vi.restoreAllMocks()
})

describe("GET /api/social/posts/[postId] (@RF09.17)", () => {
  it("200: post de outra pessoa visível — PostVisto com as chaves exatas, fotos assinadas na ordem, recusados vazio", async () => {
    const { status, corpo } = await ver(postDaBia.id as string)
    expect(status).toBe(200)
    expect(Object.keys(corpo).sort()).toEqual(["post", "recusados"])
    expect(corpo.recusados).toEqual([])
    const post = corpo.post
    expect(Object.keys(post).sort()).toEqual(CHAVES_POST_VISTO)
    expect(Object.keys(post.autor).sort()).toEqual(CHAVES_AUTOR)
    expect(Object.keys(post.marcados[0]).sort()).toEqual(CHAVES_PESSOA)
    expect(post).toMatchObject({
      id: postDaBia.id,
      autor: { username: "bia", full_name: "Bia Lima" },
      caption: "Serra",
      fotos: [urlDe(fotoDe(BIA, 1)), urlDe(fotoDe(BIA, 2))],
      marcados: [{ id: ANA, username: "ana" }],
      proprio: false,
      viagem: null,
    })
    // Fotos numa chamada ao Storage, avatares em outra.
    expect(banco.storage.assinaturas.filter((a) => a.bucket === "capas-posts")).toHaveLength(1)
  })

  it("200: post de viagem da própria sessão — viagem pela lista branca, 0 fotos, proprio e recusados (por viagem)", async () => {
    banco.tabelas.post_tag_recusas.push({ trip_id: VIAGEM, post_id: null, author_id: ANA, tagged_id: CAIO })
    const { status, corpo } = await ver(postDeViagemDaAna.id as string)
    expect(status).toBe(200)
    expect(Object.keys(corpo.post.viagem).sort()).toEqual(CHAVES_VIAGEM)
    expect(corpo.post).toMatchObject({ fotos: [], proprio: true })
    expect(corpo.post.viagem).toStrictEqual({
      title: "Chapada",
      destination: "Alto Paraíso",
      start_date: "2026-12-01",
      end_date: "2026-12-05",
      items: [{ title: "Trilha" }],
      places: [{ name: "Mirante" }],
    })
    expect(corpo.recusados).toEqual([CAIO])
  })

  it("404: perfil privado que a sessão não segue responde igual ao post que não existe", async () => {
    const invisivel = await ver(postDaEva.id as string)
    const inexistente = await ver("99999999-0000-4000-8000-000000000000")
    expect(invisivel.status).toBe(404)
    expect(invisivel.corpo).toEqual(inexistente.corpo)
  })

  it("404 mesmo com a policy de SELECT errada: a autorização explícita (pode_ver_rede) decide", async () => {
    banco.selectDePostsSemPolicy = true
    expect((await ver(postDaEva.id as string)).status).toBe(404)
    expect((await excluir(postDaEva.id as string)).status).toBe(404)
    expect((await editar(postDaEva.id as string, { legenda: "x" })).status).toBe(404)
  })

  it("200: seguidora aceita da Eva vê o post privado", async () => {
    banco.segue.add(`${ANA}->${EVA}`)
    expect((await ver(postDaEva.id as string)).status).toBe(200)
  })

  it("400: postId fora do formato, sem ir ao banco", async () => {
    const { status } = await ver("nao-e-uuid")
    expect(status).toBe(400)
    expect(banco.consultas).toEqual([])
  })

  it("401: sem sessão", async () => {
    banco.sessao = null
    expect((await ver(postDaBia.id as string)).status).toBe(401)
  })

  it("500: erro do banco não vaza", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    banco.falhas.push({ tabela: "posts", operacao: "select", erro: { code: "XX000", message: "detalhe cru" } })
    const { status, corpo } = await ver(postDaBia.id as string)
    expect(status).toBe(500)
    expect(JSON.stringify(corpo)).not.toContain("detalhe cru")
  })
})

describe("DELETE /api/social/posts/[postId] (@RF09.17)", () => {
  it("200: a autora exclui; o post, as marcas e as fotos saem", async () => {
    banco.sessao = BIA
    const { status, corpo } = await excluir(postDaBia.id as string)
    expect(status).toBe(200)
    expect(corpo).toEqual({ ok: true })
    expect(banco.tabelas.posts.find((p) => p.id === postDaBia.id)).toBeUndefined()
    expect(banco.tabelas.post_tags).toEqual([])
    expect(banco.storage.remocoes).toEqual([{ bucket: "capas-posts", caminhos: [fotoDe(BIA, 1), fotoDe(BIA, 2)] }])
  })

  it("200: excluir o post de viagem equivale a despublicar", async () => {
    expect((await excluir(postDeViagemDaAna.id as string)).status).toBe(200)
    expect(banco.tabelas.posts.find((p) => p.id === postDeViagemDaAna.id)).toBeUndefined()
  })

  it("403: quem vê o post e não é a autora não exclui (nem a pessoa marcada)", async () => {
    const { status } = await excluir(postDaBia.id as string)
    expect(status).toBe(403)
    expect(banco.tabelas.posts.find((p) => p.id === postDaBia.id)).toBeDefined()
    expect(banco.storage.remocoes).toEqual([])
  })

  it("404: post que a sessão não vê", async () => {
    expect((await excluir(postDaEva.id as string)).status).toBe(404)
    expect(banco.tabelas.posts.find((p) => p.id === postDaEva.id)).toBeDefined()
  })

  it("400 e 401", async () => {
    expect((await excluir("x")).status).toBe(400)
    banco.sessao = null
    expect((await excluir(postDaBia.id as string)).status).toBe(401)
  })

  it("200 mesmo se o Storage falhar: o post já saiu", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    banco.sessao = BIA
    banco.storage.falharRemocao = true
    expect((await excluir(postDaBia.id as string)).status).toBe(200)
  })

  it("200: agenda o esvaziamento da fila de fotos para depois da resposta, com o cliente de serviço", async () => {
    banco.sessao = BIA
    expect((await excluir(postDaBia.id as string)).status).toBe(200)

    // A resposta saiu sem esperar o esvaziamento: ele só roda quando o Next
    // executa a tarefa agendada.
    expect(agendadas).toHaveLength(1)
    expect(esvaziarFilaDeFotos).not.toHaveBeenCalled()
    await agendadas[0]()
    expect(esvaziarFilaDeFotos).toHaveBeenCalledTimes(1)
    expect(vi.mocked(esvaziarFilaDeFotos).mock.calls[0][0]).toHaveProperty("storage")
  })

  it("quem não exclui (400, 401, 403, 404) não agenda nada", async () => {
    expect((await excluir("x")).status).toBe(400)
    expect((await excluir(postDaBia.id as string)).status).toBe(403)
    expect((await excluir(postDaEva.id as string)).status).toBe(404)
    banco.sessao = null
    expect((await excluir(postDaBia.id as string)).status).toBe(401)
    expect(agendadas).toEqual([])
  })
})

describe("PATCH /api/social/posts/[postId] (@RF09.15 @RF09.13)", () => {
  beforeEach(() => {
    banco.sessao = BIA
  })

  it("200: troca a legenda e as marcações; quem já estava marcado fica, sem tocar nas fotos", async () => {
    const { status, corpo } = await editar(postDaBia.id as string, { legenda: " Nova ", marcados: [ANA, CAIO] })
    expect(status).toBe(200)
    expect(Object.keys(corpo.post).sort()).toEqual(CHAVES_POST_VISTO)
    expect(corpo.post).toMatchObject({ caption: "Nova", marcados: [{ id: ANA }, { id: CAIO }] })
    const gravado = banco.tabelas.posts.find((p) => p.id === postDaBia.id)!
    expect(gravado.photos).toEqual([fotoDe(BIA, 1), fotoDe(BIA, 2)])
  })

  it("200: legenda null tira a legenda; marcados [] desmarca todos", async () => {
    const { corpo } = await editar(postDaBia.id as string, { legenda: null, marcados: [] })
    expect(corpo.post).toMatchObject({ caption: null, marcados: [] })
    expect(banco.tabelas.post_tags).toEqual([])
  })

  it.each([
    ["vazio", {}],
    ["fotos", { photos: [] }],
    ["author_id", { legenda: "x", author_id: ANA }],
    ["legenda longa", { legenda: "a".repeat(281) }],
    ["marcado repetido", { marcados: [ANA, ANA] }],
    ["JSON malformado", "{nao"],
  ])("400: %s", async (_caso, corpo) => {
    const antes = JSON.stringify(banco.tabelas.posts)
    expect((await editar(postDaBia.id as string, corpo)).status).toBe(400)
    expect(JSON.stringify(banco.tabelas.posts)).toBe(antes)
  })

  it.each([
    ["a própria autora", BIA],
    ["sem username", DORA],
  ])("400 marcado_invalido: %s, sem mudar nada", async (_caso, id) => {
    const { status, corpo } = await editar(postDaBia.id as string, { legenda: "x", marcados: [id] })
    expect(status).toBe(400)
    expect(corpo.codigo).toBe("marcado_invalido")
    expect(banco.tabelas.posts.find((p) => p.id === postDaBia.id)!.caption).toBe("Serra")
  })

  it("400 marcado_recusou com recusados: quem removeu a própria marca deste post não volta", async () => {
    // A Ana remove a própria marca: o banco grava a recusa por post.
    banco.sessao = ANA
    banco.tabelas.post_tags = []
    banco.tabelas.post_tag_recusas.push({ trip_id: null, post_id: postDaBia.id, author_id: BIA, tagged_id: ANA })
    banco.sessao = BIA
    const { status, corpo } = await editar(postDaBia.id as string, { legenda: "x", marcados: [CAIO, ANA] })
    expect(status).toBe(400)
    expect(corpo).toMatchObject({ codigo: "marcado_recusou", recusados: [ANA] })
    expect(Object.keys(corpo).sort()).toEqual(["codigo", "error", "recusados"])
    expect(banco.tabelas.posts.find((p) => p.id === postDaBia.id)!.caption).toBe("Serra")
  })

  it("403: quem vê e não é a autora; 404: quem não vê", async () => {
    banco.sessao = ANA
    expect((await editar(postDaBia.id as string, { legenda: "x" })).status).toBe(403)
    expect((await editar(postDaEva.id as string, { legenda: "x" })).status).toBe(404)
    expect(banco.tabelas.posts.find((p) => p.id === postDaBia.id)!.caption).toBe("Serra")
  })

  it("400 e 401", async () => {
    expect((await editar("x", { legenda: "x" })).status).toBe(400)
    banco.sessao = null
    expect((await editar(postDaBia.id as string, { legenda: "x" })).status).toBe(401)
  })
})
