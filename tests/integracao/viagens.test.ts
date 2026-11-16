import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Hono } from "hono"
import { USUARIOS } from "../fixtures/usuarios"
import { admin, chamar, logar } from "./apoio"
import { tratarErro } from "@/api/http/erros"

/**
 * Rota-molde da API: `/api/trips/:tripId`.
 *
 * Os quatro caminhos obrigatórios de toda rota — 200, 401, 403, 400 — com sessão
 * real do Better Auth e banco real. Substitui os testes da rota antiga do Next
 * (`trips-patch.test.ts`, `trip-item-route.test.ts`), que simulavam o cliente do
 * Supabase.
 *
 * Precisa do banco local: `npm run db:reset`.
 *
 * @RF03.5 visualizar detalhes da viagem · @RF03.2 editar viagem · @RF03.3 excluir viagem
 * @RF01.3 autenticação com e-mail e senha · @RNF02.3 sessão validada no servidor
 */

const { ana, bruno, carla } = USUARIOS

let cookieAna: string
let cookieBruno: string
let cookieCarla: string
let viagem: string
const criadas: string[] = []

async function novaViagemDaAna(titulo: string) {
  const { rows } = await admin.query(
    `insert into public.trips (user_id, title, destination, start_date, end_date)
     values ($1, $2, 'Lisboa', '2026-12-10', '2026-12-15') returning id`,
    [ana.id, titulo],
  )
  criadas.push(rows[0].id)
  return rows[0].id as string
}

beforeAll(async () => {
  await admin.connect()
  ;[cookieAna, cookieBruno, cookieCarla] = await Promise.all([
    logar(ana.email, ana.senha),
    logar(bruno.email, bruno.senha),
    logar(carla.email, carla.senha),
  ])
  viagem = await novaViagemDaAna("Viagem da Ana (integração)")
})

afterAll(async () => {
  if (criadas.length) await admin.query("delete from public.trips where id = any($1)", [criadas])
  await admin.end()
})

describe("GET /api/trips/:tripId", () => {
  it("200: a dona vê a viagem com os membros", async () => {
    const r = await chamar("GET", `/api/trips/${viagem}`, { cookie: cookieAna })
    expect(r.status).toBe(200)
    const { trip } = await r.json()
    expect(trip.id).toBe(viagem)
    expect(trip.start_date).toBe("2026-12-10")
    expect(trip.trip_members).toEqual([{ user_id: ana.id, role: "owner" }])
  })

  it("401: sem cookie", async () => {
    const r = await chamar("GET", `/api/trips/${viagem}`)
    expect(r.status).toBe(401)
  })

  it("401: cookie de sessão forjado", async () => {
    const r = await chamar("GET", `/api/trips/${viagem}`, { cookie: "avori.session_token=forjado.assinatura" })
    expect(r.status).toBe(401)
  })

  it("403: quem não participa, sem vazar o título", async () => {
    const r = await chamar("GET", `/api/trips/${viagem}`, { cookie: cookieBruno })
    expect(r.status).toBe(403)
    expect(await r.text()).not.toContain("Viagem da Ana")
  })

  it("400: id que não é UUID", async () => {
    const r = await chamar("GET", "/api/trips/nao-e-uuid", { cookie: cookieAna })
    expect(r.status).toBe(400)
  })
})

