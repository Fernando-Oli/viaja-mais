import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { USUARIOS } from "../fixtures/usuarios"
import { admin, chamar, logar } from "./apoio"

/**
 * Lugares e avaliações na API (`/api/trips/:tripId/places/**` e `/api/places`),
 * com sessão e banco reais. Substitui `tests/api/places-route.test.ts`,
 * `place-item-route.test.ts` e `place-reviews-route.test.ts`, que simulavam o
 * cliente do Supabase.
 *
 * Precisa do banco local: `npm run db:reset`.
 *
 * @RF08.2 salvar lugar · @RF08.3 notas no lugar · @RF08.4 marcar visitado · @RF08.6 excluir lugar
 * @RF11.1 avaliar · @RF11.2 ver avaliações de outros · @RF11.3 editar/excluir a própria
 */

const { ana, bruno, carla } = USUARIOS
const GOOGLE_ID = `teste-integracao-${Date.now()}`

let cookieAna: string
let cookieBruno: string
let cookieCarla: string
let viagem: string
let outraViagem: string

async function novaViagem(titulo: string) {
  const { rows } = await admin.query(
    `insert into public.trips (user_id, title, destination, start_date, end_date)
     values ($1, $2, 'Curitiba', '2026-12-10', '2026-12-14') returning id`,
    [ana.id, titulo],
  )
  return rows[0].id as string
}

async function novoLugar(tripId: string, opcoes: { nome?: string; googleId?: string | null; notas?: string } = {}) {
  const { rows } = await admin.query(
    `insert into public.places (trip_id, user_id, name, latitude, longitude, place_id, notes)
     values ($1, $2, $3, -25.43, -49.27, $4, $5) returning id`,
    [tripId, ana.id, opcoes.nome ?? "Jardim Botânico", opcoes.googleId ?? null, opcoes.notas ?? null],
  )
  return rows[0].id as string
}

beforeAll(async () => {
  await admin.connect()
  ;[cookieAna, cookieBruno, cookieCarla] = await Promise.all([
    logar(ana.email, ana.senha),
    logar(bruno.email, bruno.senha),
    logar(carla.email, carla.senha),
  ])
  viagem = await novaViagem("Lugares (integração)")
  outraViagem = await novaViagem("Outra viagem de lugares (integração)")
  await admin.query(`insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member')`, [
    viagem,
    bruno.id,
  ])
})

afterAll(async () => {
  await admin.query("delete from public.place_reviews where google_place_id = $1", [GOOGLE_ID])
  await admin.query("delete from public.trips where id = any($1)", [[viagem, outraViagem]])
  await admin.end()
})

const lugar = { name: "Ópera de Arame", latitude: -25.38, longitude: -49.27, notes: "ir à tarde" }

describe("GET e POST /api/trips/:tripId/places", () => {
  it("200: membro salva lugar com observação; autor da sessão e viagem da URL", async () => {
    const r = await chamar("POST", `/api/trips/${viagem}/places`, {
      cookie: cookieBruno,
      corpo: { ...lugar, user_id: ana.id, trip_id: outraViagem },
    })
    expect(r.status).toBe(200)
    expect((await r.json()).place).toMatchObject({ name: lugar.name, notes: "ir à tarde", user_id: bruno.id, trip_id: viagem })
  })

  it("200: membro lista os lugares", async () => {
    const r = await chamar("GET", `/api/trips/${viagem}/places`, { cookie: cookieBruno })
    expect(r.status).toBe(200)
    expect((await r.json()).places.some((p: { name: string }) => p.name === lugar.name)).toBe(true)
  })

  it("401: sem sessão", async () => {
    expect((await chamar("GET", `/api/trips/${viagem}/places`)).status).toBe(401)
  })

  it("403: quem não participa não lista nem salva", async () => {
    expect((await chamar("GET", `/api/trips/${viagem}/places`, { cookie: cookieCarla })).status).toBe(403)
    expect((await chamar("POST", `/api/trips/${viagem}/places`, { cookie: cookieCarla, corpo: lugar })).status).toBe(403)
  })

  it("400: sem nome e latitude fora da faixa", async () => {
    const caminho = `/api/trips/${viagem}/places`
    expect((await chamar("POST", caminho, { cookie: cookieAna, corpo: { ...lugar, name: "" } })).status).toBe(400)
    expect((await chamar("POST", caminho, { cookie: cookieAna, corpo: { ...lugar, latitude: 91 } })).status).toBe(400)
  })
})

