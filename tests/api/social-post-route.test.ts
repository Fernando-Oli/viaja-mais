import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import sharp from "sharp"
import {
  ANA,
  BIA,
  CAIO,
  CHAVES_PESSOA,
  CHAVES_POST_VISTO,
  CHAVES_VIAGEM,
  DORA,
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
import type { ProjecaoComLugares } from "@/lib/social/posts"
import { MARCAS, contemTexto, jpegComGps, pngLiso } from "../fixtures/imagens"

/**
 * @RF09.7 O post de uma viagem: /api/social/viagens/[tripId]/post (GET, POST,
 * PATCH, DELETE) e /post/fotos (PUT, 0 a 3 fotos, substitui todas).
 * @RF09.13 marcar qualquer perfil com username (membros só como sugestão),
 * menos quem recusou (`recusados`).
 *
 * As libs reais rodam sobre o banco falso (./banco-falso.ts). A autorização
 * da viagem (`exigirMembro`, Plataforma) e a projeção pública (Audrey) são
 * dubladas: são de outros domínios e têm testes próprios.
 */

const estado = vi.hoisted(() => ({ membro: true, projecao: null as unknown }))

vi.mock("@/lib/supabase/server", async () => {
  const { banco } = await import("./banco-falso")
  return { createClient: async () => banco.clienteDaSessao() }
})
vi.mock("@/lib/supabase/admin", async () => {
  const { banco } = await import("./banco-falso")
  return { criarClienteAdmin: () => banco.clienteDeServico() }
})
vi.mock("@/lib/authz/trip", async () => {
  const { semPermissao } = await import("@/lib/http")
  return {
    exigirMembro: async () => {
      if (!estado.membro) throw semPermissao("esta viagem")
      return "member"
    },
  }
})
vi.mock("@/lib/trips/publico", async (original) => ({
  ...(await original<typeof import("@/lib/trips/publico")>()),
  projecaoPublicaDaViagem: async () => estado.projecao,
}))

import { DELETE, GET, PATCH, POST } from "@/app/api/social/viagens/[tripId]/post/route"
import { PUT } from "@/app/api/social/viagens/[tripId]/post/fotos/route"

const ROTA = `http://localhost/api/social/viagens/${VIAGEM}/post`
const contexto = (tripId = VIAGEM) => ({ params: Promise.resolve({ tripId }) })

function projecao(): ProjecaoComLugares {
  return {
    title: "Chapada",
    destination: "Alto Paraíso",
    start_date: "2026-12-01",
    end_date: "2026-12-05",
    budget: 9000,
    currency: "BRL",
    itens: [
      { id: "c0000000-0000-4000-8000-000000000001", title: "Trilha", date: "2026-12-02", start_time: "08:00", end_time: null, category: "activity", location: "Vale da Lua", description: "água", notes: "senha", latitude: -14 },
    ],
    lugares: [{ id: "e0000000-0000-4000-8000-000000000001", name: "Mirante", category: null, address: "km 3", notes: "x" }],
  } as unknown as ProjecaoComLugares
}

const CORPO = { legenda: "Que viagem", roteiro: { local: false, descricao: false }, lugares: null, marcados: [] as string[] }

async function conferir(resposta: Response) {
  const r = await conferirResposta(resposta)
  expect(r.cache).toBe("private, no-store")
  expect(r.proibidas).toEqual([])
  expect(r.crus).toEqual([])
  return r
}

const json = (metodo: string, corpo: unknown) =>
  new Request(ROTA, { method: metodo, headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) })
const ver = async (tripId?: string) => conferir(await GET(new Request(ROTA), contexto(tripId)))
const publicar = async (corpo: unknown = CORPO, tripId?: string) => conferir(await POST(json("POST", corpo), contexto(tripId)))
const atualizar = async (corpo: unknown = CORPO, tripId?: string) => conferir(await PATCH(json("PATCH", corpo), contexto(tripId)))
const despublicar = async (tripId?: string) => conferir(await DELETE(new Request(ROTA, { method: "DELETE" }), contexto(tripId)))

