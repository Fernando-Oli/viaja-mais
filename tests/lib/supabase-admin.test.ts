import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Guardas do cliente de service role.
 *
 * Esta chave ignora toda a RLS: quem a tem lê e escreve qualquer linha de
 * qualquer usuário. Por isso o que se testa aqui não é o caminho feliz — é a
 * recusa. As duas formas de vazá-la são construir o cliente no navegador e
 * construí-lo sem perceber que a variável não está configurada.
 *
 * @RNF02.10 a chave de serviço não alcança o navegador
 */

const CHAVE = "chave-de-servico-de-teste"

beforeEach(() => {
  vi.resetModules()
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete process.env.SUPABASE_SERVICE_ROLE_KEY
})

describe("criarClienteAdmin", () => {
  it("recusa ser construído no navegador", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = CHAVE
    // Basta `window` existir para o módulo concluir que está no navegador.
    vi.stubGlobal("window", {})

    const { criarClienteAdmin } = await import("@/lib/supabase/admin")

    expect(() => criarClienteAdmin()).toThrow(/navegador/i)
  })

  it("falha com mensagem clara quando a chave não está configurada", async () => {
    const { criarClienteAdmin } = await import("@/lib/supabase/admin")

    // Sem isto o erro seria um 403 opaco do GoTrue, em tempo de execução e
    // longe da causa — que foi exatamente o modo de falha do bug original.
    expect(() => criarClienteAdmin()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it("no servidor e com a chave, entrega um cliente sem sessão persistida", async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = CHAVE

    const { criarClienteAdmin } = await import("@/lib/supabase/admin")
    const admin = criarClienteAdmin()

    // A API administrativa é a única razão de este cliente existir.
    expect(typeof admin.auth.admin.inviteUserByEmail).toBe("function")
  })
})
