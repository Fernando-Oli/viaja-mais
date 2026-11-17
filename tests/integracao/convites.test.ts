import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { USUARIOS } from "../fixtures/usuarios"
import { admin, chamar, logar } from "./apoio"

/**
 * Convites na API (`/api/invitations/**`), com sessão, banco e SMTP reais (o
 * Mailpit do docker-compose). Substitui `tests/api/invitations-{get,post}.test.ts`
 * e `invitation-accept-route.test.ts`, que simulavam o Supabase.
 *
 * Precisa da stack local: `docker compose up -d` e `npm run db:reset`.
 *
 * @RF04.1 o dono convida por e-mail · @RF04.2 o convidado recebe o e-mail
 * @RF04.3 aceitar convite · @RNF02.8 limite de convites por usuário
 * @RNF02.7 sem atribuição em massa
 */

const MAILPIT = "http://localhost:58025"
const { ana, bruno, carla, davi } = USUARIOS

let cookieAna: string
let cookieBruno: string
let cookieCarla: string
let cookieDavi: string
let viagem: string

async function convitePendente(email: string) {
  const { rows } = await admin.query(
    `insert into public.trip_invitations (trip_id, inviter_id, invitee_email, status)
     values ($1, $2, $3, 'pending') returning id`,
    [viagem, ana.id, email],
  )
  return rows[0].id as string
}

async function mensagensPara(email: string) {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`)
  const { messages } = (await r.json()) as { messages: { Subject: string }[] }
  return messages
}

const convidar = (cookie: string | undefined, corpo: unknown) => chamar("POST", "/api/invitations", { cookie, corpo })

beforeAll(async () => {
  await admin.connect()
  ;[cookieAna, cookieBruno, cookieCarla, cookieDavi] = await Promise.all([
    logar(ana.email, ana.senha),
    logar(bruno.email, bruno.senha),
    logar(carla.email, carla.senha),
    logar(davi.email, davi.senha),
  ])
  const { rows } = await admin.query(
    `insert into public.trips (user_id, title, destination, start_date, end_date)
     values ($1, 'Convites (integração)', 'Natal', '2026-12-10', '2026-12-14') returning id`,
    [ana.id],
  )
  viagem = rows[0].id
  await admin.query(`insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member')`, [viagem, bruno.id])
  await admin.query("delete from public.rate_limits where user_id = $1 and chave = 'convite'", [ana.id])
})

afterAll(async () => {
  await admin.query("delete from public.rate_limits where user_id = $1 and chave = 'convite'", [ana.id])
  await admin.query("delete from public.trips where id = $1", [viagem])
  await admin.end()
})

describe("POST /api/invitations", () => {
  it("200: o dono convida quem não tem conta; o convite é gravado em nome da sessão e o e-mail sai", async () => {
    const email = `convidado-${Date.now()}@exemplo.local`
    const r = await convidar(cookieAna, { email, tripId: viagem, inviterId: bruno.id, status: "accepted" })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ success: true, envio: "enviado" })

    const { rows } = await admin.query("select inviter_id, status from public.trip_invitations where invitee_email = $1", [email])
    expect(rows).toEqual([{ inviter_id: ana.id, status: "pending" }])

    const mensagens = await mensagensPara(email)
    expect(mensagens).toHaveLength(1)
    expect(mensagens[0].Subject).toBe('Ana Teste convidou você para "Convites (integração)" na Avori')
  })

  it("200: quem já tem conta não recebe e-mail, mas o convite vale", async () => {
    const r = await convidar(cookieAna, { email: davi.email, tripId: viagem })
    expect(r.status).toBe(200)
    expect((await r.json()).envio).toBe("ja-cadastrado")
    expect(await mensagensPara(davi.email)).toHaveLength(0)
  })

  it("401: sem sessão", async () => {
    expect((await convidar(undefined, { email: "x@exemplo.local", tripId: viagem })).status).toBe(401)
  })

  it("403: membro que não é dono, e quem não participa", async () => {
    expect((await convidar(cookieBruno, { email: "x@exemplo.local", tripId: viagem })).status).toBe(403)
    expect((await convidar(cookieCarla, { email: "x@exemplo.local", tripId: viagem })).status).toBe(403)
  })

  it("400: e-mail inválido e viagem que não é UUID", async () => {
    expect((await convidar(cookieAna, { email: "não é e-mail", tripId: viagem })).status).toBe(400)
    expect((await convidar(cookieAna, { email: "x@exemplo.local", tripId: "x" })).status).toBe(400)
  })

  it("429: com o limite estourado, nada é gravado e nenhum e-mail sai", async () => {
    await admin.query(
      `insert into public.rate_limits (user_id, chave, janela_inicio, contagem) values ($1, 'convite', to_timestamp(floor(extract(epoch from now()) / 600) * 600), 10)
       on conflict (user_id, chave) do update set janela_inicio = excluded.janela_inicio, contagem = 10`,
      [ana.id],
    )
    const email = `limite-${Date.now()}@exemplo.local`
    const r = await convidar(cookieAna, { email, tripId: viagem })
    expect(r.status).toBe(429)
    expect(r.headers.get("retry-after")).toBeTruthy()
    const { rows } = await admin.query("select 1 from public.trip_invitations where invitee_email = $1", [email])
    expect(rows).toHaveLength(0)
    expect(await mensagensPara(email)).toHaveLength(0)
    await admin.query("delete from public.rate_limits where user_id = $1 and chave = 'convite'", [ana.id])
  })
})

