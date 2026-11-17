import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { USUARIOS } from "../fixtures/usuarios"
import { admin, chamar, logar } from "./apoio"

/**
 * Itinerário na API (`/api/trips/:tripId/itinerary/**` e `/api/itinerary`), com
 * sessão e banco reais. Substitui `tests/api/itinerary-route.test.ts` e
 * `itinerary-item-route.test.ts`, que simulavam o cliente do Supabase.
 *
 * Precisa do banco local: `npm run db:reset`.
 *
 * @RF05.1 adicionar atividade · @RF05.2 editar atividade · @RF05.3 excluir atividade
 * @RF05.4 visualizar itinerário · @RNF02.7 sem atribuição em massa
 */

const { ana, bruno, carla } = USUARIOS

let cookieAna: string
let cookieBruno: string
let cookieCarla: string
let viagem: string
let outraViagem: string

async function novaViagem(titulo: string) {
  const { rows } = await admin.query(
    `insert into public.trips (user_id, title, destination, start_date, end_date)
     values ($1, $2, 'Belém', '2026-12-10', '2026-12-14') returning id`,
    [ana.id, titulo],
  )
  return rows[0].id as string
}

async function novoItem(tripId: string, titulo = "Ver-o-Peso") {
  const { rows } = await admin.query(
    `insert into public.itinerary_items (trip_id, title, date, start_time, category, status)
     values ($1, $2, '2026-12-11', '09:00', 'activity', 'planned') returning id`,
    [tripId, titulo],
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
  viagem = await novaViagem("Itinerário (integração)")
  outraViagem = await novaViagem("Outra viagem (integração)")
  await admin.query(`insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member')`, [
    viagem,
    bruno.id,
  ])
})

afterAll(async () => {
  await admin.query("delete from public.trips where id = any($1)", [[viagem, outraViagem]])
  await admin.end()
})

const atividade = {
  title: "Museu Emílio Goeldi",
  date: "2026-12-12",
  start_time: "10:00",
  end_time: "12:00",
  category: "attraction",
}

describe("GET e POST /api/trips/:tripId/itinerary", () => {
  it("200: membro adiciona atividade, com trip_id da URL mesmo que o corpo mande outro", async () => {
    const r = await chamar("POST", `/api/trips/${viagem}/itinerary`, {
      cookie: cookieBruno,
      corpo: { ...atividade, trip_id: outraViagem },
    })
    expect(r.status).toBe(200)
    const { item } = await r.json()
    expect(item).toMatchObject({ title: atividade.title, trip_id: viagem, status: "planned" })
  })

  it("200: membro lê o itinerário", async () => {
    const r = await chamar("GET", `/api/trips/${viagem}/itinerary`, { cookie: cookieBruno })
    expect(r.status).toBe(200)
    const { itinerary } = await r.json()
    expect(itinerary.some((i: { title: string }) => i.title === atividade.title)).toBe(true)
  })

  it("401: sem sessão", async () => {
    expect((await chamar("POST", `/api/trips/${viagem}/itinerary`, { corpo: atividade })).status).toBe(401)
  })

  it("403: quem não participa não lê nem adiciona", async () => {
    expect((await chamar("GET", `/api/trips/${viagem}/itinerary`, { cookie: cookieCarla })).status).toBe(403)
    const r = await chamar("POST", `/api/trips/${viagem}/itinerary`, { cookie: cookieCarla, corpo: atividade })
    expect(r.status).toBe(403)
  })

  it("400: término antes do início", async () => {
    const r = await chamar("POST", `/api/trips/${viagem}/itinerary`, {
      cookie: cookieAna,
      corpo: { ...atividade, end_time: "08:00" },
    })
    expect(r.status).toBe(400)
  })
})

