import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ErroHttp } from "@/lib/http"
import {
  ANA,
  BIA,
  CAIO,
  CAPA,
  DORA,
  LUGAR_BAR,
  LUGAR_PRAIA,
  POST_ID,
  TRIP,
  URL_CAPA,
  URL_FOTO_BIA,
  argumentosDe,
  estado,
  funcoesChamadas,
  pessoa,
  postPadrao,
  reiniciar,
} from "./post-dubles"

/**
 * @RF09.7 @RF09.13 @RNF02.11 — o post da sessão numa viagem
 * (GET/POST/PATCH/DELETE /api/social/viagens/[tripId]/post), no contrato de 18/11.
 *
 * O que prova a autorização: só membro vê a prévia, publica e atualiza
 * (`exigirMembro`, chamado com o id de getUser()); só quem tem username publica;
 * o DELETE vale para quem saiu da viagem, porque acha o post pela sessão e não
 * pelo vínculo com a viagem. A RLS de `trip_posts` e `post_tags` (segunda
 * linha) é provada em tests/rls/12-trip-posts.test.ts e 17-post-tags.test.ts.
 *
 * O que prova a cópia: o `montarPost` é o real, e o argumento passado ao
 * `publicar` é conferido inteiro. O corpo só escolhe e escreve a legenda e o
 * endereço digitado; chave extra em qualquer nível é 400 sem ler nada além da
 * autorização.
 *
 * O que prova a marcação: o `conferirMarcados` e o `conferirRecusas` são os
 * reais; marcado fora dos marcáveis é 400 `marcado_invalido`, e quem removeu a
 * própria marca é 400 `marcado_recusou`, os dois antes de gravar o post. O
 * `comRecusas` também é o real: os marcáveis saem com `recusou`. A recusa vale
 * para a viagem e o autor (`recusasDaViagem`), e não para o post: é lida com ou
 * sem post, e o POST de quem republica também a confere.
 *
 * O que prova o título (decisão de 18/11): o escolhido vai para a cópia, sem os
 * espaços das pontas; ausente, nulo ou só espaços, vale o da viagem; acima de
 * 120 caracteres é 400. `previa.title` continua o da viagem.
 *
 * O que prova os tetos do CHECK (S1): item da projeção com título acima de 120
 * fica fora da cópia, e local acima de 200 e descrição acima de 2000 saem do
 * item; publicar dá 201, e não o 500 do CHECK.
 *
 * Em todo caminho, `ler()` confere o `Cache-Control: private, no-store` e que
 * nenhuma chave proibida aparece em nível nenhum do corpo; os 200 conferem
 * ainda as chaves exatas da prévia, dos lugares, dos marcáveis e do post.
 */

vi.mock("@/lib/supabase/server", async () => {
  const { clienteDaSessao } = await import("./post-dubles")
  return { createClient: async () => clienteDaSessao() }
})
vi.mock("@/lib/supabase/admin", async () => {
  const { clienteDeServico } = await import("./post-dubles")
  return { criarClienteAdmin: clienteDeServico }
})
vi.mock("@/lib/authz/trip", async () => {
  const { exigirMembro } = await import("./post-dubles")
  return { exigirMembro }
})
vi.mock("@/lib/social/perfil-visto", async () => {
  const { temUsername } = await import("./post-dubles")
  return { temUsername }
})
vi.mock("@/lib/trips/publico", async (original) => {
  const { projecaoPublicaDaViagem } = await import("./post-dubles")
  return { ...(await original<typeof import("@/lib/trips/publico")>()), projecaoPublicaDaViagem }
})
vi.mock("@/lib/social/posts", async (original) => {
  const dubles = await import("./post-dubles")
  // `montarPost` fica o real: a cópia gravada tem de sair da projeção.
  return {
    ...(await original<typeof import("@/lib/social/posts")>()),
    postDaViagem: dubles.postDaViagem,
    publicar: dubles.publicar,
    atualizar: dubles.atualizar,
    despublicar: dubles.despublicar,
  }
})
vi.mock("@/lib/social/marcacoes", async (original) => {
  const dubles = await import("./post-dubles")
  // `conferirMarcados` fica o real: é ele que barra o marcado inválido antes de gravar.
  return {
    ...(await original<typeof import("@/lib/social/marcacoes")>()),
    membrosMarcaveis: dubles.membrosMarcaveis,
    marcadosDoPost: dubles.marcadosDoPost,
    recusasDaViagem: dubles.recusasDaViagem,
    sincronizarMarcacoes: dubles.sincronizarMarcacoes,
  }
})
vi.mock("@/lib/social/capa", async () => {
  const { assinarCapa, removerCapa } = await import("./post-dubles")
  return { assinarCapa, removerCapa }
})

import { DELETE, GET, PATCH, POST } from "@/app/api/social/viagens/[tripId]/post/route"
import { criarClienteAdmin } from "@/lib/supabase/admin"

type Metodo = "GET" | "POST" | "PATCH" | "DELETE"

/** Chaves que não saem em resposta nenhuma, em nível nenhum. */
const PROIBIDAS = new Set([
  "trip_id",
  "author_id",
  "cover_path",
  "budget",
  "currency",
  "notes",
  "email",
  "members",
  "membros",
  "trip_members",
  "latitude",
  "longitude",
  "status",
  "user_id",
  "rating",
  "visited",
  "place_id",
])

const CHAVES_RESPOSTA_GET = ["marcaveis", "post", "previa"]
const CHAVES_PREVIA = ["destination", "end_date", "itens", "lugares", "start_date", "title"]
const CHAVES_ITEM_PREVIA = ["category", "date", "description", "end_time", "location", "start_time", "title"]
const CHAVES_LUGAR_PREVIA = ["address", "category", "id", "name"]
const CHAVES_PESSOA = ["avatar_url", "full_name", "id", "username"]
const CHAVES_MARCAVEL = ["avatar_url", "full_name", "id", "recusou", "username"]
const CHAVES_POST = [
  "caption",
  "cover_url",
  "created_at",
  "destination",
  "end_date",
  "id",
  "items",
  "marcados",
  "places",
  "start_date",
  "title",
  "updated_at",
]

