import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest"
import sharp from "sharp"
import {
  ANA,
  BIA,
  CAIO,
  CHAVES_AUTOR,
  CHAVES_PESSOA,
  CHAVES_POST_VISTO,
  DORA,
  banco,
  conferirResposta,
  semearPerfis,
  urlAvatar,
  urlDe,
} from "./banco-falso"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"
import { LIMITE_FOTO_POST_BYTES } from "@/lib/social/capa"
import { LADO_CAPA } from "@/lib/social/imagem"
import { MARCAS, chunksDoWebp, contemTexto, jpegComGps, pngLiso, webpLiso } from "../fixtures/imagens"

/**
 * @RF09.15 POST /api/social/posts — criar um post com 1 a 3 fotos (na ordem do
 * formulário), legenda opcional e marcados. @RF09.13 marcar qualquer perfil
 * com username, menos a própria sessão.
 *
 * As libs reais (post, capa, marcacoes, imagem com o sharp de verdade) rodam
 * sobre o banco falso (./banco-falso.ts), que imita as policies de `posts` e
 * `post_tags` e guarda os bytes entregues ao Storage.
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

import { POST } from "@/app/api/social/posts/route"
import { esvaziarFilaDeFotos } from "@/lib/social/fila-fotos"

const ROTA = "http://localhost/api/social/posts"
let PNG: Uint8Array
let JPEG_GPS: Uint8Array
let WEBP: Uint8Array

beforeAll(async () => {
  PNG = await pngLiso(48, 32)
  JPEG_GPS = await jpegComGps({ largura: 2000, altura: 1000 })
  WEBP = await webpLiso(40, 40)
})

function arquivo(bytes: Uint8Array, nome = "foto.png", tipo = "image/png") {
  return new File([new Uint8Array(bytes)], nome, { type: tipo })
}

function pedido({
  fotos = [PNG],
  legenda,
  marcados,
  extra,
}: { fotos?: (Uint8Array | string)[]; legenda?: string; marcados?: unknown; extra?: [string, string] } = {}) {
  const dados = new FormData()
  for (const foto of fotos) dados.append("fotos", typeof foto === "string" ? foto : arquivo(foto))
  if (legenda !== undefined) dados.append("legenda", legenda)
  if (marcados !== undefined) dados.append("marcados", typeof marcados === "string" ? marcados : JSON.stringify(marcados))
  if (extra) dados.append(extra[0], extra[1])
  return new Request(ROTA, { method: "POST", body: dados })
}

async function criar(req: Request = pedido()) {
  const r = await conferirResposta(await POST(req))
  expect(r.cache).toBe("private, no-store")
  expect(r.proibidas).toEqual([])
  expect(r.crus).toEqual([])
  return r
}

beforeEach(() => {
  banco.reiniciar()
  semearPerfis()
  banco.sessao = ANA
  esquecerLinksEmitidos()
  agendadas.length = 0
  vi.mocked(esvaziarFilaDeFotos).mockClear()
  return () => vi.restoreAllMocks()
})

describe("POST /api/social/posts (@RF09.15)", () => {
  it("201: grava o post com as fotos na ordem, a legenda e os marcados, e devolve o PostVisto com as chaves exatas", async () => {
    const { status, corpo } = await criar(pedido({ fotos: [PNG, WEBP, JPEG_GPS], legenda: "  Praia!  ", marcados: [BIA, CAIO] }))

    expect(status).toBe(201)
    expect(Object.keys(corpo)).toEqual(["post"])
    const post = corpo.post
    expect(Object.keys(post).sort()).toEqual(CHAVES_POST_VISTO)
    expect(Object.keys(post.autor).sort()).toEqual(CHAVES_AUTOR)
    for (const p of post.marcados) expect(Object.keys(p).sort()).toEqual(CHAVES_PESSOA)

    const [gravado] = banco.tabelas.posts
    expect(gravado).toMatchObject({ author_id: ANA, caption: "Praia!", trip_id: null, title: null })
    const caminhos = gravado.photos as string[]
    expect(caminhos).toHaveLength(3)
    // Ordem do formulário = ordem dos envios = ordem gravada = ordem das URLs.
    expect(banco.storage.envios.map((e) => e.caminho)).toEqual(caminhos)
    for (const c of caminhos) expect(c).toMatch(new RegExp(`^${ANA}/[0-9a-f-]{36}\\.webp$`))
    expect(post).toMatchObject({
      id: gravado.id,
      autor: { username: "ana", full_name: "Ana Souza", avatar_url: null },
      caption: "Praia!",
      fotos: caminhos.map(urlDe),
      proprio: true,
      viagem: null,
    })
    expect(post.marcados).toEqual([
      { id: BIA, username: "bia", full_name: "Bia Lima", avatar_url: urlAvatar(`${BIA}/99999999-9999-4999-8999-999999999999.webp`) },
      { id: CAIO, username: "caio", full_name: "Caio Reis", avatar_url: null },
    ])
    expect(banco.tabelas.post_tags.map((t) => t.tagged_id)).toEqual([BIA, CAIO])
  })

  it("201: JPEG com GPS — o Storage recebe WebP regerado, sem EXIF, GPS nem XMP, dentro do lado da capa", async () => {
    const { status } = await criar(pedido({ fotos: [JPEG_GPS] }))
    expect(status).toBe(201)

    const [envio] = banco.storage.envios
    expect(envio).toMatchObject({ bucket: "capas-posts", contentType: "image/webp", upsert: false })
    for (const marca of [MARCAS.exif, MARCAS.gps, MARCAS.xmp, "Exif"]) expect(contemTexto(envio.bytes, marca)).toBe(false)
    expect(chunksDoWebp(envio.bytes).chunks).not.toContain("EXIF")
    const meta = await sharp(envio.bytes).metadata()
    expect(meta.format).toBe("webp")
    expect(meta.exif).toBeUndefined()
    expect(Math.max(meta.width!, meta.height!)).toBeLessThanOrEqual(LADO_CAPA)
    // O recebido nunca vai ao bucket.
    expect(Buffer.from(envio.bytes).equals(Buffer.from(JPEG_GPS))).toBe(false)
  })

  it("201: sem legenda nem marcados", async () => {
    const { status, corpo } = await criar(pedido({ fotos: [PNG], legenda: "   " }))
    expect(status).toBe(201)
    expect(corpo.post).toMatchObject({ caption: null, marcados: [] })
  })

  it("201: agenda o esvaziamento da fila de fotos para depois da resposta, com o cliente de serviço", async () => {
    const { status } = await criar(pedido({ fotos: [PNG] }))
    expect(status).toBe(201)

    // A resposta saiu sem esperar o esvaziamento: ele só roda quando o Next
    // executa a tarefa agendada.
    expect(agendadas).toHaveLength(1)
    expect(esvaziarFilaDeFotos).not.toHaveBeenCalled()
    await agendadas[0]()
    expect(esvaziarFilaDeFotos).toHaveBeenCalledTimes(1)
    expect(vi.mocked(esvaziarFilaDeFotos).mock.calls[0][0]).toHaveProperty("storage")
  })

  it("quem não publica (401, 403, 400) não agenda nada", async () => {
    expect((await criar(pedido({ fotos: [] }))).status).toBe(400)
    banco.sessao = DORA
    expect((await criar()).status).toBe(403)
    banco.sessao = null
    expect((await criar()).status).toBe(401)
    expect(agendadas).toEqual([])
  })

  it("401: sem sessão, sem ler o formulário nem enviar nada", async () => {
    banco.sessao = null
    const { status } = await criar()
    expect(status).toBe(401)
    expect(banco.storage.envios).toEqual([])
  })

  it("403 sem_username: quem não escolheu username não publica", async () => {
    banco.sessao = DORA
    const { status, corpo } = await criar()
    expect(status).toBe(403)
    expect(corpo.codigo).toBe("sem_username")
    expect(banco.storage.envios).toEqual([])
    expect(banco.tabelas.posts).toEqual([])
  })

  it("429: o limite de envios (regra da foto de perfil) para antes de ler o corpo", async () => {
    banco.limite = { permitido: false, retry_after: 42 }
    const resposta = await POST(pedido())
    const { status } = await conferirResposta(resposta)
    expect(status).toBe(429)
    expect(resposta.headers.get("retry-after")).toBe("42")
    expect(banco.rpcs.find((r) => r.nome === "consumir_limite")?.args).toMatchObject({ p_chave: "foto-perfil" })
    expect(banco.storage.envios).toEqual([])
  })

  it.each([
    ["sem foto", { fotos: [] }],
    ["4 fotos", { fotos: [new Uint8Array(0), new Uint8Array(0), new Uint8Array(0), new Uint8Array(0)].map(() => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])) }],
    ["foto que não é imagem", { fotos: [new TextEncoder().encode("%PDF-1.4 não é imagem")] }],
    ["foto como texto", { fotos: ["não sou arquivo"] }],
    ["legenda longa", { legenda: "a".repeat(281) }],
    ["marcados que não são JSON", { marcados: "[nao-json" }],
    ["marcado que não é uuid", { marcados: ["x"] }],
    ["21 marcados", { marcados: Array.from({ length: 21 }, (_, i) => `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000`) }],
    ["campo não permitido", { extra: ["author_id", BIA] as [string, string] }],
  ])("400: %s — nada vai ao Storage nem ao banco", async (_caso, opcoes) => {
    const { status } = await criar(pedido(opcoes as Parameters<typeof pedido>[0]))
    expect(status).toBe(400)
    expect(banco.storage.envios).toEqual([])
    expect(banco.tabelas.posts).toEqual([])
  })

  it("400: 4 fotos válidas — o máximo é 3, antes de regerar ou enviar", async () => {
    const { status } = await criar(pedido({ fotos: [PNG, PNG, PNG, PNG] }))
    expect(status).toBe(400)
    expect(banco.storage.envios).toEqual([])
  })

  it("400: a assinatura de imagem com bytes que o sharp não decodifica (só o cabeçalho PNG)", async () => {
    const falso = new Uint8Array(200)
    falso.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const { status } = await criar(pedido({ fotos: [falso] }))
    expect(status).toBe(400)
    expect(banco.storage.envios).toEqual([])
  })

  it.each([
    ["a própria sessão", ANA],
    ["conta sem username", DORA],
    ["uuid de ninguém", "99999999-0000-4000-8000-000000000000"],
  ])("400 marcado_invalido: %s, antes de enviar qualquer foto", async (_caso, id) => {
    const { status, corpo } = await criar(pedido({ marcados: [BIA, id] }))
    expect(status).toBe(400)
    expect(corpo.codigo).toBe("marcado_invalido")
    expect(banco.storage.envios).toEqual([])
    expect(banco.tabelas.posts).toEqual([])
  })

  it("413: foto acima de 2 MB", async () => {
    const grande = new Uint8Array(LIMITE_FOTO_POST_BYTES + 1)
    grande.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const { status } = await criar(pedido({ fotos: [grande] }))
    expect(status).toBe(413)
    expect(banco.storage.envios).toEqual([])
  })

  it("413: Content-Length declarado acima de 3 fotos de 2 MB, sem montar o formulário", async () => {
    const req = new Request(ROTA, {
      method: "POST",
      headers: { "content-length": String(3 * LIMITE_FOTO_POST_BYTES + 70 * 1024) },
      body: "x",
    })
    const { status } = await criar(req)
    expect(status).toBe(413)
  })

  it("500 do Storage no 2º envio: apaga o 1º, não grava post, e a resposta não vaza a mensagem", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    banco.storage.falharEnvioNo = 1
    const { status, corpo } = await criar(pedido({ fotos: [PNG, PNG] }))
    expect(status).toBe(500)
    expect(JSON.stringify(corpo)).not.toContain("storage fora do ar")
    expect(banco.storage.remocoes).toEqual([{ bucket: "capas-posts", caminhos: [banco.storage.envios[0].caminho] }])
    expect(banco.tabelas.posts).toEqual([])
  })

  it("falha ao gravar o post: as fotos enviadas saem do bucket", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    banco.falhas.push({ tabela: "posts", operacao: "insert", erro: { code: "XX000", message: "detalhe cru" } })
    const { status, corpo } = await criar(pedido({ fotos: [PNG, PNG] }))
    expect(status).toBe(500)
    expect(JSON.stringify(corpo)).not.toContain("detalhe cru")
    expect(banco.storage.arquivos.size).toBe(0)
  })

  it("marca recusada pelo banco (corrida): o post e as fotos são desfeitos, 400 marcado_recusou", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    banco.falhas.push({ tabela: "post_tags", operacao: "insert", erro: { code: "42501" } })
    const { status, corpo } = await criar(pedido({ marcados: [BIA] }))
    expect(status).toBe(400)
    expect(corpo.codigo).toBe("marcado_recusou")
    expect(banco.tabelas.posts).toEqual([])
    expect(banco.storage.arquivos.size).toBe(0)
  })
})
