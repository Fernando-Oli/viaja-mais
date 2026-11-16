import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { USUARIOS } from "../fixtures/usuarios"
import { admin, chamar, logar } from "./apoio"

/**
 * `GET /api/trips` e `POST /api/trips` na API, com sessão real e banco real.
 * Substituem `tests/api/trips-get.test.ts` e `trips-post.test.ts`, que
 * simulavam o cliente do Supabase.
 *
 * Precisa do banco local: `npm run db:reset`.
 *
 * @RF03.1 criar viagem · @RF03.4 listar viagens · @RF04.4 os membros visualizam a viagem
 * @RNF02.5 validação por esquema · @RNF02.7 sem atribuição em massa
 */

const { ana, bruno } = USUARIOS

let cookieAna: string
let cookieBruno: string
let daAna: string
let compartilhada: string
const criadas: string[] = []

async function viagemDe(dono: string, titulo: string) {
  const { rows } = await admin.query(
    `insert into public.trips (user_id, title, destination, start_date, end_date)
     values ($1, $2, 'Porto', '2026-12-01', '2026-12-05') returning id`,
    [dono, titulo],
  )
  criadas.push(rows[0].id)
  return rows[0].id as string
}

beforeAll(async () => {
  await admin.connect()
  ;[cookieAna, cookieBruno] = await Promise.all([logar(ana.email, ana.senha), logar(bruno.email, bruno.senha)])
  daAna = await viagemDe(ana.id, "Só da Ana (lista)")
  compartilhada = await viagemDe(ana.id, "Ana com Bruno (lista)")
  await admin.query(`insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member')`, [
    compartilhada,
    bruno.id,
  ])
})

afterAll(async () => {
  if (criadas.length) await admin.query("delete from public.trips where id = any($1)", [criadas])
  await admin.end()
})

describe("GET /api/trips", () => {
  it("200: a dona vê as próprias viagens, com o papel dela em trip_members", async () => {
    const r = await chamar("GET", "/api/trips", { cookie: cookieAna })
    expect(r.status).toBe(200)
    const { trips } = await r.json()
    const minha = trips.find((t: { id: string }) => t.id === daAna)
    expect(minha).toBeDefined()
    expect(minha.trip_members).toEqual([{ user_id: ana.id, role: "owner" }])
  })

  it("200: o membro vê a viagem do grupo, mas não a que não participa", async () => {
    const r = await chamar("GET", "/api/trips", { cookie: cookieBruno })
    expect(r.status).toBe(200)
    const ids = (await r.json()).trips.map((t: { id: string }) => t.id)
    expect(ids).toContain(compartilhada)
    expect(ids).not.toContain(daAna)
  })

  it("401: sem sessão", async () => {
    expect((await chamar("GET", "/api/trips")).status).toBe(401)
  })
})

describe("POST /api/trips", () => {
  const corpo = {
    title: "Criada pela API",
    destination: "Recife",
    start_date: "2027-01-10",
    end_date: "2027-01-12",
    budget: 1500,
    currency: "brl",
  }

  it("200: cria a viagem e a criadora vira dona pelo gatilho", async () => {
    const r = await chamar("POST", "/api/trips", { cookie: cookieAna, corpo })
    expect(r.status).toBe(200)
    const { data } = await r.json()
    criadas.push(data[0].id)
    expect(data[0]).toMatchObject({ title: "Criada pela API", user_id: ana.id, currency: "BRL" })

    const { rows } = await admin.query("select user_id, role from public.trip_members where trip_id = $1", [data[0].id])
    expect(rows).toEqual([{ user_id: ana.id, role: "owner" }])
  })

  it("user_id no corpo não muda o dono (mass-assignment)", async () => {
    const r = await chamar("POST", "/api/trips", { cookie: cookieAna, corpo: { ...corpo, user_id: bruno.id } })
    expect(r.status).toBe(200)
    const { data } = await r.json()
    criadas.push(data[0].id)
    expect(data[0].user_id).toBe(ana.id)
  })

  it("401: sem sessão não cria nada", async () => {
    expect((await chamar("POST", "/api/trips", { corpo })).status).toBe(401)
  })

  it("400: fim antes do início", async () => {
    const r = await chamar("POST", "/api/trips", {
      cookie: cookieAna,
      corpo: { ...corpo, end_date: "2027-01-01" },
    })
    expect(r.status).toBe(400)
  })
})