function chavesProibidas(valor: unknown, caminho = "corpo"): string[] {
  if (Array.isArray(valor)) return valor.flatMap((v, i) => chavesProibidas(v, `${caminho}[${i}]`))
  if (typeof valor !== "object" || valor === null) return []
  return Object.entries(valor).flatMap(([chave, v]) => [
    ...(PROIBIDAS.has(chave) ? [`${caminho}.${chave}`] : []),
    ...chavesProibidas(v, `${caminho}.${chave}`),
  ])
}

/** Confere o cabeçalho, as chaves proibidas e que nada da viagem privada vazou como valor; devolve o corpo. */
async function ler(resposta: Response) {
  expect(resposta.headers.get("cache-control")).toBe("private, no-store")
  const corpo = await resposta.json()
  expect(chavesProibidas(corpo)).toEqual([])
  expect(JSON.stringify(corpo)).not.toMatch(/4321|cartão do Abner|estacionar|fiado|ChIJ|@x\.local|descrição privada/)
  return corpo
}

function pedido(metodo: Metodo, corpo?: unknown, { tripId = TRIP, cru }: { tripId?: string; cru?: string } = {}) {
  // GET e DELETE não têm corpo (e o Request recusa corpo em GET).
  const temCorpo = (metodo === "POST" || metodo === "PATCH") && (corpo !== undefined || cru !== undefined)
  const request = new Request(`http://localhost/api/social/viagens/${tripId}/post`, {
    method: metodo,
    ...(temCorpo
      ? { body: cru ?? JSON.stringify(corpo), headers: { "content-type": "application/json" } }
      : {}),
  })
  const contexto = { params: Promise.resolve({ tripId }) }
  return { GET, POST, PATCH, DELETE }[metodo](request, contexto)
}

const INVENTADO = "99999999-9999-4999-8999-999999999999"

const CORPO_VALIDO = {
  legenda: "  Que viagem!  ",
  roteiro: { local: true, descricao: false },
  // Fora da ordem da projeção, um id em maiúsculas e um que não está na projeção.
  lugares: [
    { id: LUGAR_BAR, endereco: { texto: " Largo do Carmo " } },
    { id: LUGAR_PRAIA.toUpperCase(), endereco: "google" },
    { id: INVENTADO, endereco: "google" },
  ],
  marcados: [BIA],
}

/** A cópia que o `montarPost` real monta da projeção do dublê para o CORPO_VALIDO. */
const COPIA_ESPERADA = {
  title: "Lisboa em família",
  destination: "Lisboa, Portugal",
  start_date: "2026-12-10",
  end_date: "2026-12-17",
  caption: "Que viagem!",
  items: [
    {
      title: "Check-in no hotel",
      date: "2026-12-10",
      start_time: "14:00:00",
      category: "accommodation",
      location: "Av. da Liberdade",
    },
    {
      title: "Museu dos Coches",
      date: "2026-12-11",
      start_time: "10:00:00",
      end_time: "12:00:00",
      category: "activity",
      location: "Belém",
    },
  ],
  places: [
    { name: "Praia da Ursa", category: "beach", address: "Sintra, Portugal" },
    { name: "Bar do Largo", address: "Largo do Carmo" },
  ],
}

const BIA_NA_RESPOSTA = { id: BIA, username: "bia", full_name: "BIA", avatar_url: URL_FOTO_BIA }
const CAIO_NA_RESPOSTA = { id: CAIO, username: "caio", full_name: "CAIO", avatar_url: null }
const BIA_MARCAVEL = { ...BIA_NA_RESPOSTA, recusou: false }
const CAIO_MARCAVEL = { ...CAIO_NA_RESPOSTA, recusou: false }

let log: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  reiniciar()
  log = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  // A rota nunca lê tabela direto: nem trips, nem itinerary_items, nem places, nem trip_posts.
  expect(estado.consultasDiretas).toEqual([])
  log.mockRestore()
})

/** O cliente da sessão criado nesta requisição. */
const sessao = () => estado.clientesDaSessao[0]

/** Casos de corpo inválido comuns a POST e PATCH: chave extra em todo nível, tetos, repetidos. */
const CORPOS_INVALIDOS: [string, unknown][] = [
  ["title e notes na raiz (escrever o post por fora)", { ...CORPO_VALIDO, title: "Inventado", notes: "x" }],
  ["trip_id e author_id na raiz", { ...CORPO_VALIDO, trip_id: TRIP, author_id: ANA }],
  ["caption, items e places já montados", { ...CORPO_VALIDO, caption: "x", items: [], places: [] }],
  ["chave extra no roteiro", { ...CORPO_VALIDO, roteiro: { local: true, descricao: true, notas: true } }],
  ["chave extra no lugar", { ...CORPO_VALIDO, lugares: [{ id: LUGAR_BAR, endereco: "nenhum", name: "X" }] }],
  [
    "chave extra no endereço digitado",
    { ...CORPO_VALIDO, lugares: [{ id: LUGAR_BAR, endereco: { texto: "Rua", latitude: 1 } }] },
  ],
  ["legenda acima de 280", { ...CORPO_VALIDO, legenda: "a".repeat(281) }],
  ["título acima de 120", { ...CORPO_VALIDO, titulo: "a".repeat(121) }],
  ["título que não é texto", { ...CORPO_VALIDO, titulo: 42 }],
  [
    "mais de 200 lugares",
    {
      ...CORPO_VALIDO,
      lugares: Array.from({ length: 201 }, (_, i) => ({
        id: `00000000-0000-4000-8000-${i.toString(16).padStart(12, "0")}`,
        endereco: "nenhum",
      })),
    },
  ],
  [
    "lugar repetido",
    {
      ...CORPO_VALIDO,
      lugares: [
        { id: LUGAR_BAR, endereco: "nenhum" },
        { id: LUGAR_BAR.toUpperCase(), endereco: "google" },
      ],
    },
  ],
  ["marcado repetido", { ...CORPO_VALIDO, marcados: [BIA, BIA] }],
  ["endereço digitado vazio", { ...CORPO_VALIDO, lugares: [{ id: LUGAR_BAR, endereco: { texto: "   " } }] }],
  ["endereço fora das opções", { ...CORPO_VALIDO, lugares: [{ id: LUGAR_BAR, endereco: "rua" }] }],
  ["lugar fora do formato de uuid", { ...CORPO_VALIDO, lugares: [{ id: "abc", endereco: "nenhum" }] }],
  ["marcado fora do formato de uuid", { ...CORPO_VALIDO, marcados: ["bia"] }],
  ["mais de 50 marcados", { ...CORPO_VALIDO, marcados: Array.from({ length: 51 }, () => BIA) }],
  ["sem roteiro", { lugares: null }],
  ["corpo do contrato antigo", { itens: [], mostrar: {} }],
  ["corpo que não é objeto", ["roteiro"]],
]

