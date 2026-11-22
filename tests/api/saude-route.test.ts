import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * GET /api/saude: o que o monitor de disponibilidade consulta a cada cinco
 * minutos. Sem sessão, sem dado, sem cache, e sem a mensagem interna do banco
 * quando ele falha.
 *
 * @RNF04.1 disponibilidade monitorada
 */

const h = vi.hoisted(() => ({
  erro: null as { message: string } | null,
  lancar: false,
  consultas: [] as { tabela: string; opcoes: unknown }[],
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (h.lancar) throw new Error("fetch failed: ECONNREFUSED 10.0.0.1:5432")
    return {
      from: (tabela: string) => ({
        select: (_colunas: string, opcoes: unknown) => {
          h.consultas.push({ tabela, opcoes })
          return { limit: async () => ({ data: null, count: 0, error: h.erro }) }
        },
      }),
    }
  },
}))

import { GET } from "@/app/api/saude/route"

beforeEach(() => {
  h.erro = null
  h.lancar = false
  h.consultas = []
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("GET /api/saude", () => {
  it("200 com banco ok quando o banco responde", async () => {
    const r = await GET()
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo).toMatchObject({ status: "ok", banco: "ok" })
    expect(typeof corpo.ms).toBe("number")
  })

  it("consulta só a contagem, sem trazer linha nenhuma", async () => {
    await GET()
    expect(h.consultas).toEqual([{ tabela: "trips", opcoes: { count: "exact", head: true } }])
  })

  it("503 quando o banco devolve erro, sem repassar a mensagem dele", async () => {
    h.erro = { message: 'password authentication failed for user "authenticator"' }
    const r = await GET()
    expect(r.status).toBe(503)
    const texto = await r.text()
    expect(JSON.parse(texto)).toMatchObject({ status: "indisponivel", banco: "falha" })
    expect(texto).not.toMatch(/password|authenticator/)
  })

  it("503 quando nem o cliente do banco sobe", async () => {
    h.lancar = true
    const r = await GET()
    expect(r.status).toBe(503)
    expect(await r.text()).not.toMatch(/ECONNREFUSED|10\.0\.0\.1/)
  })

  it("nunca deixa a resposta ser guardada em cache", async () => {
    expect((await GET()).headers.get("Cache-Control")).toBe("no-store")
    h.erro = { message: "x" }
    expect((await GET()).headers.get("Cache-Control")).toBe("no-store")
  })
})
