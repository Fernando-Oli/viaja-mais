import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF11.1 avaliar · @RF11.2 ver avaliações de outros · @RF11.3 editar/excluir a própria
 *
 * Cliente falso genérico: toda cadeia (`select`, `eq`, `order`, `insert`...)
 * devolve o mesmo construtor, que anota as chamadas e resolve com a resposta
 * configurada para a tabela e a operação. Assim os testes provam o que importa
 * — quais filtros e quais valores chegaram ao banco — sem copiar a forma exata
 * de cada cadeia do supabase-js.
 */

type Resposta = { data: unknown; error: { code?: string; message: string } | null }
type Chamada = { tabela: string; op: string; valores?: unknown; filtros: [string, unknown][] }

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  papel: { data: { role: "member" } as { role: string } | null, error: null as { message: string } | null },
  respostas: {} as Record<string, Resposta>,
  chamadas: [] as Chamada[],
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from(tabela: string) {
      if (tabela === "trip_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: async () => h.papel }),
            }),
          }),
        }
      }

      const chamada: Chamada = { tabela, op: "select", filtros: [] }
      h.chamadas.push(chamada)
      const resolver = () => h.respostas[`${tabela}.${chamada.op}`] ?? { data: null, error: null }

      const construtor: Record<string, unknown> = {
        select: () => construtor,
        insert: (valores: unknown) => ((chamada.op = "insert"), (chamada.valores = valores), construtor),
        update: (valores: unknown) => ((chamada.op = "update"), (chamada.valores = valores), construtor),
        delete: () => ((chamada.op = "delete"), construtor),
        eq: (coluna: string, valor: unknown) => (chamada.filtros.push([coluna, valor]), construtor),
        in: (coluna: string, valor: unknown) => (chamada.filtros.push([coluna, valor]), construtor),
        order: () => construtor,
        maybeSingle: async () => resolver(),
        single: async () => resolver(),
        then: (ok: (r: Resposta) => unknown, falha?: (e: unknown) => unknown) =>
          Promise.resolve(resolver()).then(ok, falha),
      }
      return construtor
    },
  }),
}))

import { GET, PUT, DELETE } from "@/app/api/trips/[tripId]/places/[placeId]/reviews/route"

const TRIP_ID = "11111111-1111-1111-1111-111111111111"
const PLACE_ID = "44444444-4444-4444-4444-444444444444"
const GOOGLE_ID = "ChIJ-marco-zero"
const EU = "user-1"

function requisicao(method: string, body?: unknown) {
  return new Request(`http://localhost/api/trips/${TRIP_ID}/places/${PLACE_ID}/reviews`, {
    method,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json" },
  })
}

const contexto = () => ({ params: Promise.resolve({ tripId: TRIP_ID, placeId: PLACE_ID }) })

const logado = () => h.getUser.mockResolvedValue({ data: { user: { id: EU } } })
const semSessao = () => h.getUser.mockResolvedValue({ data: { user: null } })
const naoMembro = () => {
  h.getUser.mockResolvedValue({ data: { user: { id: "user-2" } } })
  h.papel = { data: null, error: null }
}

const doBanco = (tabela: string, op: string) => h.chamadas.filter((c) => c.tabela === tabela && c.op === op)

beforeEach(() => {
  h.getUser.mockReset()
  h.papel = { data: { role: "member" }, error: null }
  h.chamadas.length = 0
  h.respostas = {
    "places.select": { data: { name: "Marco Zero", place_id: GOOGLE_ID }, error: null },
    "place_reviews.select": { data: null, error: null },
    "place_reviews.insert": { data: { id: "rev-1", rating: 4 }, error: null },
    "place_reviews.update": { data: { id: "rev-1", rating: 5 }, error: null },
    "place_reviews.delete": { data: [{ id: "rev-1" }], error: null },
    "profiles.select": { data: [], error: null },
  }
})

describe("GET /api/trips/[tripId]/places/[placeId]/reviews", () => {
  it("200: lista as avaliações do lugar, com autor, marcação da própria e resumo", async () => {
    logado()
    h.respostas["place_reviews.select"] = {
      data: [
        { id: "rev-1", user_id: EU, rating: 4, comment: "Vista linda", updated_at: "2026-11-11" },
        { id: "rev-2", user_id: "user-9", rating: 5, comment: null, updated_at: "2026-11-10" },
      ],
      error: null,
    }
    h.respostas["profiles.select"] = { data: [{ id: "user-9", full_name: "Bruno" }], error: null }

    const resposta = await GET(requisicao("GET"), contexto())
    const corpo = await resposta.json()

    expect(resposta.status).toBe(200)
    expect(corpo.resumo).toEqual({ media: 4.5, total: 2 })
    expect(corpo.reviews.map((r: { minha: boolean }) => r.minha)).toEqual([true, false])
    expect(corpo.reviews[1].autor).toBe("Bruno")
    // A busca é pelo identificador do Google: avaliações de outras viagens aparecem.
    expect(doBanco("place_reviews", "select")[0].filtros).toEqual([["google_place_id", GOOGLE_ID]])
  })

  it("200: sem avaliações, lista vazia e média nula", async () => {
    logado()
    h.respostas["place_reviews.select"] = { data: [], error: null }

    const corpo = await (await GET(requisicao("GET"), contexto())).json()

    expect(corpo).toEqual({ reviews: [], resumo: { media: null, total: 0 } })
  })

  it("401: sem sessão", async () => {
    semSessao()
    expect((await GET(requisicao("GET"), contexto())).status).toBe(401)
    expect(h.chamadas).toEqual([])
  })

  it("403: quem não participa da viagem", async () => {
    naoMembro()
    expect((await GET(requisicao("GET"), contexto())).status).toBe(403)
    expect(h.chamadas).toEqual([])
  })

  it("404: lugar de outra viagem (o filtro inclui trip_id e id)", async () => {
    logado()
    h.respostas["places.select"] = { data: null, error: null }

    expect((await GET(requisicao("GET"), contexto())).status).toBe(404)
    expect(doBanco("places", "select")[0].filtros).toEqual([
      ["trip_id", TRIP_ID],
      ["id", PLACE_ID],
    ])
  })

  it("400: lugar sem identificador do Google", async () => {
    logado()
    h.respostas["places.select"] = { data: { name: "Casa da tia", place_id: null }, error: null }

    expect((await GET(requisicao("GET"), contexto())).status).toBe(400)
    expect(doBanco("place_reviews", "select")).toEqual([])
  })
})