describe.each<Metodo>(["GET", "POST", "PATCH", "DELETE"])("%s /api/social/viagens/[tripId]/post — comum", (metodo) => {
  it("401 sem sessão, sem consultar nada", async () => {
    estado.usuario = null

    const resposta = await pedido(metodo, CORPO_VALIDO)

    expect(resposta.status).toBe(401)
    expect(await ler(resposta)).toEqual({ error: "Não autenticado" })
    expect(estado.chamadas).toEqual([])
  })

  it("400 com tripId fora do formato de uuid, antes da autorização", async () => {
    const resposta = await pedido(metodo, CORPO_VALIDO, { tripId: "nao-e-uuid" })

    expect(resposta.status).toBe(400)
    expect((await ler(resposta)).error).toBe("Dados inválidos")
    expect(estado.chamadas).toEqual([])
  })
})

describe("GET /api/social/viagens/[tripId]/post", () => {
  it("200 sem post: prévia campo a campo (itens sem id, lugares com id), marcáveis e post nulo", async () => {
    const resposta = await pedido("GET")

    expect(resposta.status).toBe(200)
    const corpo = await ler(resposta)
    expect(Object.keys(corpo).sort()).toEqual(CHAVES_RESPOSTA_GET)
    expect(corpo.post).toBeNull()

    expect(Object.keys(corpo.previa).sort()).toEqual(CHAVES_PREVIA)
    expect(corpo.previa).toMatchObject({
      title: "Lisboa em família",
      destination: "Lisboa, Portugal",
      start_date: "2026-12-10",
      end_date: "2026-12-17",
    })
    expect(corpo.previa.itens).toHaveLength(2)
    for (const item of corpo.previa.itens) expect(Object.keys(item).sort()).toEqual(CHAVES_ITEM_PREVIA)
    expect(corpo.previa.itens[0]).toEqual({
      title: "Check-in no hotel",
      date: "2026-12-10",
      start_time: "14:00:00",
      end_time: null,
      category: "accommodation",
      location: "Av. da Liberdade",
      description: "quarto 12",
    })

    for (const lugar of corpo.previa.lugares) expect(Object.keys(lugar).sort()).toEqual(CHAVES_LUGAR_PREVIA)
    expect(corpo.previa.lugares).toEqual([
      { id: LUGAR_PRAIA, name: "Praia da Ursa", category: "beach", address: "Sintra, Portugal" },
      { id: LUGAR_BAR, name: "Bar do Largo", category: null, address: null },
    ])

    // Sem recusas na viagem: todos com `recusou: false`; as recusas são lidas mesmo sem post.
    for (const p of corpo.marcaveis) expect(Object.keys(p).sort()).toEqual(CHAVES_MARCAVEL)
    expect(corpo.marcaveis).toEqual([BIA_MARCAVEL, CAIO_MARCAVEL])
    expect(argumentosDe("recusasDaViagem")).toEqual([sessao(), TRIP])

    // Autorização com o cliente e o id da sessão, antes de ler qualquer coisa.
    expect(funcoesChamadas()[0]).toBe("exigirMembro")
    expect(argumentosDe("exigirMembro")).toEqual([sessao(), TRIP, ANA])
    expect(argumentosDe("membrosMarcaveis")).toEqual([sessao(), TRIP, criarClienteAdmin])
    expect(funcoesChamadas()).not.toContain("marcadosDoPost")
    expect(funcoesChamadas()).not.toContain("assinarCapa")
  })

  it("200 com a projeção ainda sem lugares: lista vazia", async () => {
    delete (estado.projecao as { lugares?: unknown }).lugares

    const corpo = await ler(await pedido("GET"))

    expect(corpo.previa.lugares).toEqual([])
  })

  it("200 com post: chaves exatas, capa em URL assinada, e os marcados campo a campo", async () => {
    estado.post = postPadrao({ cover_path: CAPA })
    estado.marcados = [pessoa(BIA, "bia", URL_FOTO_BIA)]

    const resposta = await pedido("GET")

    expect(resposta.status).toBe(200)
    const corpo = await ler(resposta)
    expect(Object.keys(corpo.post).sort()).toEqual(CHAVES_POST)
    expect(corpo.post).toEqual({
      id: POST_ID,
      title: "Lisboa em família",
      destination: "Lisboa, Portugal",
      start_date: "2026-12-10",
      end_date: "2026-12-17",
      caption: "Que viagem!",
      items: [{ title: "Museu dos Coches", location: "Belém" }],
      places: [{ name: "Praia da Ursa", address: "Sintra" }],
      cover_url: URL_CAPA,
      created_at: "2026-11-16T12:00:00.000Z",
      updated_at: "2026-11-16T12:00:00.000Z",
      marcados: [BIA_NA_RESPOSTA],
    })
    for (const p of corpo.post.marcados) expect(Object.keys(p).sort()).toEqual(CHAVES_PESSOA)
    expect(argumentosDe("assinarCapa")).toEqual([criarClienteAdmin, CAPA])
    expect(argumentosDe("marcadosDoPost")).toEqual([sessao(), POST_ID, criarClienteAdmin])
    expect(argumentosDe("recusasDaViagem")).toEqual([sessao(), TRIP])
    expect(corpo.marcaveis).toEqual([BIA_MARCAVEL, CAIO_MARCAVEL])
  })

  it("200 sem post (despublicado ou ainda não publicado): quem recusou na viagem já vem com recusou true", async () => {
    estado.recusas = [CAIO]

    const corpo = await ler(await pedido("GET"))

    expect(corpo.post).toBeNull()
    for (const p of corpo.marcaveis) expect(Object.keys(p).sort()).toEqual(CHAVES_MARCAVEL)
    expect(corpo.marcaveis).toEqual([BIA_MARCAVEL, { ...CAIO_NA_RESPOSTA, recusou: true }])
  })

  it("200 com post: quem removeu a própria marca vem em marcaveis com recusou true, nas chaves exatas", async () => {
    estado.post = postPadrao()
    // Em maiúsculas: a comparação é em minúsculas, como os uuids do Postgres.
    estado.recusas = [CAIO.toUpperCase()]

    const corpo = await ler(await pedido("GET"))

    for (const p of corpo.marcaveis) expect(Object.keys(p).sort()).toEqual(CHAVES_MARCAVEL)
    expect(corpo.marcaveis).toEqual([BIA_MARCAVEL, { ...CAIO_NA_RESPOSTA, recusou: true }])
  })

  it("200 com título do post diferente: previa.title continua o da viagem", async () => {
    estado.post = postPadrao({ title: "Réveillon sem a família" })

    const corpo = await ler(await pedido("GET"))

    expect(corpo.previa.title).toBe("Lisboa em família")
    expect(corpo.post.title).toBe("Réveillon sem a família")
  })

  it("500 sem a mensagem crua quando a leitura das recusas falha", async () => {
    estado.erroRecusas = new Error("[marcações do post] x", { cause: { message: "segredo do postgres" } })

    const resposta = await pedido("GET")

    expect(resposta.status).toBe(500)
    expect(await ler(resposta)).toEqual({ error: "Erro interno do servidor" })
  })

  it("200 com a assinatura da capa falhando: cover_url nulo, e a resposta continua", async () => {
    estado.post = postPadrao({ cover_path: CAPA })
    estado.urlCapa = null

    const corpo = await ler(await pedido("GET"))

    expect(corpo.post.cover_url).toBeNull()
  })

  it("403 não-membro, sem ler a projeção, os marcáveis nem o post", async () => {
    estado.membro = false

    const resposta = await pedido("GET")

    expect(resposta.status).toBe(403)
    expect(await ler(resposta)).toEqual({ error: "Sem permissão para acessar esta viagem" })
    expect(funcoesChamadas()).toEqual(["exigirMembro"])
  })

  it("404 quando a projeção não existe para a sessão", async () => {
    estado.projecao = null

    const resposta = await pedido("GET")

    expect(resposta.status).toBe(404)
    expect(await ler(resposta)).toEqual({ error: "Viagem não encontrada" })
  })

  it("500 sem a mensagem crua quando a leitura do post falha", async () => {
    estado.erroPost = new Error("[post da viagem] não foi possível ler a publicação", {
      cause: { message: 'relation "trip_posts" secreta' },
    })

    const resposta = await pedido("GET")

    expect(resposta.status).toBe(500)
    expect(await ler(resposta)).toEqual({ error: "Erro interno do servidor" })
  })

  it("500 genérico quando a autorização falha no banco (ErroHttp 500 com a mensagem do Postgres)", async () => {
    estado.erroMembro = new ErroHttp(500, 'relation "trip_members" segredo do postgres')

    const resposta = await pedido("GET")

    expect(resposta.status).toBe(500)
    const texto = JSON.stringify(await ler(resposta))
    expect(texto).toBe(JSON.stringify({ error: "Erro interno do servidor" }))
    expect(resposta.headers.get("x-codigo-erro")).toMatch(/^[0-9a-f]{8}$/)
  })
})

