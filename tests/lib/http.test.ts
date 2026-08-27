import { describe, it, expect, vi, afterEach } from "vitest"
import { ErroHttp, respostaDeErro, respostaInvalida, semPermissao } from "@/lib/http"

afterEach(() => vi.restoreAllMocks())

describe("respostaDeErro", () => {
  it("preserva o status de um ErroHttp", async () => {
    const resposta = respostaDeErro(semPermissao("esta viagem"))
    expect(resposta.status).toBe(403)
    await expect(resposta.json()).resolves.toEqual({ error: "Sem permissão para acessar esta viagem" })
  })

  it("converte erro desconhecido em 500 sem vazar a mensagem original", async () => {
    // A mensagem crua do Postgres cita nome de coluna, constraint e às vezes o
    // valor que causou o conflito — inclusive dado de outro usuário.
    vi.spyOn(console, "error").mockImplementation(() => {})
    const resposta = respostaDeErro(new Error('duplicate key value violates unique constraint "profiles_email_key"'))
    expect(resposta.status).toBe(500)
    const corpo = await resposta.json()
    expect(corpo.error).toBe("Erro interno do servidor")
    expect(JSON.stringify(corpo)).not.toContain("profiles_email_key")
  })

  it("registra no console o erro não tratado, para não perder o rastro", () => {
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {})
    respostaDeErro(new Error("falha qualquer"))
    expect(espiao).toHaveBeenCalled()
  })
})

describe("respostaInvalida", () => {
  it("devolve 400 com os detalhes de validação", async () => {
    const resposta = respostaInvalida({ fieldErrors: { title: ["obrigatório"] } })
    expect(resposta.status).toBe(400)
    await expect(resposta.json()).resolves.toMatchObject({ error: "Dados inválidos" })
  })
})

describe("ErroHttp", () => {
  it("é instância de Error, para não quebrar catch genérico", () => {
    expect(new ErroHttp(418, "bule")).toBeInstanceOf(Error)
  })
})