let PNG: Uint8Array
let JPEG: Uint8Array
beforeAll(async () => {
  PNG = await pngLiso(30, 20)
  JPEG = await jpegComGps({ largura: 40, altura: 30 })
})

function formulario(fotos: Uint8Array[], extra?: [string, string]) {
  const dados = new FormData()
  for (const f of fotos) dados.append("fotos", new File([new Uint8Array(f)], "f.png", { type: "image/png" }))
  if (extra) dados.append(extra[0], extra[1])
  return new Request(`${ROTA}/fotos`, { method: "PUT", body: dados })
}
const trocarFotos = async (fotos: Uint8Array[], tripId?: string, extra?: [string, string]) =>
  conferir(await PUT(formulario(fotos, extra), contexto(tripId)))

/** O post de viagem da sessão (ANA), gravado direto. */
const postDaAna = (campos: Record<string, unknown> = {}) =>
  semearPost({
    author_id: ANA,
    trip_id: VIAGEM,
    title: "Chapada",
    destination: "Alto Paraíso",
    start_date: "2026-12-01",
    end_date: "2026-12-05",
    ...campos,
  })

beforeEach(() => {
  banco.reiniciar()
  semearPerfis()
  esquecerLinksEmitidos()
  banco.sessao = ANA
  banco.membros.set(VIAGEM, [ANA, BIA, DORA])
  estado.membro = true
  estado.projecao = projecao()
  return () => vi.restoreAllMocks()
})

describe("GET /api/social/viagens/[tripId]/post (@RF09.7 @RF09.13)", () => {
  it("200 sem post: prévia, sugestões (membros com username, com recusou) e recusados de todos, membros ou não", async () => {
    banco.tabelas.post_tag_recusas.push(
      { trip_id: VIAGEM, post_id: null, author_id: ANA, tagged_id: BIA },
      { trip_id: VIAGEM, post_id: null, author_id: ANA, tagged_id: CAIO },
    )
    const { status, corpo } = await ver()
    expect(status).toBe(200)
    expect(Object.keys(corpo).sort()).toEqual(["marcaveis", "post", "previa", "recusados"])
    expect(corpo.post).toBeNull()
    expect(corpo.marcaveis).toEqual([
      { id: BIA, username: "bia", full_name: "Bia Lima", avatar_url: expect.stringContaining("avatars"), recusou: true },
    ])
    expect(corpo.recusados).toEqual([BIA, CAIO].sort())
    expect(corpo.previa.itens[0]).not.toHaveProperty("id")
    expect(JSON.stringify(corpo)).not.toContain("senha")
  })

  it("200 com post: o post é o PostVisto (chaves exatas, viagem pela lista branca)", async () => {
    const meu = postDaAna({ photos: [fotoDe(ANA)], items: [{ title: "Trilha", notes: "x" }] })
    semearMarca(meu.id, ANA, CAIO)
    const { corpo } = await ver()
    expect(Object.keys(corpo.post).sort()).toEqual(CHAVES_POST_VISTO)
    expect(Object.keys(corpo.post.viagem).sort()).toEqual(CHAVES_VIAGEM)
    expect(corpo.post).toMatchObject({ id: meu.id, fotos: [urlDe(fotoDe(ANA))], proprio: true, marcados: [{ id: CAIO }] })
    expect(corpo.post.viagem.items).toStrictEqual([{ title: "Trilha" }])
  })

  it("403 não-membro; 400 tripId inválido; 401 sem sessão", async () => {
    estado.membro = false
    expect((await ver()).status).toBe(403)
    estado.membro = true
    expect((await ver("x")).status).toBe(400)
    banco.sessao = null
    expect((await ver()).status).toBe(401)
  })
})