describe("POST /api/social/viagens/[tripId]/post", () => {
  it("201 grava a cópia montada da projeção, nunca do corpo, e marca quem foi escolhido", async () => {
    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(201)
    const corpo = await ler(resposta)
    expect(Object.keys(corpo)).toEqual(["post"])
    expect(Object.keys(corpo.post).sort()).toEqual(CHAVES_POST)
    expect(corpo.post).toMatchObject({ ...COPIA_ESPERADA, id: POST_ID, cover_url: null })
    expect(corpo.post.marcados).toEqual([BIA_NA_RESPOSTA])

    // A ordem: sessão, autorização, username, corpo, projeção e marcáveis, gravação, marcas.
    expect(funcoesChamadas()).toEqual([
      "exigirMembro",
      "temUsername",
      "projecaoPublicaDaViagem",
      "membrosMarcaveis",
      "recusasDaViagem",
      "publicar",
      "sincronizarMarcacoes",
      "marcadosDoPost",
    ])
    expect(argumentosDe("exigirMembro")).toEqual([sessao(), TRIP, ANA])
    expect(argumentosDe("temUsername")).toEqual([sessao(), ANA])
    expect(argumentosDe("publicar")).toEqual([sessao(), { tripId: TRIP, autorId: ANA, copia: COPIA_ESPERADA }])
    expect(argumentosDe("sincronizarMarcacoes")).toEqual([sessao(), POST_ID, ANA, [BIA], [BIA, CAIO], []])
    expect(argumentosDe("recusasDaViagem")).toEqual([sessao(), TRIP])
  })

  it.each([
    ["escolhido, sem os espaços das pontas", "  Réveillon em Lisboa  ", "Réveillon em Lisboa"],
    ["com 120 caracteres, no teto", "t".repeat(120), "t".repeat(120)],
    ["só com espaços: o da viagem", "   ", "Lisboa em família"],
    ["vazio: o da viagem", "", "Lisboa em família"],
    ["nulo: o da viagem", null, "Lisboa em família"],
    ["ausente: o da viagem", undefined, "Lisboa em família"],
  ])("201 com título %s", async (_caso, titulo, esperado) => {
    const resposta = await pedido("POST", { ...CORPO_VALIDO, titulo })

    expect(resposta.status).toBe(201)
    expect((await ler(resposta)).post.title).toBe(esperado)
    const { copia } = (argumentosDe("publicar") as [unknown, { copia: unknown }])[1]
    expect(copia).toEqual({ ...COPIA_ESPERADA, title: esperado })
  })

  it("201 com texto do grupo acima dos tetos do CHECK: item longo fora, local e descrição longos omitidos", async () => {
    const projecao = estado.projecao as unknown as { itens: Record<string, unknown>[] }
    projecao.itens = [
      { title: "x".repeat(121), date: "2026-12-10", location: "Belém", description: "curta" },
      { title: "Título no teto".padEnd(120, "."), location: "l".repeat(201), description: "d".repeat(2001) },
      { title: "No limite", location: "l".repeat(200), description: "d".repeat(2000) },
    ]

    const resposta = await pedido("POST", { ...CORPO_VALIDO, roteiro: { local: true, descricao: true } })

    expect(resposta.status).toBe(201)
    await ler(resposta)
    const { copia } = (argumentosDe("publicar") as [unknown, { copia: { items: unknown[] } }])[1]
    expect(copia.items).toEqual([
      { title: "Título no teto".padEnd(120, ".") },
      { title: "No limite", location: "l".repeat(200), description: "d".repeat(2000) },
    ])
  })

  it("201 com roteiro e lugares desligados e sem legenda: post só com a viagem, sem marcas", async () => {
    const resposta = await pedido("POST", { roteiro: null, lugares: null })

    expect(resposta.status).toBe(201)
    const corpo = await ler(resposta)
    expect(corpo.post).toMatchObject({ caption: null, items: [], places: [], marcados: [] })
    const { copia } = (argumentosDe("publicar") as [unknown, { copia: unknown }])[1]
    expect(copia).toEqual({ ...COPIA_ESPERADA, caption: null, items: [], places: [] })
    expect(argumentosDe("sincronizarMarcacoes")).toEqual([sessao(), POST_ID, ANA, [], [BIA, CAIO], []])
  })

  it("201 com descrição ligada e local desligado: a subchave vale para o post inteiro", async () => {
    await ler(await pedido("POST", { ...CORPO_VALIDO, roteiro: { local: false, descricao: true } }))

    const { copia } = (argumentosDe("publicar") as [unknown, { copia: { items: unknown[] } }])[1]
    expect(copia.items).toEqual([
      {
        title: "Check-in no hotel",
        date: "2026-12-10",
        start_time: "14:00:00",
        category: "accommodation",
        description: "quarto 12",
      },
      {
        title: "Museu dos Coches",
        date: "2026-12-11",
        start_time: "10:00:00",
        end_time: "12:00:00",
        category: "activity",
        description: "ingresso na bilheteria",
      },
    ])
  })

  it("403 não-membro, sem gravar nem ler a projeção", async () => {
    estado.membro = false

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(403)
    expect(await ler(resposta)).toEqual({ error: "Sem permissão para acessar esta viagem" })
    expect(funcoesChamadas()).toEqual(["exigirMembro"])
  })

  it("403 sem_username: a sessão sem nome de usuário não publica, e nada é gravado", async () => {
    estado.username = false

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(403)
    expect(await ler(resposta)).toEqual({
      error: "Escolha um nome de usuário para publicar uma viagem",
      codigo: "sem_username",
    })
    expect(funcoesChamadas()).toEqual(["exigirMembro", "temUsername"])
  })

  it.each(CORPOS_INVALIDOS)("400 com %s, sem ler a projeção nem gravar", async (_caso, corpo) => {
    const resposta = await pedido("POST", corpo)

    expect(resposta.status).toBe(400)
    const lido = await ler(resposta)
    expect(lido.error).toBe("Dados inválidos")
    expect(lido.detalhes).toBeDefined()
    expect(funcoesChamadas()).toEqual(["exigirMembro", "temUsername"])
  })

  it("400 com JSON malformado, e não o 500 de um SyntaxError", async () => {
    const resposta = await pedido("POST", undefined, { cru: "{ roteiro: [" })

    expect(resposta.status).toBe(400)
    expect((await ler(resposta)).error).toBe("Dados inválidos")
    expect(funcoesChamadas()).toEqual(["exigirMembro", "temUsername"])
  })

  it.each([
    ["quem não é marcável (saiu da viagem, sem username ou de fora)", [BIA, DORA]],
    ["a própria sessão", [ANA]],
  ])("400 marcado_invalido ao marcar %s, sem gravar o post", async (_caso, marcados) => {
    const resposta = await pedido("POST", { ...CORPO_VALIDO, marcados })

    expect(resposta.status).toBe(400)
    expect(await ler(resposta)).toEqual({
      error: "Só dá para marcar quem viajou com você e tem nome de usuário",
      codigo: "marcado_invalido",
    })
    expect(funcoesChamadas()).not.toContain("publicar")
    expect(funcoesChamadas()).not.toContain("sincronizarMarcacoes")
  })

  it.each([
    ["só quem recusou", [CAIO]],
    ["quem recusou junto de outro marcável", [BIA, CAIO]],
  ])("400 marcado_recusou ao republicar marcando %s, sem gravar o post", async (_caso, marcados) => {
    // Recusa num post desta viagem que o autor já despublicou: vale para a viagem.
    estado.recusas = [CAIO]

    const resposta = await pedido("POST", { ...CORPO_VALIDO, marcados })

    expect(resposta.status).toBe(400)
    expect(await ler(resposta)).toEqual({
      error: "Quem removeu a própria marcação numa publicação sua desta viagem não pode ser marcado de novo",
      codigo: "marcado_recusou",
    })
    expect(funcoesChamadas()).not.toContain("publicar")
    expect(funcoesChamadas()).not.toContain("sincronizarMarcacoes")
  })

  it("201 com recusa na viagem marcando outros: as recusas vão para a sincronização", async () => {
    estado.recusas = [CAIO]

    const resposta = await pedido("POST", { ...CORPO_VALIDO, marcados: [BIA] })

    expect(resposta.status).toBe(201)
    await ler(resposta)
    expect((argumentosDe("sincronizarMarcacoes") as unknown[])[5]).toEqual([CAIO])
  })

  it("500 sem a mensagem crua e sem gravar quando a leitura das recusas falha no POST", async () => {
    estado.erroRecusas = new Error("[marcações do post] x", { cause: { message: "segredo do postgres" } })

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(500)
    expect(await ler(resposta)).toEqual({ error: "Erro interno do servidor" })
    expect(funcoesChamadas()).not.toContain("publicar")
  })

  it("404 quando a projeção não existe, sem gravar", async () => {
    estado.projecao = null

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(404)
    await ler(resposta)
    expect(funcoesChamadas()).not.toContain("publicar")
  })

  it("409 quando a sessão já publicou esta viagem, sem mexer nas marcas", async () => {
    estado.erroPublicar = new ErroHttp(409, "Você já publicou esta viagem")

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(409)
    expect(await ler(resposta)).toEqual({ error: "Você já publicou esta viagem" })
    expect(funcoesChamadas()).not.toContain("sincronizarMarcacoes")
  })

  it("500 sem a mensagem crua quando o banco falha ao gravar", async () => {
    const cru = { code: "XX000", message: 'violates check constraint "trip_posts_places_validos" segredo' }
    estado.erroPublicar = new Error("[post da viagem] não foi possível publicar esta viagem", { cause: cru })

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(500)
    const texto = JSON.stringify(await ler(resposta))
    expect(texto).toBe(JSON.stringify({ error: "Erro interno do servidor" }))
    expect(texto).not.toContain("segredo")
    expect(resposta.headers.get("x-codigo-erro")).toMatch(/^[0-9a-f]{8}$/)
  })

  it("marcas falham depois de publicar: desfaz o post e responde 500 sem a mensagem crua", async () => {
    estado.erroSincronizar = new Error("[marcações do post] x", { cause: { message: "segredo do postgres" } })

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(500)
    expect(await ler(resposta)).toEqual({ error: "Erro interno do servidor" })
    expect(funcoesChamadas()).toEqual(expect.arrayContaining(["publicar", "sincronizarMarcacoes", "despublicar"]))
    expect(argumentosDe("despublicar")).toEqual([sessao(), POST_ID])
  })

  it("marcas falham e desfazer também falha: o erro original segue, e a falha vai ao log", async () => {
    estado.erroSincronizar = new ErroHttp(403, "Sem permissão para marcar quem viajou com você")
    const falha = new Error("rede")
    estado.erroDespublicar = falha

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(403)
    await ler(resposta)
    expect(log).toHaveBeenCalledWith("[post da viagem] post sem marcas não foi desfeito", POST_ID, falha)
  })

  it("500 sem a mensagem crua quando a leitura do itinerário ou dos marcáveis falha", async () => {
    estado.erroProjecao = new Error("Não foi possível ler o itinerário da viagem")
    let resposta = await pedido("POST", CORPO_VALIDO)
    expect(resposta.status).toBe(500)
    expect(await ler(resposta)).toEqual({ error: "Erro interno do servidor" })
    expect(funcoesChamadas()).not.toContain("publicar")

    reiniciar()
    estado.erroMarcaveis = new Error("[marcações do post] x", { cause: { message: "segredo" } })
    resposta = await pedido("POST", CORPO_VALIDO)
    expect(resposta.status).toBe(500)
    expect(await ler(resposta)).toEqual({ error: "Erro interno do servidor" })
    expect(funcoesChamadas()).not.toContain("publicar")
  })
})

