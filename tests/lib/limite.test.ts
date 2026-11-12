import { describe, it, expect, vi, afterEach } from "vitest"
import { exigirLimite, limiteExcedido, LIMITES, type RegraLimite } from "@/lib/seguranca/limite"
import { ErroHttp, respostaDeErro } from "@/lib/http"

/**
 * `exigirLimite()`: o que a rota faz com a resposta de `consumir_limite()`.
 *
 * O que ISTO prova: 429 com `Retry-After` quando o banco diz não, nada quando
 * diz sim, e fail-open quando a contagem falha. O que NÃO prova: que o banco
 * conta certo e que ninguém zera o próprio contador — isso é
 * `tests/rls/12-rate-limit.test.ts`, contra Postgres real.
 *
 * @RNF02.8
 */

type RespostaRpc = { data: unknown; error: { message: string } | null }

function supabaseFalso(resposta: RespostaRpc | (() => never), chamadas: unknown[][] = []) {
  return {
    rpc: async (...args: unknown[]) => {
      chamadas.push(args)
      if (typeof resposta === "function") return resposta()
      return resposta
    },
  } as never
}

const REGRA: RegraLimite = { chave: "teste", maximo: 3, janelaSegundos: 60 }

afterEach(() => vi.restoreAllMocks())

describe("exigirLimite", () => {
  it("passa quando o banco permite", async () => {
    await expect(
      exigirLimite(supabaseFalso({ data: [{ permitido: true, retry_after: 0 }], error: null }), REGRA),
    ).resolves.toBeUndefined()
  })

  it("lança 429 com Retry-After quando o banco recusa", async () => {
    const promessa = exigirLimite(supabaseFalso({ data: [{ permitido: false, retry_after: 42 }], error: null }), REGRA)
    await expect(promessa).rejects.toBeInstanceOf(ErroHttp)
    await promessa.catch((erro: ErroHttp) => {
      expect(erro.status).toBe(429)
      expect(erro.headers).toEqual({ "Retry-After": "42" })
    })
  })

  it("repassa a regra inteira para a função do banco", async () => {
    const chamadas: unknown[][] = []
    await exigirLimite(supabaseFalso({ data: [{ permitido: true, retry_after: 0 }], error: null }, chamadas), REGRA)
    expect(chamadas).toEqual([["consumir_limite", { p_chave: "teste", p_maximo: 3, p_janela_segundos: 60 }]])
  })

  it("fail-open: erro do PostgREST libera a requisição e vai para o log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(exigirLimite(supabaseFalso({ data: null, error: { message: "função ausente" } }), REGRA)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith(expect.stringContaining('"teste"'), "função ausente")
  })

  it("fail-open: exceção de rede libera a requisição", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    const explodir = () => {
      throw new Error("ECONNREFUSED")
    }
    await expect(exigirLimite(supabaseFalso(explodir), REGRA)).resolves.toBeUndefined()
    expect(log).toHaveBeenCalledWith(expect.any(String), "ECONNREFUSED")
  })

  it("fail-open: resposta vazia libera a requisição", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(exigirLimite(supabaseFalso({ data: [], error: null }), REGRA)).resolves.toBeUndefined()
  })
})

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
