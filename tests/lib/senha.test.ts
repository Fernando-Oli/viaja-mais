import { describe, it, expect } from "vitest"
import { problemaDeSenha, TAMANHO_MINIMO_SENHA } from "@/lib/seguranca/senha"

/**
 * Política de senha (S10-F, achado F4): 8 caracteres, com letra e número.
 * A mesma regra está no `supabase/config.toml`; aqui se prova a mensagem que a
 * tela mostra.
 *
 * @RNF02.2
 */
describe("problemaDeSenha", () => {
  it.each([
    ["viajamais123"],
    ["abcdefg1"],
    ["Ção1Ção1"], // letra acentuada conta como letra
    ["12345678a"],
  ])("aceita %s", (senha) => {
    expect(problemaDeSenha(senha)).toBeNull()
  })

  it.each([
    ["", "8 caracteres"],
    ["abc12", "8 caracteres"],
    ["abcdefg", "8 caracteres"], // 7: um a menos que o mínimo
    ["12345678", "uma letra"],
    ["abcdefgh", "um número"],
    ["********", "uma letra"],
  ])("recusa %j: %s", (senha, trecho) => {
    expect(problemaDeSenha(senha)).toContain(trecho)
  })

  it("o mínimo é 8, e não mais os 6 de antes", () => {
    expect(TAMANHO_MINIMO_SENHA).toBe(8)
    expect(problemaDeSenha("abc123")).not.toBeNull()
  })
})