describe("PATCH /api/social/viagens/[tripId]/post", () => {
  beforeEach(() => {
    estado.post = postPadrao({ cover_path: CAPA })
    // Dora saiu da viagem mas continua marcada; Caio está marcado e é marcável.
    estado.marcados = [pessoa(DORA, "dora"), pessoa(CAIO, "caio")]
  })

  it("200 copia a viagem de novo e troca as marcas; quem saiu da viagem pode continuar marcado", async () => {
    estado.atualizado = postPadrao({ ...COPIA_ESPERADA, cover_path: CAPA, updated_at: "2026-11-16T14:00:00.000Z" })

    const resposta = await pedido("PATCH", { ...CORPO_VALIDO, marcados: [DORA, BIA] })

    expect(resposta.status).toBe(200)
    const corpo = await ler(resposta)
    expect(Object.keys(corpo)).toEqual(["post"])
    expect(Object.keys(corpo.post).sort()).toEqual(CHAVES_POST)
    expect(corpo.post).toMatchObject({ ...COPIA_ESPERADA, cover_url: URL_CAPA, updated_at: "2026-11-16T14:00:00.000Z" })
    expect(corpo.post.marcados).toEqual([
      { id: DORA, username: "dora", full_name: "DORA", avatar_url: null },
      BIA_NA_RESPOSTA,
    ])
    expect(funcoesChamadas()).toEqual([
      "exigirMembro",
      "postDaViagem",
      "projecaoPublicaDaViagem",
      "membrosMarcaveis",
      "marcadosDoPost",
      "recusasDaViagem",
      "atualizar",
      "sincronizarMarcacoes",
      "marcadosDoPost",
      "assinarCapa",
    ])
    expect(argumentosDe("exigirMembro")).toEqual([sessao(), TRIP, ANA])
    expect(argumentosDe("recusasDaViagem")).toEqual([sessao(), TRIP])
    expect(argumentosDe("atualizar")).toEqual([sessao(), POST_ID, COPIA_ESPERADA])
    expect(argumentosDe("sincronizarMarcacoes")).toEqual([
      sessao(),
      POST_ID,
      ANA,
      [DORA, BIA],
      [BIA, CAIO, DORA, CAIO],
      [],
    ])
  })

  it("200 com título escolhido: a cópia atualizada leva o título novo", async () => {
    const resposta = await pedido("PATCH", { ...CORPO_VALIDO, titulo: " Fim de ano " })

    expect(resposta.status).toBe(200)
    expect((await ler(resposta)).post.title).toBe("Fim de ano")
    expect(argumentosDe("atualizar")).toEqual([sessao(), POST_ID, { ...COPIA_ESPERADA, title: "Fim de ano" }])
  })

  it("200 marcando outros: as recusas da viagem vão para a sincronização, que as confere de novo", async () => {
    estado.recusas = [CAIO]

    const resposta = await pedido("PATCH", { ...CORPO_VALIDO, marcados: [BIA] })

    expect(resposta.status).toBe(200)
    await ler(resposta)
    expect((argumentosDe("sincronizarMarcacoes") as unknown[])[5]).toEqual([CAIO])
  })

  it.each([
    ["só quem recusou", [CAIO]],
    ["quem recusou junto de outro marcável", [BIA, CAIO]],
  ])("400 marcado_recusou ao marcar %s, sem atualizar nem marcar", async (_caso, marcados) => {
    estado.marcados = [pessoa(DORA, "dora")]
    estado.recusas = [CAIO]

    const resposta = await pedido("PATCH", { ...CORPO_VALIDO, marcados })

    expect(resposta.status).toBe(400)
    expect(await ler(resposta)).toEqual({
      error: "Quem removeu a própria marcação numa publicação sua desta viagem não pode ser marcado de novo",
      codigo: "marcado_recusou",
    })
    expect(funcoesChamadas()).not.toContain("atualizar")
    expect(funcoesChamadas()).not.toContain("sincronizarMarcacoes")
  })

  it("400 marcado_invalido ao marcar alguém novo que não é marcável, sem atualizar", async () => {
    const resposta = await pedido("PATCH", { ...CORPO_VALIDO, marcados: [BIA, ANA] })

    expect(resposta.status).toBe(400)
    expect((await ler(resposta)).codigo).toBe("marcado_invalido")
    expect(funcoesChamadas()).not.toContain("atualizar")
    expect(funcoesChamadas()).not.toContain("sincronizarMarcacoes")
  })

  it("403 de quem saiu da viagem, sem atualizar", async () => {
    estado.membro = false

    const resposta = await pedido("PATCH", CORPO_VALIDO)

    expect(resposta.status).toBe(403)
    await ler(resposta)
    expect(funcoesChamadas()).toEqual(["exigirMembro"])
  })

  it("403 quando a policy recusa (42501 vira 403 na lib)", async () => {
    estado.erroAtualizar = new ErroHttp(403, "Sem permissão para atualizar esta publicação")

    const resposta = await pedido("PATCH", CORPO_VALIDO)

    expect(resposta.status).toBe(403)
    expect(await ler(resposta)).toEqual({ error: "Sem permissão para atualizar esta publicação" })
  })

  it("404 sem post da sessão nesta viagem, sem ler a projeção nem atualizar", async () => {
    estado.post = null

    const resposta = await pedido("PATCH", CORPO_VALIDO)

    expect(resposta.status).toBe(404)
    expect(await ler(resposta)).toEqual({ error: "Publicação não encontrada" })
    expect(funcoesChamadas()).toEqual(["exigirMembro", "postDaViagem"])
  })

  it("404 quando o post some entre a leitura e a escrita, sem mexer nas marcas", async () => {
    estado.atualizado = null

    const resposta = await pedido("PATCH", CORPO_VALIDO)

    expect(resposta.status).toBe(404)
    await ler(resposta)
    expect(funcoesChamadas()).not.toContain("sincronizarMarcacoes")
  })

  it.each(CORPOS_INVALIDOS)("400 com %s, sem ler o post nem atualizar", async (_caso, corpo) => {
    const resposta = await pedido("PATCH", corpo)

    expect(resposta.status).toBe(400)
    expect((await ler(resposta)).error).toBe("Dados inválidos")
    expect(funcoesChamadas()).toEqual(["exigirMembro"])
  })

  it("500 sem a mensagem crua quando o banco falha ao atualizar ou ao marcar", async () => {
    estado.erroAtualizar = new Error("[post da viagem] x", { cause: { message: "segredo do postgres" } })
    let resposta = await pedido("PATCH", CORPO_VALIDO)
    expect(resposta.status).toBe(500)
    expect(await ler(resposta)).toEqual({ error: "Erro interno do servidor" })

    reiniciar()
    estado.post = postPadrao()
    estado.erroSincronizar = new Error("[marcações do post] x", { cause: { message: "segredo do postgres" } })
    resposta = await pedido("PATCH", CORPO_VALIDO)
    expect(resposta.status).toBe(500)
    expect(await ler(resposta)).toEqual({ error: "Erro interno do servidor" })
    // No PATCH o conteúdo novo fica: não há o que desfazer.
    expect(funcoesChamadas()).not.toContain("despublicar")
  })
})