describe("GET /api/invitations", () => {
  it("200: convites pendentes do e-mail da sessão, com a viagem junto", async () => {
    const id = await convitePendente(carla.email)
    const r = await chamar("GET", "/api/invitations", { cookie: cookieCarla })
    expect(r.status).toBe(200)
    const { invitations } = await r.json()
    expect(invitations.find((i: { id: string }) => i.id === id)).toMatchObject({
      trip_id: viagem,
      status: "pending",
      trip: { title: "Convites (integração)", destination: "Natal", start_date: "2026-12-10" },
    })
  })

  it("401: sem sessão", async () => {
    expect((await chamar("GET", "/api/invitations")).status).toBe(401)
  })
})

describe("POST /api/invitations/:id/accept e /decline", () => {
  it("200: a convidada entra na viagem e o convite fica aceito; aceitar de novo é 404", async () => {
    const id = await convitePendente(carla.email)
    const r = await chamar("POST", `/api/invitations/${id}/accept`, { cookie: cookieCarla })
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ success: true, trip_id: viagem })

    const membro = await admin.query("select role from public.trip_members where trip_id = $1 and user_id = $2", [viagem, carla.id])
    expect(membro.rows).toEqual([{ role: "member" }])
    const convite = await admin.query("select status from public.trip_invitations where id = $1", [id])
    expect(convite.rows[0].status).toBe("accepted")

    expect((await chamar("POST", `/api/invitations/${id}/accept`, { cookie: cookieCarla })).status).toBe(404)
  })

  it("404: convite de outra pessoa não é aceito nem recusado, e nada muda", async () => {
    const id = await convitePendente(`outra-${Date.now()}@exemplo.local`)
    expect((await chamar("POST", `/api/invitations/${id}/accept`, { cookie: cookieDavi })).status).toBe(404)
    expect((await chamar("POST", `/api/invitations/${id}/decline`, { cookie: cookieDavi })).status).toBe(404)
    const { rows } = await admin.query("select status from public.trip_invitations where id = $1", [id])
    expect(rows[0].status).toBe("pending")
    const membro = await admin.query("select 1 from public.trip_members where trip_id = $1 and user_id = $2", [viagem, davi.id])
    expect(membro.rows).toHaveLength(0)
  })

  it("200: quem já é membro só marca o convite como aceito", async () => {
    const id = await convitePendente(bruno.email)
    expect((await chamar("POST", `/api/invitations/${id}/accept`, { cookie: cookieBruno })).status).toBe(200)
    const { rows } = await admin.query("select count(*)::int as n from public.trip_members where trip_id = $1 and user_id = $2", [viagem, bruno.id])
    expect(rows[0].n).toBe(1)
  })

  it("200: recusar marca o convite e não entra na viagem", async () => {
    const id = await convitePendente(davi.email)
    expect((await chamar("POST", `/api/invitations/${id}/decline`, { cookie: cookieDavi })).status).toBe(200)
    const { rows } = await admin.query("select status from public.trip_invitations where id = $1", [id])
    expect(rows[0].status).toBe("declined")
  })

  it("401 sem sessão e 400 para id que não é UUID", async () => {
    const id = await convitePendente(carla.email)
    expect((await chamar("POST", `/api/invitations/${id}/accept`)).status).toBe(401)
    expect((await chamar("POST", `/api/invitations/${id}/decline`)).status).toBe(401)
    expect((await chamar("POST", "/api/invitations/x/accept", { cookie: cookieCarla })).status).toBe(400)
  })
})
