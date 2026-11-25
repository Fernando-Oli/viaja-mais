import { describe, it, expect, vi, beforeEach } from "vitest"
import { limiteExcedido, LIMITES } from "@/lib/seguranca/limite"
import { tempoEsgotado, roteiroInvalido, provedorIndisponivel, TEMPO_MAXIMO_MS } from "@/lib/ai/erros"
import { roteiroFake } from "@/lib/ai/fake"
import { DIAS_MAXIMOS, type GerarRoteiro } from "@/lib/schemas/roteiro"

/**
 * `POST /api/roteiros/gerar`.
 *
 * Não há caminho 403: o roteiro nasce antes de a viagem existir, então não há
 * viagem para autorizar (plano S10-M-ia-adapter). O que ISTO prova: 200, 401,
 * 400 (sem gastar tentativa), 429 (sem chamar o provedor), e que os erros do
 * provedor chegam com o status certo — 502, 503 e 504. Nada é gravado: a rota
 * nem tem um cliente com `.from()`.
 *
 * @RF12.1 · @RNF07.3 · @RNF07.4
 */

const limite = vi.hoisted(() => ({ exigir: vi.fn() }))
vi.mock("@/lib/seguranca/limite", async (original) => ({
  ...(await original<typeof import("@/lib/seguranca/limite")>()),
  exigirLimite: limite.exigir,
}))

const ia = vi.hoisted(() => ({ gerar: vi.fn(), escolher: vi.fn() }))
vi.mock("@/lib/ai/provider", () => ({ escolherGerador: ia.escolher }))

const h = vi.hoisted(() => ({ usuario: { id: "u1" } as { id: string } | null, ordem: [] as string[] }))
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => {
        h.ordem.push("sessão")
        return { data: { user: h.usuario }, error: null }
      },
    },
  }),
}))

import { POST } from "@/app/api/roteiros/gerar/route"

const VALIDO: GerarRoteiro = {
  destino: "Lisboa",
  dias: 3,
  quem: "Em casal",
  ritmo: "equilibrado",
  orcamento: "moderado",
  interesses: ["Comida"],
}

