import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { USUARIOS } from "../fixtures/usuarios"
import { admin, chamar, logar } from "./apoio"

/**
 * Reservas na API (`/api/trips/:tripId/bookings/**` e `/api/bookings`), com
 * sessão e banco reais. Substitui `tests/api/bookings-route.test.ts` e
 * `booking-item-route.test.ts`, que simulavam o cliente do Supabase.
 *
 * Precisa do banco local: `npm run db:reset`.
 *
 * @RF07.1 adicionar reserva · @RF07.5 editar reserva · @RF07.6 excluir reserva
 * @RF07.7 visualizar reservas · @RNF02.7 sem atribuição em massa
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
     values ($1, $2, 'Manaus', '2026-12-10', '2026-12-14') returning id`,
    [ana.id, titulo],
  )
  return rows[0].id as string
}

async function novaReserva(tripId: string, titulo = "Hotel Tropical") {
  const { rows } = await admin.query(
    `insert into public.bookings (trip_id, user_id, type, title, start_date, currency, status)
     values ($1, $2, 'hotel', $3, '2026-12-10T14:00', 'BRL', 'confirmed') returning id`,
    [tripId, ana.id, titulo],
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
  viagem = await novaViagem("Reservas (integração)")
  outraViagem = await novaViagem("Outra viagem de reservas (integração)")
  await admin.query(`insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member')`, [
    viagem,
    bruno.id,
  ])
})

afterAll(async () => {
  await admin.query("delete from public.trips where id = any($1)", [[viagem, outraViagem]])
  await admin.end()
})

const voo = {
  type: "flight",
  title: "Voo GRU-MAO",
  start_date: "2026-12-10T08:00",
  end_date: "2026-12-10T12:00",
  price: 899.9,
}

describe("GET e POST /api/trips/:tripId/bookings", () => {
  it("200: membro adiciona reserva; autor vem da sessão e viagem da URL", async () => {
    const r = await chamar("POST", `/api/trips/${viagem}/bookings`, {
      cookie: cookieBruno,
      corpo: { ...voo, user_id: ana.id, trip_id: outraViagem },
    })
    expect(r.status).toBe(200)
    const { booking } = await r.json()
    expect(booking).toMatchObject({ title: voo.title, user_id: bruno.id, trip_id: viagem, currency: "BRL", price: 899.9 })
  })

  it("200: membro lista as reservas", async () => {
    const r = await chamar("GET", `/api/trips/${viagem}/bookings`, { cookie: cookieBruno })
    expect(r.status).toBe(200)
    expect((await r.json()).bookings.some((b: { title: string }) => b.title === voo.title)).toBe(true)
  })

  it("401: sem sessão", async () => {
    expect((await chamar("POST", `/api/trips/${viagem}/bookings`, { corpo: voo })).status).toBe(401)
  })

  it("403: quem não participa não lista nem adiciona", async () => {
    expect((await chamar("GET", `/api/trips/${viagem}/bookings`, { cookie: cookieCarla })).status).toBe(403)
    expect((await chamar("POST", `/api/trips/${viagem}/bookings`, { cookie: cookieCarla, corpo: voo })).status).toBe(403)
  })

  it("400: término antes do início, tipo fora da lista, preço negativo", async () => {
    const caminho = `/api/trips/${viagem}/bookings`
    for (const corpo of [
      { ...voo, end_date: "2026-12-09T08:00" },
      { ...voo, type: "navio" },
      { ...voo, price: -1 },
    ]) {
      expect((await chamar("POST", caminho, { cookie: cookieAna, corpo })).status).toBe(400)
    }
  })
})

describe("/api/trips/:tripId/bookings/:bookingId", () => {
  it("200: membro carrega e edita a reserva", async () => {
    const reserva = await novaReserva(viagem)
    const caminho = `/api/trips/${viagem}/bookings/${reserva}`
    expect((await chamar("GET", caminho, { cookie: cookieBruno })).status).toBe(200)

    const r = await chamar("PATCH", caminho, { cookie: cookieBruno, corpo: { title: "Hotel novo", status: "cancelled" } })
    expect(r.status).toBe(200)
    expect((await r.json()).booking).toMatchObject({ title: "Hotel novo", status: "cancelled" })
  })

  it("trip_id e user_id no corpo não mudam a reserva (mass-assignment)", async () => {
    const reserva = await novaReserva(viagem)
    await chamar("PATCH", `/api/trips/${viagem}/bookings/${reserva}`, {
      cookie: cookieBruno,
      corpo: { title: "Igual", trip_id: outraViagem, user_id: bruno.id },
    })
    const { rows } = await admin.query("select trip_id, user_id from public.bookings where id = $1", [reserva])
    expect(rows[0]).toEqual({ trip_id: viagem, user_id: ana.id })
  })

  it("404: reserva de outra viagem", async () => {
    const deOutra = await novaReserva(outraViagem)
    const caminho = `/api/trips/${viagem}/bookings/${deOutra}`
    expect((await chamar("GET", caminho, { cookie: cookieAna })).status).toBe(404)
    expect((await chamar("PATCH", caminho, { cookie: cookieAna, corpo: { title: "x" } })).status).toBe(404)
    expect((await chamar("DELETE", caminho, { cookie: cookieAna })).status).toBe(404)
  })

  it("400: corpo vazio e status fora da lista", async () => {
    const caminho = `/api/trips/${viagem}/bookings/${await novaReserva(viagem)}`
    expect((await chamar("PATCH", caminho, { cookie: cookieAna, corpo: {} })).status).toBe(400)
    expect((await chamar("PATCH", caminho, { cookie: cookieAna, corpo: { status: "x" } })).status).toBe(400)
  })

  it("401 e 403 na edição e na exclusão", async () => {
    const caminho = `/api/trips/${viagem}/bookings/${await novaReserva(viagem)}`
    expect((await chamar("PATCH", caminho, { corpo: { title: "x" } })).status).toBe(401)
    expect((await chamar("DELETE", caminho)).status).toBe(401)
    expect((await chamar("PATCH", caminho, { cookie: cookieCarla, corpo: { title: "x" } })).status).toBe(403)
    expect((await chamar("DELETE", caminho, { cookie: cookieCarla })).status).toBe(403)
  })

  it("200: membro exclui a reserva", async () => {
    const reserva = await novaReserva(viagem)
    expect((await chamar("DELETE", `/api/trips/${viagem}/bookings/${reserva}`, { cookie: cookieBruno })).status).toBe(200)
    const { rows } = await admin.query("select 1 from public.bookings where id = $1", [reserva])
    expect(rows).toHaveLength(0)
  })
})

describe("GET /api/bookings", () => {
  it("200: reservas das viagens de que participa, com a viagem junto", async () => {
    await novaReserva(viagem, "Reserva do grupo")
    await novaReserva(outraViagem, "Reserva só da Ana")
    const r = await chamar("GET", "/api/bookings", { cookie: cookieBruno })
    expect(r.status).toBe(200)
    const { bookings } = await r.json()
    const doGrupo = bookings.find((b: { title: string }) => b.title === "Reserva do grupo")
    expect(doGrupo.trips).toEqual({ title: "Reservas (integração)", destination: "Manaus" })
    expect(bookings.some((b: { title: string }) => b.title === "Reserva só da Ana")).toBe(false)
  })

  it("401: sem sessão", async () => {
    expect((await chamar("GET", "/api/bookings")).status).toBe(401)
  })
})