describe("/api/trips/:tripId/places/:placeId", () => {
  it("200: marcar visitado não apaga a observação", async () => {
    const id = await novoLugar(viagem, { notas: "levar casaco" })
    const r = await chamar("PATCH", `/api/trips/${viagem}/places/${id}`, { cookie: cookieBruno, corpo: { visited: true } })
    expect(r.status).toBe(200)
    expect((await r.json()).place).toMatchObject({ visited: true, notes: "levar casaco" })
  })

  it("name e trip_id no corpo não mudam o lugar (mass-assignment)", async () => {
    const id = await novoLugar(viagem)
    await chamar("PATCH", `/api/trips/${viagem}/places/${id}`, {
      cookie: cookieAna,
      corpo: { visited: true, name: "Outro", trip_id: outraViagem },
    })
    const { rows } = await admin.query("select name, trip_id from public.places where id = $1", [id])
    expect(rows[0]).toEqual({ name: "Jardim Botânico", trip_id: viagem })
  })

  it("400: visited que não é booleano e corpo vazio", async () => {
    const caminho = `/api/trips/${viagem}/places/${await novoLugar(viagem)}`
    expect((await chamar("PATCH", caminho, { cookie: cookieAna, corpo: { visited: "sim" } })).status).toBe(400)
    expect((await chamar("PATCH", caminho, { cookie: cookieAna, corpo: {} })).status).toBe(400)
  })

  it("404: lugar de outra viagem", async () => {
    const caminho = `/api/trips/${viagem}/places/${await novoLugar(outraViagem)}`
    expect((await chamar("PATCH", caminho, { cookie: cookieAna, corpo: { visited: true } })).status).toBe(404)
    expect((await chamar("DELETE", caminho, { cookie: cookieAna })).status).toBe(404)
  })

  it("401 e 403 na edição e na exclusão", async () => {
    const caminho = `/api/trips/${viagem}/places/${await novoLugar(viagem)}`
    expect((await chamar("PATCH", caminho, { corpo: { visited: true } })).status).toBe(401)
    expect((await chamar("DELETE", caminho)).status).toBe(401)
    expect((await chamar("PATCH", caminho, { cookie: cookieCarla, corpo: { visited: true } })).status).toBe(403)
    expect((await chamar("DELETE", caminho, { cookie: cookieCarla })).status).toBe(403)
  })

  it("200: membro exclui o lugar", async () => {
    const id = await novoLugar(viagem)
    expect((await chamar("DELETE", `/api/trips/${viagem}/places/${id}`, { cookie: cookieBruno })).status).toBe(200)
    const { rows } = await admin.query("select 1 from public.places where id = $1", [id])
    expect(rows).toHaveLength(0)
  })
})

describe("/api/trips/:tripId/places/:placeId/reviews", () => {
  let avaliavel: string

  beforeAll(async () => {
    avaliavel = await novoLugar(viagem, { nome: "Museu Oscar Niemeyer", googleId: GOOGLE_ID })
  })

  it("200: sem avaliações, lista vazia e média nula", async () => {
    const r = await chamar("GET", `/api/trips/${viagem}/places/${avaliavel}/reviews`, { cookie: cookieAna })
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo.reviews).toEqual([])
    expect(corpo.resumo.media).toBeNull()
  })

  it("201 na primeira avaliação e 200 ao avaliar de novo, sem duplicar", async () => {
    const caminho = `/api/trips/${viagem}/places/${avaliavel}/reviews`
    const primeira = await chamar("PUT", caminho, { cookie: cookieAna, corpo: { rating: 4, comment: "bonito" } })
    expect(primeira.status).toBe(201)
    expect((await primeira.json()).review).toMatchObject({ user_id: ana.id, google_place_id: GOOGLE_ID, rating: 4 })

    const segunda = await chamar("PUT", caminho, { cookie: cookieAna, corpo: { rating: 5 } })
    expect(segunda.status).toBe(200)
    const { rows } = await admin.query("select rating from public.place_reviews where google_place_id = $1", [GOOGLE_ID])
    expect(rows).toEqual([{ rating: 5 }])
  })

  it("200: o membro vê a avaliação dos outros, com autor e sem marcá-la como sua", async () => {
    const r = await chamar("GET", `/api/trips/${viagem}/places/${avaliavel}/reviews`, { cookie: cookieBruno })
    const { reviews, resumo } = await r.json()
    expect(reviews[0]).toMatchObject({ user_id: ana.id, autor: ana.nome, minha: false })
    expect(resumo.media).toBe(5)
  })

  it("400: lugar sem identificador do Google e nota fora da faixa", async () => {
    const semGoogle = await novoLugar(viagem)
    expect(
      (await chamar("GET", `/api/trips/${viagem}/places/${semGoogle}/reviews`, { cookie: cookieAna })).status,
    ).toBe(400)
    const r = await chamar("PUT", `/api/trips/${viagem}/places/${avaliavel}/reviews`, {
      cookie: cookieAna,
      corpo: { rating: 9 },
    })
    expect(r.status).toBe(400)
  })

  it("401, 403 e 404 (lugar de outra viagem)", async () => {
    const caminho = `/api/trips/${viagem}/places/${avaliavel}/reviews`
    expect((await chamar("GET", caminho)).status).toBe(401)
    expect((await chamar("PUT", caminho, { cookie: cookieCarla, corpo: { rating: 1 } })).status).toBe(403)
    const deOutra = await novoLugar(outraViagem, { googleId: GOOGLE_ID })
    expect((await chamar("GET", `/api/trips/${viagem}/places/${deOutra}/reviews`, { cookie: cookieAna })).status).toBe(404)
  })

  it("exclui só a própria avaliação; sem avaliação própria é 404", async () => {
    const caminho = `/api/trips/${viagem}/places/${avaliavel}/reviews`
    expect((await chamar("DELETE", caminho, { cookie: cookieBruno })).status).toBe(404)
    expect((await chamar("DELETE", caminho, { cookie: cookieAna })).status).toBe(200)
    const { rows } = await admin.query("select 1 from public.place_reviews where google_place_id = $1", [GOOGLE_ID])
    expect(rows).toHaveLength(0)
  })
})

describe("GET /api/places", () => {
  it("200: lugares das viagens de que participa, com a viagem junto", async () => {
    await novoLugar(viagem, { nome: "Lugar do grupo" })
    await novoLugar(outraViagem, { nome: "Lugar só da Ana" })
    const r = await chamar("GET", "/api/places", { cookie: cookieBruno })
    expect(r.status).toBe(200)
    const { places } = await r.json()
    expect(places.find((p: { name: string }) => p.name === "Lugar do grupo").trips).toEqual({
      title: "Lugares (integração)",
      destination: "Curitiba",
    })
    expect(places.some((p: { name: string }) => p.name === "Lugar só da Ana")).toBe(false)
  })

  it("401: sem sessão", async () => {
    expect((await chamar("GET", "/api/places")).status).toBe(401)
  })
})