/**
 * Regressão da segunda revisão de segurança (18/11, R2): os casos que davam 500
 * ao publicar. Os de item saem do item e publicam; os da viagem são 400 com
 * código e mensagem, sem gravar nada.
 */
describe.each<"POST" | "PATCH">(["POST", "PATCH"])("%s — campos fora dos CHECKs não dão 500 (R2, @RF09.7)", (metodo) => {
  const escrita = metodo === "POST" ? "publicar" : "atualizar"
  const sucesso = metodo === "POST" ? 201 : 200
  /** A cópia que chegou a `publicar`/`atualizar`. */
  const copiaGravada = () => {
    const argumentos = argumentosDe(escrita)!
    return (metodo === "POST" ? (argumentos[1] as { copia: unknown }).copia : argumentos[2]) as {
      items: Record<string, string>[]
    }
  }

  beforeEach(() => {
    if (metodo === "PATCH") estado.post = postPadrao()
  })

  const comItem = (campos: Record<string, string>) => {
    const projecao = estado.projecao!
    projecao.itens = [{ ...projecao.itens[1], ...campos }]
  }

  it.each([
    ["hora 24:00:00 no início", { start_time: "24:00:00" }, "start_time"],
    ["hora 24:00:00 no fim", { end_time: "24:00:00" }, "end_time"],
    ["hora com fração de segundo", { start_time: "10:00:00.5" }, "start_time"],
    ["data 10000-01-01", { date: "10000-01-01" }, "date"],
    ["data 0044-03-15 BC", { date: "0044-03-15 BC" }, "date"],
    ["categoria fora da lista do CHECK", { category: "hotel" }, "category"],
  ])(`${sucesso}: item com %s publica sem o campo`, async (_caso, campos, omitido) => {
    comItem(campos)

    const resposta = await pedido(metodo, CORPO_VALIDO)

    expect(resposta.status).toBe(sucesso)
    await ler(resposta)
    const [item] = copiaGravada().items
    expect(item).not.toHaveProperty(omitido)
    expect(item.title).toBe("Museu dos Coches")
  })

  it.each([
    [
      "título da viagem com 130 caracteres, sem `titulo` no corpo",
      { title: "t".repeat(130) },
      "titulo_da_viagem_longo",
      "O título da viagem passa de 120 caracteres: escreva um título para a publicação",
    ],
    [
      "destino com 170 caracteres",
      { destination: "d".repeat(170) },
      "destino_da_viagem_longo",
      "O destino da viagem passa de 160 caracteres: encurte o destino na viagem para publicar",
    ],
    [
      "datas invertidas",
      { start_date: "2026-12-17", end_date: "2026-12-10" },
      "datas_da_viagem_invertidas",
      "A volta da viagem está antes da ida: corrija as datas na viagem para publicar",
    ],
    [
      "data da viagem 10000-01-01",
      { end_date: "10000-01-01" },
      "datas_da_viagem_invalidas",
      "As datas da viagem estão fora do formato: corrija a ida e a volta na viagem para publicar",
    ],
  ])("400: %s — código e mensagem, sem gravar nem marcar", async (_caso, campos, codigo, mensagem) => {
    Object.assign(estado.projecao!, campos)

    const resposta = await pedido(metodo, CORPO_VALIDO)

    expect(resposta.status).toBe(400)
    expect(await ler(resposta)).toEqual({ error: mensagem, codigo })
    expect(funcoesChamadas()).not.toContain(escrita)
    expect(funcoesChamadas()).not.toContain("sincronizarMarcacoes")
  })

  it(`${sucesso}: o título da viagem com 130 caracteres publica quando o corpo traz \`titulo\``, async () => {
    estado.projecao!.title = "t".repeat(130)

    const resposta = await pedido(metodo, { ...CORPO_VALIDO, titulo: "Lisboa, enfim" })

    expect(resposta.status).toBe(sucesso)
    await ler(resposta)
    expect((copiaGravada() as unknown as { title: string }).title).toBe("Lisboa, enfim")
  })

  it(`${sucesso}: título só com invisíveis (U+200B, U+FEFF, U+2060) vale o da viagem, e a legenda vira null (R3)`, async () => {
    const resposta = await pedido(metodo, { ...CORPO_VALIDO, titulo: "​﻿⁠", legenda: "⁠​" })

    expect(resposta.status).toBe(sucesso)
    await ler(resposta)
    expect(copiaGravada()).toMatchObject({ title: "Lisboa em família", caption: null })
  })
})

