import { describe, it, expect, vi } from "vitest"

/**
 * Regressão do bug P0 (S02-A): a tela de itinerário fazia
 * `.select("*, trips(title, destination)").eq("trips.user_id", user.id)`.
 * Sem `!inner` o PostgREST trata o embed como LEFT JOIN e ignora o filtro sobre
 * a tabela aninhada — a consulta devolvia itens de viagem de qualquer usuário.
 */

const h = vi.hoisted(() => ({ selects: [] as string[], eqs: [] as Array<[string, unknown]> }))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }) },
    from() {
      const chain: Record<string, (...args: unknown[]) => unknown> = {
        select: (colunas: unknown) => {
          h.selects.push(String(colunas))
          return chain
        },
        eq: (coluna: unknown, valor: unknown) => {
          h.eqs.push([String(coluna), valor])
          return chain
        },
        gte: () => chain,
        order: () => chain,
        limit: () => Promise.resolve({ data: [], error: null }),
      }
      return chain
    },
  }),
}))

vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

import ItineraryPage from "@/app/dashboard/itinerary/page"

describe("ItineraryPage", () => {
  it("filtra o itinerário por participação em trip_members", async () => {
    await ItineraryPage()

    expect(h.selects.some((s) => s.includes("trip_members!inner"))).toBe(true)
    expect(h.eqs).toContainEqual(["trips.trip_members.user_id", "user-1"])
  })
})
