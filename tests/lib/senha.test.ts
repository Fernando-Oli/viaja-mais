import { describe, it, expect } from "vitest"
import { problemaDeSenha, TAMANHO_MINIMO_SENHA } from "@/lib/seguranca/senha"
import { SENHA_TESTE } from "../fixtures/usuarios"

/**
 * Política de senha: 8 caracteres, com minúscula, maiúscula, número e símbolo —
 * a mesma regra do Auth em produção e no `supabase/config.toml`. Aqui se prova
 * a mensagem que a tela mostra antes de enviar.
 *
 * @RNF02.2
 */
describe("problemaDeSenha", () => {
  it.each([[SENHA_TESTE], ["Abcdef1!"], ["Senha#2026"], ["x-Y-z-9-w"]])("aceita %s", (senha) => {
    expect(problemaDeSenha(senha)).toBeNull()
  })

  it.each([
    ["", "8 caracteres"],
    ["Ab1!", "8 caracteres"],
    ["Abcde1!", "8 caracteres"], // 7: um a menos que o mínimo
    ["ABCDEF1!", "minúscula"],
    ["abcdef1!", "maiúscula"],
    ["Abcdefg!", "número"],
    ["Abcdefg1", "símbolo"],
    ["viajamais123", "maiúscula"], // a senha padrão antiga do seed
    ["Çãoçãoç1!", "maiúscula"], // acentuada não conta como letra para o Auth
  ])("recusa %j: %s", (senha, trecho) => {
    expect(problemaDeSenha(senha)).toContain(trecho)
  })

  it("o mínimo é 8", () => {
    expect(TAMANHO_MINIMO_SENHA).toBe(8)
  })
})
