import { describe, it, expect, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { nomesDosPerfis } from "@/lib/social/perfis"

/** Cliente falso: só o encadeamento `from().select().in()` que o helper usa. */
function clienteFalso(resposta: { data: unknown; error: unknown }) {
  const inFn = vi.fn(() => Promise.resolve(resposta))
  const select = vi.fn(() => ({ in: inFn }))
  const from = vi.fn(() => ({ select }))
  return { cliente: { from } as unknown as SupabaseClient, from, select, inFn }
}

describe("nomesDosPerfis", () => {
  it("devolve o nome de cada id, lendo só id e full_name", async () => {
    const { cliente, from, select, inFn } = clienteFalso({
      data: [
        { id: "a", full_name: "Ana" },
        { id: "b", full_name: null },
      ],
      error: null,
    })

    const nomes = await nomesDosPerfis(cliente, ["a", "b"])

    expect(from).toHaveBeenCalledWith("profiles")
    expect(select).toHaveBeenCalledWith("id, full_name")
    expect(inFn).toHaveBeenCalledWith("id", ["a", "b"])
    expect(nomes.get("a")).toBe("Ana")
    expect(nomes.get("b")).toBeNull()
  })

  it("não repete id na consulta", async () => {
    const { cliente, inFn } = clienteFalso({ data: [], error: null })

    await nomesDosPerfis(cliente, ["a", "a", "b"])

    expect(inFn).toHaveBeenCalledWith("id", ["a", "b"])
  })

  it("lista vazia não consulta o banco", async () => {
    const { cliente, from } = clienteFalso({ data: [], error: null })

    const nomes = await nomesDosPerfis(cliente, [])

    expect(nomes.size).toBe(0)
    expect(from).not.toHaveBeenCalled()
  })

  it("erro na consulta devolve mapa vazio em vez de derrubar a tela", async () => {
    const { cliente } = clienteFalso({ data: null, error: { message: "falhou" } })

    const nomes = await nomesDosPerfis(cliente, ["a"])

    expect(nomes.size).toBe(0)
  })
})
