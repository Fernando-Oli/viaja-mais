import { describe, it, expect } from "vitest"
import { limiteExcedido, LIMITES } from "@/lib/seguranca/limite"
import { ErroHttp, respostaDeErro } from "@/lib/http"

/**
 * As regras de limite e o 429 que sai delas.
 *
 * O que ISTO prova: as chaves cabem no formato do banco e o 429 sai com
 * `Retry-After`. O que NÃO prova: a contagem e o fail-open, que estão em
 * `tests/integracao/limite.test.ts`, nem que ninguém zera o próprio contador,
 * que é `tests/rls/12-rate-limit.test.ts` — os dois contra Postgres real.
 *
 * @RNF02.8
 */

describe("LIMITES", () => {
  it("toda chave cabe no formato aceito pelo banco", () => {
    for (const regra of Object.values(LIMITES)) {
      expect(regra.chave).toMatch(/^[a-z0-9-]{1,64}$/)
      expect(regra.maximo).toBeGreaterThanOrEqual(1)
      expect(regra.maximo).toBeLessThanOrEqual(1000)
      expect(regra.janelaSegundos).toBeGreaterThanOrEqual(1)
      expect(regra.janelaSegundos).toBeLessThanOrEqual(86400)
    }
  })

  it("convite comporta uma viagem de 8 pessoas numa rodada", () => {
    expect(LIMITES.convite.maximo).toBeGreaterThanOrEqual(8)
  })
})

describe("respostaDeErro com cabeçalhos", () => {
  it("o 429 sai com Retry-After", async () => {
    const resposta = respostaDeErro(limiteExcedido(30))
    expect(resposta.status).toBe(429)
    expect(resposta.headers.get("Retry-After")).toBe("30")
    expect(await resposta.json()).toEqual({ error: expect.stringContaining("Muitas tentativas") })
  })

  it("ErroHttp sem cabeçalhos continua igual", () => {
    const resposta = respostaDeErro(new ErroHttp(403, "nao"))
    expect(resposta.status).toBe(403)
    expect(resposta.headers.get("Retry-After")).toBeNull()
  })
})
