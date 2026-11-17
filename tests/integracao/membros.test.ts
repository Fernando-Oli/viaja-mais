import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { USUARIOS } from "../fixtures/usuarios"
import { admin, chamar, logar } from "./apoio"

/**
 * `GET` e `DELETE /api/trips/:tripId/members` na API, com sessão e banco reais.
 * Substitui `tests/api/members-route.test.ts`, que simulava o cliente do Supabase.
 *
 * Precisa do banco local: `npm run db:reset`.
 *
 * @RF04.4 os membros visualizam a viagem · @RF04.7 o dono remove membros · @RF04.8 o membro sai da viagem
 */

const { ana, bruno, carla } = USUARIOS

let cookieAna: string
let cookieBruno: string
let cookieCarla: string
let viagem: string

beforeAll(async () => {
  await admin.connect()
  ;[cookieAna, cookieBruno, cookieCarla] = await Promise.all([
    logar(ana.email, ana.senha),
    logar(bruno.email, bruno.senha),
    logar(carla.email, carla.senha),
  ])
  const { rows } = await admin.query(
    `insert into public.trips (user_id, title, destination, start_date, end_date)
     values ($1, 'Membros (integração)', 'Salvador', '2026-12-10', '2026-12-12') returning id`,
    [ana.id],
  )
  viagem = rows[0].id
})

// Cada caso parte do mesmo grupo: Ana dona, Bruno membro.
beforeEach(async () => {
  await admin.query(
    `insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member') on conflict do nothing`,
    [viagem, bruno.id],
  )
})

afterAll(async () => {
  await admin.query("delete from public.trips where id = $1", [viagem])
  await admin.end()
})

async function membros() {
  const { rows } = await admin.query("select user_id from public.trip_members where trip_id = $1", [viagem])
  return rows.map((r) => r.user_id)
}

describe("GET /api/trips/:tripId/members", () => {
  it("200: o membro vê o grupo, com o nome de cada um", async () => {
    const r = await chamar("GET", `/api/trips/${viagem}/members`, { cookie: cookieBruno })
    expect(r.status).toBe(200)
    const { members } = await r.json()
    expect(members.map((m: { user_id: string }) => m.user_id)).toEqual([ana.id, bruno.id])
    expect(members[0]).toMatchObject({ role: "owner", profiles: { full_name: ana.nome } })
  })

  it("401: sem sessão", async () => {
    expect((await chamar("GET", `/api/trips/${viagem}/members`)).status).toBe(401)
  })

  it("403: quem não participa", async () => {
    expect((await chamar("GET", `/api/trips/${viagem}/members`, { cookie: cookieCarla })).status).toBe(403)
  })
})

describe("DELETE /api/trips/:tripId/members", () => {
  it("200: a dona remove outro participante", async () => {
    const r = await chamar("DELETE", `/api/trips/${viagem}/members?userId=${bruno.id}`, { cookie: cookieAna })
    expect(r.status).toBe(200)
    expect(await membros()).not.toContain(bruno.id)
  })

  it("200: o membro sai por conta própria", async () => {
    const r = await chamar("DELETE", `/api/trips/${viagem}/members?userId=${bruno.id}`, { cookie: cookieBruno })
    expect(r.status).toBe(200)
    expect(await membros()).not.toContain(bruno.id)
  })

  it("401: sem sessão", async () => {
    expect((await chamar("DELETE", `/api/trips/${viagem}/members?userId=${bruno.id}`)).status).toBe(401)
  })

  it("403: quem não participa não remove ninguém", async () => {
    const r = await chamar("DELETE", `/api/trips/${viagem}/members?userId=${bruno.id}`, { cookie: cookieCarla })
    expect(r.status).toBe(403)
    expect(await membros()).toContain(bruno.id)
  })

  it("403: membro comum não remove a dona", async () => {
    const r = await chamar("DELETE", `/api/trips/${viagem}/members?userId=${ana.id}`, { cookie: cookieBruno })
    expect(r.status).toBe(403)
    expect(await membros()).toContain(ana.id)
  })

  it("400: sem dizer quem sai", async () => {
    expect((await chamar("DELETE", `/api/trips/${viagem}/members`, { cookie: cookieAna })).status).toBe(400)
  })

  it("400: a dona não pode sair da própria viagem", async () => {
    const r = await chamar("DELETE", `/api/trips/${viagem}/members?userId=${ana.id}`, { cookie: cookieAna })
    expect(r.status).toBe(400)
    expect(await membros()).toContain(ana.id)
  })
})
