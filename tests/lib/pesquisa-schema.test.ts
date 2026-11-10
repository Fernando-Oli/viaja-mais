import { describe, it, expect } from "vitest"
import { registrarPesquisaSchema } from "@/lib/schemas/pesquisa"

/**
 * O corpo de POST /api/social/pesquisas: só o username, normalizado como na
 * leitura de perfil, e nada além dele.
 *
 * @RF09.12
 */

describe("registrarPesquisaSchema", () => {
  it("normaliza o username como a leitura de perfil", () => {
    expect(registrarPesquisaSchema.parse({ username: "  Mari_Lopes " })).toEqual({ username: "mari_lopes" })
  })

  it("descarta dono, perfil e data vindos do corpo", () => {
    expect(
      registrarPesquisaSchema.parse({
        username: "carla",
        user_id: "11111111-1111-4111-8111-111111111111",
        profile_id: "11111111-1111-4111-8111-111111111111",
        searched_at: "2099-01-01T00:00:00Z",
      }),
    ).toEqual({ username: "carla" })
  })

  it("aceita nome reservado no formato: a lista é regra de escrita do próprio perfil", () => {
    expect(registrarPesquisaSchema.parse({ username: "admin" })).toEqual({ username: "admin" })
  })

  it.each([
    ["sem username", {}],
    ["nulo", null],
    ["username que não é texto", { username: 42 }],
    ["fora do formato", { username: "../carla" }],
    ["curto demais", { username: "ab" }],
  ])("recusa %s", (_caso, corpo) => {
    expect(registrarPesquisaSchema.safeParse(corpo).success).toBe(false)
  })
})
