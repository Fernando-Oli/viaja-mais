import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ErroHttp } from "@/lib/http"

/**
 * `escolherGerador()` lê `AI_PROVIDER` de `lib/env.ts`, que guarda cache no
 * módulo: cada caso reimporta do zero com o ambiente que quer provar.
 *
 * @RF12.1
 */

async function escolher() {
  vi.resetModules()
  const { escolherGerador } = await import("@/lib/ai/provider")
  return escolherGerador()
}

function esperar503(fn: () => Promise<unknown>) {
  return fn().then(
    () => {
      throw new Error("deveria ter lançado 503")
    },
    (erro) => {
      // `vi.resetModules()` recarrega lib/http.ts: o `ErroHttp` do módulo é outra
      // classe, então `instanceof` não serve aqui. Confere-se a forma.
      expect((erro as ErroHttp).name).toBe("ErroHttp")
      expect((erro as ErroHttp).status).toBe(503)
      expect((erro as ErroHttp).message).not.toMatch(/AI_PROVIDER|API_KEY|anthropic|gemini/i)
    },
  )
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("escolherGerador", () => {
  it("padrão é o fake", async () => {
    vi.stubEnv("AI_PROVIDER", "")

    expect((await escolher()).nome).toBe("fake")
  })

  it("gemini com chave devolve o gerador real", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini")
    vi.stubEnv("GEMINI_API_KEY", "chave")

    expect((await escolher()).nome).toBe("gemini")
  })

  it("503: gemini sem chave, e a mensagem não fala de configuração", async () => {
    vi.stubEnv("AI_PROVIDER", "gemini")
    vi.stubEnv("GEMINI_API_KEY", "")

    await esperar503(escolher)
  })

  it("503: anthropic ainda não tem implementação", async () => {
    vi.stubEnv("AI_PROVIDER", "anthropic")
    vi.stubEnv("ANTHROPIC_API_KEY", "chave")

    await esperar503(escolher)
  })
})
