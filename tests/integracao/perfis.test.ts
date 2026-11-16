import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { USUARIOS } from "../fixtures/usuarios"
import { admin, chamar, logar } from "./apoio"

/**
 * `GET /api/profile/:userId` na API, com sessão real e banco real. Substitui
 * `tests/api/profile-userid-route.test.ts`, que simulava o cliente do Supabase.
 *
 * Precisa do banco local: `npm run db:reset`.
 *
 * @RF02.1 visualizar perfil
 */

const { ana, bruno } = USUARIOS
let cookieAna: string

beforeAll(async () => {
  await admin.connect()
  cookieAna = await logar(ana.email, ana.senha)
})

afterAll(async () => {
  await admin.end()
})

describe("GET /api/profile/:userId", () => {
  it("200: o próprio perfil, com o nome do cadastro e sem cache compartilhado", async () => {
    const r = await chamar("GET", `/api/profile/${ana.id}`, { cookie: cookieAna })
    expect(r.status).toBe(200)
    expect(r.headers.get("cache-control")).toBe("private, no-store")
    const { profile } = await r.json()
    expect(profile).toMatchObject({ id: ana.id, full_name: ana.nome, avatar_url: null })
  })

  it("200: dados básicos de outro perfil são visíveis a quem está autenticado", async () => {
    const r = await chamar("GET", `/api/profile/${bruno.id}`, { cookie: cookieAna })
    expect(r.status).toBe(200)
    expect((await r.json()).profile.id).toBe(bruno.id)
  })

  it("401: sem sessão", async () => {
    expect((await chamar("GET", `/api/profile/${ana.id}`)).status).toBe(401)
  })

  it("400: id que não é UUID", async () => {
    expect((await chamar("GET", "/api/profile/abc", { cookie: cookieAna })).status).toBe(400)
  })

  it("404: UUID sem perfil", async () => {
    const r = await chamar("GET", "/api/profile/99999999-9999-4999-8999-999999999999", { cookie: cookieAna })
    expect(r.status).toBe(404)
  })
})