describe("PUT /api/trips/[tripId]/places/[placeId]/reviews", () => {
  it("201: primeira avaliação grava campo a campo, com user_id da sessão e lugar do banco", async () => {
    logado()

    const resposta = await PUT(
      requisicao("PUT", {
        rating: 4,
        comment: "  Vista linda  ",
        user_id: "outra-pessoa",
        google_place_id: "lugar-forjado",
        id: "id-forjado",
      }),
      contexto(),
    )

    expect(resposta.status).toBe(201)
    expect(doBanco("place_reviews", "insert")[0].valores).toEqual({
      google_place_id: GOOGLE_ID,
      place_name: "Marco Zero",
      user_id: EU,
      rating: 4,
      comment: "Vista linda",
    })
  })

  it("200: avaliar de novo edita a avaliação existente, só nota e comentário", async () => {
    logado()
    h.respostas["place_reviews.select"] = { data: { id: "rev-1" }, error: null }

    const resposta = await PUT(requisicao("PUT", { rating: 5, comment: "" }), contexto())

    expect(resposta.status).toBe(200)
    expect(doBanco("place_reviews", "insert")).toEqual([])
    const update = doBanco("place_reviews", "update")[0]
    expect(update.valores).toEqual({ rating: 5, comment: null })
    expect(update.filtros).toEqual([
      ["id", "rev-1"],
      ["user_id", EU],
    ])
  })

  it("409: envio duplicado simultâneo esbarra na unique", async () => {
    logado()
    h.respostas["place_reviews.insert"] = { data: null, error: { code: "23505", message: "duplicate key" } }

    expect((await PUT(requisicao("PUT", { rating: 3 }), contexto())).status).toBe(409)
  })

  it("401: sem sessão", async () => {
    semSessao()
    expect((await PUT(requisicao("PUT", { rating: 4 }), contexto())).status).toBe(401)
    expect(h.chamadas).toEqual([])
  })

  it("403: quem não participa da viagem não avalia", async () => {
    naoMembro()
    expect((await PUT(requisicao("PUT", { rating: 4 }), contexto())).status).toBe(403)
    expect(h.chamadas).toEqual([])
  })

  it.each([
    ["nota 0", { rating: 0 }],
    ["nota 6", { rating: 6 }],
    ["nota fracionária", { rating: 3.5 }],
    ["sem nota", { comment: "só texto" }],
    ["comentário longo", { rating: 4, comment: "a".repeat(1001) }],
  ])("400: %s", async (_nome, corpo) => {
    logado()

    const resposta = await PUT(requisicao("PUT", corpo), contexto())

    expect(resposta.status).toBe(400)
    expect(doBanco("place_reviews", "insert")).toEqual([])
    expect(doBanco("place_reviews", "update")).toEqual([])
  })

  it("404: lugar de outra viagem não é avaliado", async () => {
    logado()
    h.respostas["places.select"] = { data: null, error: null }

    expect((await PUT(requisicao("PUT", { rating: 4 }), contexto())).status).toBe(404)
    expect(doBanco("place_reviews", "insert")).toEqual([])
  })
})

describe("DELETE /api/trips/[tripId]/places/[placeId]/reviews", () => {
  it("200: exclui só a avaliação de quem pede", async () => {
    logado()

    const resposta = await DELETE(requisicao("DELETE"), contexto())

    expect(resposta.status).toBe(200)
    expect(doBanco("place_reviews", "delete")[0].filtros).toEqual([
      ["google_place_id", GOOGLE_ID],
      ["user_id", EU],
    ])
  })

  it("404: não há avaliação própria para excluir", async () => {
    logado()
    h.respostas["place_reviews.delete"] = { data: [], error: null }

    expect((await DELETE(requisicao("DELETE"), contexto())).status).toBe(404)
  })

  it("401: sem sessão", async () => {
    semSessao()
    expect((await DELETE(requisicao("DELETE"), contexto())).status).toBe(401)
  })

  it("403: quem não participa da viagem", async () => {
    naoMembro()
    expect((await DELETE(requisicao("DELETE"), contexto())).status).toBe(403)
    expect(h.chamadas).toEqual([])
  })
})
