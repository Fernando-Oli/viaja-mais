import { describe, it, expect } from "vitest"
import { SENHA_TESTE } from "../fixtures/usuarios"
import { apagarConta, cadastrar } from "./apoio"

/**
 * Política de senha aplicada pelo próprio Auth (S10-F, achado F4), e não só pela
 * tela: quem chama o cadastro direto, sem passar pelo formulário, também é
 * recusado. A regra é a de `lib/seguranca/senha.ts`, aplicada pelo gancho de
 * `api/auth/auth.ts` em toda rota do Better Auth que recebe senha nova. Antes
 * ela morava em `supabase/config.toml`.
 *
 * @RNF02.2
 */

const email = (caso: string) => `senha-${caso}-${Date.now()}@viajamais.local`

describe("cadastro direto pelo Auth", () => {
  it.each([
    ["curta", "Ab1!xyz"],
    ["sem-maiuscula", "abcdef1!"],
    ["sem-simbolo", "Abcdefg1"],
    ["antiga-do-seed", "viajamais123"],
  ])("senha %s é recusada como fraca", async (caso, senha) => {
    const { erro, usuario } = await cadastrar(email(caso), senha)
    expect(erro?.status).toBe(400)
    expect(erro?.code).toBe("SENHA_FRACA")
    expect(usuario).toBeUndefined()
  })

  it("senha com 8+ caracteres, minúscula, maiúscula, número e símbolo é aceita", async () => {
    const { erro, usuario } = await cadastrar(email("ok"), SENHA_TESTE)
    expect(erro).toBeUndefined()
    await apagarConta(usuario!.id)
  })
})
