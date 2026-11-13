import { describe, it, expect, vi, beforeEach } from "vitest"
import { limiteExcedido, LIMITES } from "@/lib/seguranca/limite"

/**
 * Troca de senha. A rota confere a senha atual com `signInWithPassword`, o que
 * faz dela um oráculo para quem tem uma sessão roubada — daí o limite.
 *
 * Não há caminho 403: a rota só age sobre a conta de quem está na sessão.
 *
 * O que ISTO prova: 200, 401, 400, e que com o limite estourado a senha atual
 * nem chega a ser conferida. O limite real (contagem no banco) é
 * tests/lib/limite.test.ts e tests/rls/12-rate-limit.test.ts.
 *
 * @RNF02.8
 */

const limite = vi.hoisted(() => ({ exigir: vi.fn() }))
vi.mock("@/lib/seguranca/limite", async (original) => ({
  ...(await original<typeof import("@/lib/seguranca/limite")>()),
  exigirLimite: limite.exigir,
}))

const h = vi.hoisted(() => ({
  usuario: { id: "u1", email: "teste.a@viajamais.local" } as { id: string; email: string } | null,
  erroLogin: null as { message: string } | null,
  conferencias: [] as { email: string; password: string }[],
  trocas: [] as { password: string }[],
  erroTroca: null as { message: string; code?: string } | null,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: h.usuario }, error: null }),
      signInWithPassword: async (credenciais: { email: string; password: string }) => {
        h.conferencias.push(credenciais)
        return { error: h.erroLogin }
      },
      updateUser: async (dados: { password: string }) => {
        h.trocas.push(dados)
        return { error: h.erroTroca }
      },
    },
  }),
}))

import { POST } from "@/app/api/auth/change-password/route"
import { SENHA_TESTE } from "../fixtures/usuarios"

function pedido(campos: Record<string, string>) {
  const formulario = new FormData()
  for (const [nome, valor] of Object.entries(campos)) formulario.set(nome, valor)
  return POST(new Request("http://localhost/api/auth/change-password", { method: "POST", body: formulario }))
}

const VALIDO = { current_password: SENHA_TESTE, new_password: "Nova-senha-1", confirm_password: "Nova-senha-1" }

beforeEach(() => {
  h.usuario = { id: "u1", email: "teste.a@viajamais.local" }
  h.erroLogin = null
  h.conferencias.length = 0
  h.trocas.length = 0
  h.erroTroca = null
  limite.exigir.mockReset()
  limite.exigir.mockResolvedValue(undefined)
})

describe("POST /api/auth/change-password", () => {
  it("200: confere a senha atual e troca", async () => {
    const resposta = await pedido(VALIDO)

    expect(resposta.status).toBe(200)
    expect(h.conferencias).toEqual([{ email: "teste.a@viajamais.local", password: SENHA_TESTE }])
    expect(h.trocas).toEqual([{ password: "Nova-senha-1" }])
    expect(limite.exigir).toHaveBeenCalledWith(expect.anything(), LIMITES.trocarSenha)
  })

  it("401: sem sessão, nada é conferido", async () => {
    h.usuario = null

    const resposta = await pedido(VALIDO)

    expect(resposta.status).toBe(401)
    expect(h.conferencias).toEqual([])
    expect(limite.exigir).not.toHaveBeenCalled()
  })

  it("400: confirmação diferente não gasta tentativa", async () => {
    const resposta = await pedido({ ...VALIDO, confirm_password: "outra" })

    expect(resposta.status).toBe(400)
    expect(limite.exigir).not.toHaveBeenCalled()
    expect(h.conferencias).toEqual([])
  })

  it.each([["Curta1!"], ["semmaiuscula1!"], ["SemSimbolo123"]])("400: senha nova fraca (%s) não chega ao Auth (F4)", async (fraca) => {
    const resposta = await pedido({ ...VALIDO, new_password: fraca, confirm_password: fraca })

    expect(resposta.status).toBe(400)
    expect(h.conferencias).toEqual([])
    expect(h.trocas).toEqual([])
  })

  it("400: o erro do Auth não volta em inglês para a tela (RNF02.11)", async () => {
    h.erroTroca = { message: "New password should be different from the old password.", code: "same_password" }

    const resposta = await pedido(VALIDO)

    expect(resposta.status).toBe(400)
    expect(await resposta.json()).toEqual({ error: "A nova senha precisa ser diferente da atual" })
  })

  it("400: campo faltando", async () => {
    const resposta = await pedido({ current_password: "x" })

    expect(resposta.status).toBe(400)
    expect(h.trocas).toEqual([])
  })

  it("400: senha atual errada não troca", async () => {
    h.erroLogin = { message: "Invalid login credentials" }

    const resposta = await pedido(VALIDO)

    expect(resposta.status).toBe(400)
    expect(await resposta.json()).toEqual({ error: "Senha atual incorreta" })
    expect(h.trocas).toEqual([])
  })

  it("429: com o limite estourado, a senha atual nem chega a ser conferida", async () => {
    limite.exigir.mockRejectedValueOnce(limiteExcedido(600))

    const resposta = await pedido(VALIDO)

    expect(resposta.status).toBe(429)
    expect(resposta.headers.get("Retry-After")).toBe("600")
    expect(h.conferencias).toEqual([])
    expect(h.trocas).toEqual([])
  })
})