describe("POST /api/social/viagens/[tripId]/post (@RF09.7 @RF09.13)", () => {
  it("201: publica a cópia, sem fotos, marcando quem não é membro (marcação aberta)", async () => {
    const { status, corpo } = await publicar({ ...CORPO, marcados: [CAIO, BIA] })
    expect(status).toBe(201)
    expect(Object.keys(corpo.post).sort()).toEqual(CHAVES_POST_VISTO)
    for (const p of corpo.post.marcados) expect(Object.keys(p).sort()).toEqual(CHAVES_PESSOA)
    expect(corpo.post).toMatchObject({ caption: "Que viagem", fotos: [], proprio: true, viagem: { title: "Chapada" } })
    const [gravado] = banco.tabelas.posts
    expect(gravado).toMatchObject({ trip_id: VIAGEM, author_id: ANA, photos: [] })
    expect(banco.tabelas.post_tags.map((t) => t.tagged_id).sort()).toEqual([BIA, CAIO].sort())
  })

  it("400 marcado_invalido (sem username), antes de gravar", async () => {
    const { status, corpo } = await publicar({ ...CORPO, marcados: [DORA] })
    expect(status).toBe(400)
    expect(corpo.codigo).toBe("marcado_invalido")
    expect(banco.tabelas.posts).toEqual([])
  })

  it("400 marcado_recusou com recusados, antes de gravar", async () => {
    banco.tabelas.post_tag_recusas.push({ trip_id: VIAGEM, post_id: null, author_id: ANA, tagged_id: CAIO })
    const { status, corpo } = await publicar({ ...CORPO, marcados: [BIA, CAIO] })
    expect(status).toBe(400)
    expect(corpo).toEqual({ error: expect.any(String), codigo: "marcado_recusou", recusados: [CAIO] })
    expect(banco.tabelas.posts).toEqual([])
  })

  it("400 com código quando a viagem não cabe no post (ViagemForaDoPost)", async () => {
    estado.projecao = { ...projecao(), end_date: "2026-11-01" }
    const { status, corpo } = await publicar()
    expect(status).toBe(400)
    expect(corpo.codigo).toBe("datas_da_viagem_invertidas")
  })

  it("400 corpo inválido; 403 sem_username; 403 não-membro; 409 já publicado; 401", async () => {
    expect((await publicar({ ...CORPO, trip_id: VIAGEM })).status).toBe(400)
    banco.sessao = DORA
    expect((await publicar()).corpo.codigo).toBe("sem_username")
    banco.sessao = ANA
    estado.membro = false
    expect((await publicar()).status).toBe(403)
    estado.membro = true
    postDaAna()
    banco.falhas.push({ tabela: "posts", operacao: "insert", erro: { code: "23505" } })
    expect((await publicar()).status).toBe(409)
    banco.sessao = null
    expect((await publicar()).status).toBe(401)
  })
})

describe("PATCH e DELETE /api/social/viagens/[tripId]/post (@RF09.7)", () => {
  it("200: atualiza a cópia e as marcas; quem já estava marcado e perdeu o username continua", async () => {
    const meu = postDaAna({ caption: "velha" })
    semearMarca(meu.id, ANA, CAIO)
    banco.tabelas.profiles.find((p) => p.id === CAIO)!.username = null
    const { status, corpo } = await atualizar({ ...CORPO, legenda: "nova", marcados: [CAIO] })
    expect(status).toBe(200)
    expect(corpo.post.caption).toBe("nova")
    expect(banco.tabelas.post_tags.map((t) => t.tagged_id)).toEqual([CAIO])
  })

  it("404 sem post; 403 não-membro; 400 corpo", async () => {
    expect((await atualizar()).status).toBe(404)
    estado.membro = false
    expect((await atualizar()).status).toBe(403)
    estado.membro = true
    expect((await atualizar({ x: 1 })).status).toBe(400)
  })

  it("DELETE 200: despublica e apaga as fotos, mesmo sem ser mais membro", async () => {
    postDaAna({ photos: [fotoDe(ANA, 1), fotoDe(ANA, 2)] })
    estado.membro = false
    const { status, corpo } = await despublicar()
    expect(status).toBe(200)
    expect(corpo).toEqual({ ok: true })
    expect(banco.tabelas.posts).toEqual([])
    expect(banco.storage.remocoes).toEqual([{ bucket: "capas-posts", caminhos: [fotoDe(ANA, 1), fotoDe(ANA, 2)] }])
  })

  it("DELETE 404 sem post; 400; 401", async () => {
    expect((await despublicar()).status).toBe(404)
    expect((await despublicar("x")).status).toBe(400)
    banco.sessao = null
    expect((await despublicar()).status).toBe(401)
  })
})

