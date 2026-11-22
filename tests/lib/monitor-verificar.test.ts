import { describe, it, expect, vi } from "vitest"
import { avaliar, consultar, verificar } from "../../scripts/monitor/verificar.mjs"

/**
 * O monitor de disponibilidade decide "no ar" ou "fora do ar" a partir de duas
 * consultas. Uma falha só vale depois da segunda tentativa, para que um soluço
 * de rede do executor não vire queda registrada.
 *
 * @RNF04.1 disponibilidade monitorada
 */

type Consulta = { url: string; status: number; ms: number; corpo: unknown; erro: string | null }
const ok = (caminho: string, extra: Partial<Consulta> = {}): Consulta => ({
  url: `https://viaja-mais.online${caminho}`,
  status: 200,
  ms: 300,
  corpo: caminho === "/api/saude" ? { status: "ok", banco: "ok" } : null,
  erro: null,
  ...extra,
})

describe("avaliar", () => {
  it("no ar quando as duas respondem 200 e o banco está ok", () => {
    expect(avaliar(ok("/"), ok("/api/saude"))).toEqual({ noAr: true, problemas: [], avisos: [] })
  })

  it("fora do ar quando a página inicial falha", () => {
    const r = avaliar(ok("/", { status: 500 }), ok("/api/saude"))
    expect(r.noAr).toBe(false)
    expect(r.problemas).toEqual(["página inicial: HTTP 500"])
  })

  it("fora do ar quando o banco não responde, mesmo com a página no ar", () => {
    const r = avaliar(ok("/"), ok("/api/saude", { status: 503, corpo: { banco: "falha" } }))
    expect(r.noAr).toBe(false)
    expect(r.problemas).toEqual(["/api/saude: HTTP 503"])
  })

  it("fora do ar quando /api/saude responde 200 sem dizer que o banco está ok", () => {
    // Ex.: uma página de erro da hospedagem servida com 200.
    const r = avaliar(ok("/"), ok("/api/saude", { corpo: null }))
    expect(r.noAr).toBe(false)
  })

  it("descreve o erro de rede no lugar do código HTTP", () => {
    const r = avaliar(ok("/", { status: 0, erro: "sem resposta em 10 s" }), ok("/api/saude"))
    expect(r.problemas).toEqual(["página inicial: sem resposta em 10 s"])
  })

  it("resposta lenta é aviso, não queda", () => {
    const r = avaliar(ok("/", { ms: 7_000 }), ok("/api/saude"))
    expect(r.noAr).toBe(true)
    expect(r.avisos).toEqual(["/ levou 7000 ms"])
  })
})

/** fetch falso que responde por caminho, consumindo uma fila de respostas. */
function fetchFalso(filas: Record<string, (number | "rede")[]>) {
  return vi.fn(async (url: string) => {
    const caminho = new URL(url).pathname
    const proxima = filas[caminho].shift()
    if (proxima === "rede") throw new TypeError("fetch failed")
    const json = caminho === "/api/saude"
    return new Response(json ? JSON.stringify({ banco: proxima === 200 ? "ok" : "falha" }) : "<html>", {
      status: proxima,
      headers: { "content-type": json ? "application/json" : "text/html" },
    })
  })
}

describe("verificar", () => {
  const semEspera = { esperar: async () => {} }

  it("no ar na primeira tentativa não tenta de novo", async () => {
    const f = fetchFalso({ "/": [200], "/api/saude": [200] })
    const r = await verificar("https://viaja-mais.online/", { fetchImpl: f as unknown as typeof fetch, ...semEspera })
    expect(r).toMatchObject({ noAr: true, tentativas: 1 })
    expect(f).toHaveBeenCalledTimes(2)
  })

  it("uma falha isolada que se recupera na segunda tentativa conta como no ar", async () => {
    const esperar = vi.fn(async () => {})
    const f = fetchFalso({ "/": ["rede", 200], "/api/saude": [200, 200] })
    const r = await verificar("https://viaja-mais.online", { fetchImpl: f as unknown as typeof fetch, esperar, esperaMs: 20_000 })
    expect(r).toMatchObject({ noAr: true, tentativas: 2 })
    expect(esperar).toHaveBeenCalledWith(20_000)
  })

  it("falha nas duas tentativas conta como fora do ar", async () => {
    const f = fetchFalso({ "/": [200, 200], "/api/saude": [503, 503] })
    const r = await verificar("https://viaja-mais.online", { fetchImpl: f as unknown as typeof fetch, ...semEspera })
    expect(r).toMatchObject({ noAr: false, tentativas: 2 })
    expect(r.problemas).toEqual(["/api/saude: HTTP 503"])
  })
})

describe("consultar", () => {
  it("transforma tempo esgotado em resultado, sem lançar", async () => {
    const f = vi.fn(async () => {
      throw Object.assign(new Error("timeout"), { name: "TimeoutError" })
    })
    const r = await consultar("https://viaja-mais.online/", { fetchImpl: f as unknown as typeof fetch, tempoLimiteMs: 10_000 })
    expect(r).toMatchObject({ status: 0, erro: "sem resposta em 10 s" })
  })
})
