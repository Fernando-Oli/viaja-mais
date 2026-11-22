import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

/**
 * A exceção da verificação de saúde no proxy: só `/api/saude`, exatamente, é
 * pública. Nenhuma rota abaixo dela nem com o mesmo prefixo herda a exceção.
 *
 * @RNF04.1 · @RF01.6 barra o acesso não autenticado
 */

const h = vi.hoisted(() => ({ usuario: null as { id: string } | null }))

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: h.usuario } }) },
  }),
}))

import { updateSession } from "@/lib/supabase/proxy"

const pedir = (caminho: string) => updateSession(new NextRequest(`https://viaja-mais.online${caminho}`))

beforeEach(() => {
  h.usuario = null
})

describe("proxy: verificação de saúde sem sessão", () => {
  it("/api/saude passa sem sessão", async () => {
    const r = await pedir("/api/saude")
    expect(r.status).toBe(200)
    expect(r.headers.get("location")).toBeNull()
  })

  it.each(["/api/saude/detalhes", "/api/saudex", "/api/trips"])("%s continua exigindo sessão (401)", async (caminho) => {
    const r = await pedir(caminho)
    expect(r.status).toBe(401)
  })

  it("página protegida sem sessão continua indo ao login", async () => {
    const r = await pedir("/dashboard")
    expect(r.headers.get("location")).toMatch(/\/auth\/login$/)
  })
})