function pedido(corpo: unknown) {
  return POST(
    new Request("http://localhost/api/roteiros/gerar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    }),
  )
}

beforeEach(() => {
  h.usuario = { id: "u1" }
  limite.exigir.mockReset()
  limite.exigir.mockResolvedValue(undefined)
  ia.gerar.mockReset()
  ia.gerar.mockImplementation(async (p: GerarRoteiro) => roteiroFake(p))
  ia.escolher.mockReset()
  ia.escolher.mockReturnValue({ nome: "fake", gerar: ia.gerar })
})

describe("POST /api/roteiros/gerar", () => {
  // Regressão (revisão de 20/11): o relógio de 15 s só começava depois da sessão e
  // do limite, e o 504 saía em 15 s + a latência dos dois (RNF07.3).
  it("o prazo de 15 s começa antes da sessão e do limite", async () => {
    h.ordem.length = 0
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      h.ordem.push(`prazo ${ms}`)
      return new AbortController().signal
    })
    limite.exigir.mockImplementation(async () => {
      h.ordem.push("limite")
    })

    await pedido(VALIDO)

    expect(h.ordem.slice(0, 3)).toEqual([`prazo ${TEMPO_MAXIMO_MS}`, "sessão", "limite"])
    timeout.mockRestore()
  })

  it("200: gera o roteiro, consome o limite da IA e não deixa a resposta em cache", async () => {
    const resposta = await pedido(VALIDO)
    const corpo = await resposta.json()

    expect(resposta.status).toBe(200)
    expect(corpo.roteiro.dias).toHaveLength(3)
    expect(resposta.headers.get("Cache-Control")).toBe("private, no-store")
    expect(limite.exigir).toHaveBeenCalledWith(expect.anything(), LIMITES.roteiroIa)
  })

  it("200: o gerador recebe só os campos do schema, já normalizados, e um sinal de tempo", async () => {
    await pedido({ ...VALIDO, destino: "  Lisboa  ", dias: "3" })

    const [recebido, opcoes] = ia.gerar.mock.calls[0]
    expect(recebido).toEqual(VALIDO)
    expect(opcoes.sinal).toBeInstanceOf(AbortSignal)
    expect(TEMPO_MAXIMO_MS).toBe(15_000)
  })

  it("200: o teto de dias é aceito (decisão de 20/11: até 5 dias)", async () => {
    expect(DIAS_MAXIMOS).toBe(5)

    const resposta = await pedido({ ...VALIDO, dias: DIAS_MAXIMOS })

    expect(resposta.status).toBe(200)
    expect((await resposta.json()).roteiro.dias).toHaveLength(DIAS_MAXIMOS)
  })

  it("200: sem interesses vale lista vazia", async () => {
    const { interesses: _fora, ...semInteresses } = VALIDO

    expect((await pedido(semInteresses)).status).toBe(200)
    expect(ia.gerar.mock.calls[0][0].interesses).toEqual([])
  })

  it("401: sem sessão, nada é gerado nem contado", async () => {
    h.usuario = null

    const resposta = await pedido(VALIDO)

    expect(resposta.status).toBe(401)
    expect(limite.exigir).not.toHaveBeenCalled()
    expect(ia.gerar).not.toHaveBeenCalled()
  })

  it.each([
    ["dias zero", { ...VALIDO, dias: 0 }],
    ["dias acima do teto (5)", { ...VALIDO, dias: DIAS_MAXIMOS + 1 }],
    ["dias fracionado", { ...VALIDO, dias: 2.5 }],
    ["destino vazio", { ...VALIDO, destino: " " }],
    ["destino longo", { ...VALIDO, destino: "x".repeat(161) }],
    ["ritmo fora da lista", { ...VALIDO, ritmo: "frenético" }],
    ["orçamento fora da lista", { ...VALIDO, orcamento: "ilimitado" }],
    ["interesses demais", { ...VALIDO, interesses: Array.from({ length: 9 }, (_, i) => `i${i}`) }],
    ["interesse longo", { ...VALIDO, interesses: ["x".repeat(41)] }],
    ["chave extra (mass-assignment)", { ...VALIDO, user_id: "outra-pessoa" }],
    ["corpo vazio", {}],
    ["JSON quebrado", "{destino:"],
  ])("400: %s — não gasta tentativa nem chama o provedor", async (_caso, corpo) => {
    const resposta = await pedido(corpo)

    expect(resposta.status).toBe(400)
    expect((await resposta.json()).error).toBe("Dados inválidos")
    expect(limite.exigir).not.toHaveBeenCalled()
    expect(ia.gerar).not.toHaveBeenCalled()
  })

  it("429: com o limite estourado, o provedor nem é chamado", async () => {
    limite.exigir.mockRejectedValueOnce(limiteExcedido(1800))

    const resposta = await pedido(VALIDO)

    expect(resposta.status).toBe(429)
    expect(resposta.headers.get("Retry-After")).toBe("1800")
    expect(ia.escolher).not.toHaveBeenCalled()
    expect(ia.gerar).not.toHaveBeenCalled()
  })

  it.each([
    ["502: saída do modelo inválida", roteiroInvalido, 502],
    ["503: provedor indisponível", provedorIndisponivel, 503],
    ["504: tempo esgotado (RNF07.3)", tempoEsgotado, 504],
  ])("%s, com mensagem em português", async (_caso, erro, codigo) => {
    ia.gerar.mockRejectedValueOnce(erro())

    const resposta = await pedido(VALIDO)

    expect(resposta.status).toBe(codigo)
    expect((await resposta.json()).error).toBe(erro().message)
  })

  it("503: provedor não configurado é decidido antes de gerar", async () => {
    ia.escolher.mockImplementationOnce(() => {
      throw provedorIndisponivel()
    })

    expect((await pedido(VALIDO)).status).toBe(503)
    expect(ia.gerar).not.toHaveBeenCalled()
  })

  it("500 genérico para erro inesperado, sem a mensagem interna", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    ia.gerar.mockRejectedValueOnce(new Error("segredo interno"))

    const resposta = await pedido(VALIDO)

    expect(resposta.status).toBe(500)
    expect(JSON.stringify(await resposta.json())).not.toContain("segredo")
  })
})