/**
 * Corrida da revisão de 18/11 (S1): a pessoa remove a própria marca entre a
 * leitura das recusas e o INSERT. A lib transforma o 42501 em
 * `ErroHttp(400, "marcado_recusou")` (provado em tests/lib/marcacoes.test.ts);
 * aqui, o que a rota faz com ele.
 */
describe("POST e PATCH — a recusa chega só no INSERT da marca (S1, @RF09.13)", () => {
  const corrida = () => {
    estado.erroSincronizar = new ErroHttp(400, "marcado_recusou")
  }

  it("POST: 400 marcado_recusou, e o post recém-criado é desfeito", async () => {
    corrida()

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(400)
    expect((await ler(resposta)).codigo).toBe("marcado_recusou")
    expect(funcoesChamadas()).toContain("publicar")
    expect(funcoesChamadas().at(-1)).toBe("despublicar")
  })

  it("PATCH: 400 marcado_recusou; o conteúdo já foi atualizado (limite registrado na rota)", async () => {
    estado.post = postPadrao()
    corrida()

    const resposta = await pedido("PATCH", CORPO_VALIDO)

    expect(resposta.status).toBe(400)
    expect((await ler(resposta)).codigo).toBe("marcado_recusou")
    expect(funcoesChamadas()).toContain("atualizar")
    expect(funcoesChamadas()).not.toContain("despublicar")
  })
})