describe("/api/trips/:tripId/itinerary/:itemId", () => {
  it("200: membro carrega, edita e conclui a atividade", async () => {
    const item = await novoItem(viagem)
    expect((await chamar("GET", `/api/trips/${viagem}/itinerary/${item}`, { cookie: cookieBruno })).status).toBe(200)

    const r = await chamar("PATCH", `/api/trips/${viagem}/itinerary/${item}`, {
      cookie: cookieBruno,
      corpo: { title: "Ver-o-Peso cedo", status: "completed" },
    })
    expect(r.status).toBe(200)
    expect((await r.json()).item).toMatchObject({ title: "Ver-o-Peso cedo", status: "completed" })
  })

  it("trip_id e id no corpo não mudam a atividade de viagem (mass-assignment)", async () => {
    const item = await novoItem(viagem)
    const r = await chamar("PATCH", `/api/trips/${viagem}/itinerary/${item}`, {
      cookie: cookieAna,
      corpo: { title: "Mesmo lugar", trip_id: outraViagem },
    })
    expect(r.status).toBe(200)
    const { rows } = await admin.query("select trip_id from public.itinerary_items where id = $1", [item])
    expect(rows[0].trip_id).toBe(viagem)
  })

  it("404: atividade de outra viagem, mesmo sendo membro da viagem da URL", async () => {
    const deOutra = await novoItem(outraViagem)
    const caminho = `/api/trips/${viagem}/itinerary/${deOutra}`
    expect((await chamar("GET", caminho, { cookie: cookieAna })).status).toBe(404)
    expect((await chamar("PATCH", caminho, { cookie: cookieAna, corpo: { title: "x" } })).status).toBe(404)
    expect((await chamar("DELETE", caminho, { cookie: cookieAna })).status).toBe(404)
  })

  it("400: corpo vazio e status fora da lista", async () => {
    const item = await novoItem(viagem)
    const caminho = `/api/trips/${viagem}/itinerary/${item}`
    expect((await chamar("PATCH", caminho, { cookie: cookieAna, corpo: {} })).status).toBe(400)
    expect((await chamar("PATCH", caminho, { cookie: cookieAna, corpo: { status: "x" } })).status).toBe(400)
  })

  it("401 e 403 na edição e na exclusão", async () => {
    const item = await novoItem(viagem)
    const caminho = `/api/trips/${viagem}/itinerary/${item}`
    expect((await chamar("PATCH", caminho, { corpo: { title: "x" } })).status).toBe(401)
    expect((await chamar("DELETE", caminho)).status).toBe(401)
    expect((await chamar("PATCH", caminho, { cookie: cookieCarla, corpo: { title: "x" } })).status).toBe(403)
    expect((await chamar("DELETE", caminho, { cookie: cookieCarla })).status).toBe(403)
  })

  it("200: membro exclui a atividade", async () => {
    const item = await novoItem(viagem)
    const r = await chamar("DELETE", `/api/trips/${viagem}/itinerary/${item}`, { cookie: cookieBruno })
    expect(r.status).toBe(200)
    const { rows } = await admin.query("select 1 from public.itinerary_items where id = $1", [item])
    expect(rows).toHaveLength(0)
  })
})

describe("GET /api/itinerary", () => {
  it("200: próximas atividades das viagens de que participa, com a viagem junto", async () => {
    await novoItem(viagem, "Agenda do Bruno")
    const r = await chamar("GET", "/api/itinerary?desde=2026-12-01", { cookie: cookieBruno })
    expect(r.status).toBe(200)
    const { itinerary } = await r.json()
    const doBruno = itinerary.find((i: { title: string }) => i.title === "Agenda do Bruno")
    expect(doBruno.trips).toEqual({ title: "Itinerário (integração)", destination: "Belém" })
    // A outra viagem é só da Ana. Regressão do bug P0 de S02-A: a agenda
    // devolvia itens de viagem de qualquer usuário (embed sem `!inner`). Antes
    // provada em tests/app/itinerary-scope.test.ts, contra a consulta do Supabase.
    expect(itinerary.every((i: { trip_id: string }) => i.trip_id !== outraViagem)).toBe(true)
  })

  it("401: sem sessão", async () => {
    expect((await chamar("GET", "/api/itinerary")).status).toBe(401)
  })

  it("400: data malformada", async () => {
    expect((await chamar("GET", "/api/itinerary?desde=ontem", { cookie: cookieAna })).status).toBe(400)
  })
})
