import { describe, it, expect } from "vitest"
import { createClient } from "@supabase/supabase-js"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"

/**
 * Política de senha aplicada pelo próprio Auth (S10-F, achado F4), e não só pela
 * tela: quem chama o GoTrue direto, com a chave anon que está no navegador,
 * também é recusado. A regra está em `supabase/config.toml`
 * (`minimum_password_length = 8`, `password_requirements = "letters_digits"`);
 * em produção, no painel (Authentication → Policies).
 *
 * @RNF02.2
 */

const API = exigirLocal(variavelObrigatoria("API_URL"), "API_URL")
const CHAVE = variavelObrigatoria("ANON_KEY")

function cliente() {
  return createClient(API, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } })
}

const email = (caso: string) => `senha-${caso}-${Date.now()}@viajamais.local`

describe("cadastro direto pelo Auth", () => {
  it.each([
    ["curta", "abc1234"],
    ["sem-numero", "semnumeros"],
    ["sem-letra", "1234567890"],
  ])("senha %s é recusada como fraca", async (caso, senha) => {
    const { data, error } = await cliente().auth.signUp({ email: email(caso), password: senha })
    expect(error?.code).toBe("weak_password")
    expect(data.user).toBeNull()
  })

  it("senha com 8+ caracteres, letra e número é aceita", async () => {
    const { error } = await cliente().auth.signUp({ email: email("ok"), password: "viajamais123" })
    expect(error).toBeNull()
  })
})
