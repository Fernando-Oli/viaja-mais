import { describe, it, expect, vi, beforeEach } from "vitest"
import { FILTRO_EM_VIAGENS } from "@/lib/trips/escopo"

/**
 * @RF03.4 listar viagens · @RF04.4 os membros visualizam a viagem
 *
 * A lista vem de `trips` filtrada pela participação em `trip_members`, não por
 * `trips.user_id`: o convidado precisa ver a viagem de que participa. O teste
 * registra o filtro que chega ao banco para pegar a volta ao `user_id`.
 */

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  resultado: { data: [] as unknown[] | null, error: null as { message: string } | null },
  filtros: [] as [string, unknown][],
  lancar: false,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    if (h.lancar) throw new Error("falha de rede")
    return {
      auth: { getUser: h.getUser },
      from: () => ({
        select: () => ({
          eq: (coluna: string, valor: unknown) => {
            h.filtros.push([coluna, valor])
            return { order: () => ({ limit: async (n: number) => ((globalThis as { __limite?: number }).__limite = n, h.resultado) }) }
          },
        }),
      }),
    }
  },
}))

import { GET } from "@/app/api/trips/route"

beforeEach(() => {
  h.getUser.mockReset()
  h.resultado = { data: [], error: null }
  h.filtros.length = 0
  h.lancar = false
})

describe("GET /api/trips", () => {
  it("200: lista as viagens em que o usuário participa", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
    h.resultado = { data: [{ id: "trip-1", title: "Porto" }], error: null }

    const resposta = await GET()

    expect((globalThis as { __limite?: number }).__limite).toBe(500) // RNF06.4
    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ trips: [{ id: "trip-1", title: "Porto" }] })
    expect(h.filtros).toEqual([[FILTRO_EM_VIAGENS, "user-1"]])
  })

  it("401: sem sessão não consulta o banco", async () => {
    h.getUser.mockResolvedValue({ data: { user: null } })

    const resposta = await GET()

    expect(resposta.status).toBe(401)
    expect(h.filtros).toEqual([])
  })

  it("400: erro da consulta", async () => {
    h.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } })
    h.resultado = { data: null, error: { message: "falhou" } }

    expect((await GET()).status).toBe(400)
  })

  it("500: exceção inesperada vira mensagem genérica", async () => {
    h.lancar = true

    const resposta = await GET()

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
  })
})