describe("PATCH /api/trips/:tripId", () => {
  it("200: a dona edita e o banco muda", async () => {
    const r = await chamar("PATCH", `/api/trips/${viagem}`, { cookie: cookieAna, corpo: { title: "Lisboa e Sintra" } })
    expect(r.status).toBe(200)
    expect((await r.json()).trip.title).toBe("Lisboa e Sintra")
    const { rows } = await admin.query("select title from public.trips where id = $1", [viagem])
    expect(rows[0].title).toBe("Lisboa e Sintra")
  })

  it("401: sem cookie", async () => {
    const r = await chamar("PATCH", `/api/trips/${viagem}`, { corpo: { title: "x" } })
    expect(r.status).toBe(401)
  })

  it("403: quem não participa não edita, e o título não muda", async () => {
    const r = await chamar("PATCH", `/api/trips/${viagem}`, { cookie: cookieBruno, corpo: { title: "invadida" } })
    expect(r.status).toBe(403)
    const { rows } = await admin.query("select title from public.trips where id = $1", [viagem])
    expect(rows[0].title).not.toBe("invadida")
  })

  it("400: data de fim anterior à de início", async () => {
    const r = await chamar("PATCH", `/api/trips/${viagem}`, {
      cookie: cookieAna,
      corpo: { start_date: "2026-12-10", end_date: "2026-12-01" },
    })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toBe("Dados inválidos")
  })

  it("400: corpo que não é JSON", async () => {
    const r = await chamar("PATCH", `/api/trips/${viagem}`, { cookie: cookieAna, corpo: undefined })
    expect(r.status).toBe(400)
  })

  it("user_id no corpo não troca o dono (mass-assignment)", async () => {
    const r = await chamar("PATCH", `/api/trips/${viagem}`, {
      cookie: cookieAna,
      corpo: { title: "Lisboa", user_id: bruno.id, id: "00000000-0000-4000-8000-000000000000" },
    })
    expect(r.status).toBe(200)
    const { rows } = await admin.query("select user_id from public.trips where id = $1", [viagem])
    expect(rows[0].user_id).toBe(ana.id)
  })
})

describe("DELETE /api/trips/:tripId", () => {
  it("403: membro que não é dono não exclui", async () => {
    const alvo = await novaViagemDaAna("Viagem com a Carla de membro")
    await admin.query("insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member')", [
      alvo,
      carla.id,
    ])
    const r = await chamar("DELETE", `/api/trips/${alvo}`, { cookie: cookieCarla })
    expect(r.status).toBe(403)
    const { rowCount } = await admin.query("select 1 from public.trips where id = $1", [alvo])
    expect(rowCount).toBe(1)
  })

  it("200: a dona exclui", async () => {
    const alvo = await novaViagemDaAna("Viagem para excluir")
    const r = await chamar("DELETE", `/api/trips/${alvo}`, { cookie: cookieAna })
    expect(r.status).toBe(200)
    const { rowCount } = await admin.query("select 1 from public.trips where id = $1", [alvo])
    expect(rowCount).toBe(0)
  })
})

describe("autenticação", () => {
  it("cadastro com senha fraca é recusado com a mensagem da política", async () => {
    const r = await chamar("POST", "/api/auth/sign-up/email", {
      corpo: { email: "fraca@viajamais.local", password: "semsimbolo1A", name: "Fraca" },
    })
    expect(r.status).toBe(400)
    expect((await r.json()).message).toMatch(/símbolo/)
  })

  it("login com senha errada não abre sessão", async () => {
    await expect(logar(ana.email, "Errada+123")).rejects.toThrow(/401/)
  })

  it("encerrar a sessão invalida o cookie", async () => {
    const cookie = await logar(ana.email, ana.senha)
    const saida = await chamar("POST", "/api/auth/sign-out", { cookie })
    expect(saida.status).toBe(200)
    const r = await chamar("GET", `/api/trips/${viagem}`, { cookie })
    expect(r.status).toBe(401)
  })
})

describe("infraestrutura", () => {
  it("/health responde 200 com a réplica", async () => {
    const r = await chamar("GET", "/health")
    expect(r.status).toBe(200)
    expect(r.headers.get("x-replica")).toBeTruthy()
  })

  it("erro inesperado vira 500 genérico com código, sem a mensagem interna", async () => {
    const quebrada = new Hono()
      .get("/", () => {
        throw new Error('relation "trips" violates constraint "trips_user_id_fkey"')
      })
      .onError(tratarErro)
    const silencio = console.error
    console.error = () => {}
    try {
      const r = await quebrada.request("/")
      expect(r.status).toBe(500)
      expect(r.headers.get("x-codigo-erro")).toMatch(/^[0-9a-f]{8}$/)
      const corpo = await r.text()
      expect(corpo).not.toContain("trips_user_id_fkey")
      expect(JSON.parse(corpo)).toEqual({ error: "Erro interno do servidor" })
    } finally {
      console.error = silencio
    }
  })
})