describe("DELETE /api/social/viagens/[tripId]/post", () => {
  beforeEach(() => {
    estado.post = postPadrao({ cover_path: CAPA })
    estado.despublicado = { capaAnterior: CAPA }
  })

  it("200 apaga o post e depois a capa, na pasta da sessão, com o cliente de serviço", async () => {
    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(200)
    expect(await ler(resposta)).toEqual({ ok: true })
    expect(funcoesChamadas()).toEqual(["postDaViagem", "despublicar", "removerCapa"])
    expect(argumentosDe("postDaViagem")).toEqual([sessao(), TRIP])
    expect(argumentosDe("despublicar")).toEqual([sessao(), POST_ID])
    expect(argumentosDe("removerCapa")).toEqual([estado.clientesDeServico[0], CAPA, ANA])
    expect(log).not.toHaveBeenCalled()
  })

  it("200 para quem saiu da viagem: o post é do autor, e o exigirMembro não é chamado", async () => {
    estado.membro = false

    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(200)
    await ler(resposta)
    expect(funcoesChamadas()).not.toContain("exigirMembro")
    expect(funcoesChamadas()).toContain("despublicar")
  })

  it("200 sem capa: não cria o cliente de serviço nem vai ao Storage", async () => {
    estado.despublicado = { capaAnterior: null }

    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(200)
    await ler(resposta)
    expect(estado.clientesDeServico).toEqual([])
    expect(funcoesChamadas()).not.toContain("removerCapa")
  })

  it("200 mesmo se o Storage falhar ao apagar a capa: o post já saiu, e a falha vai para o log", async () => {
    const erro = new Error("[capa do post] remoção falhou")
    estado.erroRemoverCapa = erro

    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(200)
    expect(await ler(resposta)).toEqual({ ok: true })
    expect(log).toHaveBeenCalledWith("[post da viagem] capa não apagada", CAPA, erro)
  })

  it("200 e log quando a capa não sai do bucket (arquivo já ausente ou fora da pasta)", async () => {
    estado.capaRemovida = false

    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(200)
    await ler(resposta)
    expect(log).toHaveBeenCalledWith("[post da viagem] capa não apagada", CAPA)
  })

  it("404 sem post da sessão nesta viagem, sem apagar nada", async () => {
    estado.post = null

    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(404)
    expect(await ler(resposta)).toEqual({ error: "Publicação não encontrada" })
    expect(funcoesChamadas()).toEqual(["postDaViagem"])
  })

  it("404 quando nada foi apagado (despublicado em outra aba), sem ir ao Storage", async () => {
    estado.despublicado = null

    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(404)
    await ler(resposta)
    expect(funcoesChamadas()).not.toContain("removerCapa")
  })

  it("500 sem a mensagem crua quando o banco falha ao apagar, e a capa fica", async () => {
    estado.erroDespublicar = new Error("[post da viagem] x", { cause: { message: "segredo do postgres" } })

    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(500)
    expect(await ler(resposta)).toEqual({ error: "Erro interno do servidor" })
    expect(funcoesChamadas()).not.toContain("removerCapa")
  })
})