describe("PUT /api/social/viagens/[tripId]/post/fotos (@RF09.7)", () => {
  it("200: substitui todas, na ordem; WebP sem GPS; apaga as anteriores; devolve o PostVisto", async () => {
    postDaAna({ photos: [fotoDe(ANA, 1)] })
    const { status, corpo } = await trocarFotos([JPEG, PNG])
    expect(status).toBe(200)
    expect(Object.keys(corpo)).toEqual(["post"])
    const novas = banco.tabelas.posts[0].photos as string[]
    expect(novas).toEqual(banco.storage.envios.map((e) => e.caminho))
    expect(corpo.post.fotos).toEqual(novas.map(urlDe))
    expect(banco.storage.remocoes).toEqual([{ bucket: "capas-posts", caminhos: [fotoDe(ANA, 1)] }])
    for (const marca of [MARCAS.gps, MARCAS.exif]) expect(contemTexto(banco.storage.envios[0].bytes, marca)).toBe(false)
    expect((await sharp(banco.storage.envios[0].bytes).metadata()).format).toBe("webp")
  })

  it("200: 0 fotos tira todas (o post de viagem fica com o grafismo)", async () => {
    postDaAna({ photos: [fotoDe(ANA, 1)] })
    const { status, corpo } = await trocarFotos([])
    expect(status).toBe(200)
    expect(corpo.post.fotos).toEqual([])
    expect(banco.tabelas.posts[0].photos).toEqual([])
  })

  it("409: outra aba trocou as fotos entre a leitura e a troca; as recém-enviadas saem do bucket", async () => {
    const meu = postDaAna({ photos: [fotoDe(ANA, 1)] })
    banco.antesDe = (tabela, operacao) => {
      if (tabela === "posts" && operacao === "update") meu.photos = [fotoDe(ANA, 2)]
    }
    const { status } = await trocarFotos([PNG])
    expect(status).toBe(409)
    expect(meu.photos).toEqual([fotoDe(ANA, 2)])
    expect(banco.storage.arquivos.has(`capas-posts/${banco.storage.envios[0].caminho}`)).toBe(false)
    // A foto da outra aba não foi apagada.
    expect(banco.storage.remocoes.flatMap((r) => r.caminhos)).not.toContain(fotoDe(ANA, 2))
  })

  it("500 na troca: as recém-enviadas saem do bucket, sem vazar a mensagem", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    postDaAna({ photos: [fotoDe(ANA, 1)] })
    banco.falhas.push({ tabela: "posts", operacao: "update", erro: { code: "XX000", message: "detalhe cru" } })
    const { status, corpo } = await trocarFotos([PNG])
    expect(status).toBe(500)
    expect(JSON.stringify(corpo)).not.toContain("detalhe cru")
    expect(banco.storage.arquivos.has(`capas-posts/${banco.storage.envios[0].caminho}`)).toBe(false)
  })

  it("400 com 4 fotos ou campo estranho; 404 sem post; 403; 429; 401", async () => {
    expect((await trocarFotos([PNG, PNG, PNG, PNG])).status).toBe(400)
    postDaAna()
    expect((await trocarFotos([PNG], undefined, ["photos", "x"])).status).toBe(400)
    banco.tabelas.posts = []
    expect((await trocarFotos([PNG])).status).toBe(404)
    expect(banco.storage.envios).toEqual([])
    estado.membro = false
    expect((await trocarFotos([PNG])).status).toBe(403)
    estado.membro = true
    banco.limite = { permitido: false, retry_after: 9 }
    expect((await trocarFotos([PNG])).status).toBe(429)
    banco.sessao = null
    expect((await trocarFotos([PNG])).status).toBe(401)
  })
})
