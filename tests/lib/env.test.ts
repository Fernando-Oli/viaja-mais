import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * `envServidor()` guarda o resultado em cache no módulo, então cada caso
 * reimporta `lib/env.ts` do zero com o ambiente que quer provar.
 *
 * @RNF04 o boot falha com mensagem clara, e só quando a configuração está errada
 */

async function carregar() {
  vi.resetModules()
  return import("@/lib/env")
}

beforeEach(() => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "chave-service-de-teste")
  vi.stubEnv("AI_PROVIDER", "fake")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("envServidor", () => {
  // Regressão: o .env.example traz `GEMINI_API_KEY=` e `ANTHROPIC_API_KEY=`, e a
  // string vazia derrubava a foto de perfil e o convite por e-mail com 500.
  it("chave de IA vazia vale o mesmo que ausente", async () => {
    vi.stubEnv("GEMINI_API_KEY", "")
    vi.stubEnv("ANTHROPIC_API_KEY", "")
    const { envServidor } = await carregar()

    expect(envServidor()).toMatchObject({ GEMINI_API_KEY: undefined, ANTHROPIC_API_KEY: undefined })
  })

  it("AI_PROVIDER vazio cai no padrão fake", async () => {
    vi.stubEnv("AI_PROVIDER", "")
    const { envServidor } = await carregar()

    expect(envServidor().AI_PROVIDER).toBe("fake")
  })

  it("chave preenchida chega como foi escrita", async () => {
    vi.stubEnv("GEMINI_API_KEY", "abc123")
    const { envServidor } = await carregar()

    expect(envServidor().GEMINI_API_KEY).toBe("abc123")
  })

  it("valor inválido continua falhando, com o nome da variável", async () => {
    vi.stubEnv("AI_PROVIDER", "openai")
    const { envServidor } = await carregar()

    expect(() => envServidor()).toThrow(/AI_PROVIDER/)
  })
})

describe("chaveServiceRole", () => {
  it("vazia explica onde pegar a chave, em vez de quebrar a validação inteira", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    const { chaveServiceRole } = await carregar()

    expect(() => chaveServiceRole()).toThrow(/SUPABASE_SERVICE_ROLE_KEY não configurada/)
  })
})
