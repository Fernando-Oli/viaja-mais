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

  it("o código do erro sai no cabeçalho e na linha de log — o mesmo nos dois (S09-F)", async () => {
    const espiao = vi.spyOn(console, "error").mockImplementation(() => {})
    const erro = new Error("falha qualquer")

    const resposta = respostaDeErro(erro)

    const codigo = resposta.headers.get("X-Codigo-Erro")
    expect(codigo).toMatch(/^[0-9a-f]{8}$/)
    expect(espiao).toHaveBeenCalledWith(`[erro não tratado] codigo=${codigo}`, erro)
    // O corpo continua genérico: o código não substitui a mensagem.
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    espiao.mockRestore()
  })

  it("cada erro ganha um código diferente", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const a = respostaDeErro(new Error("a")).headers.get("X-Codigo-Erro")
    const b = respostaDeErro(new Error("b")).headers.get("X-Codigo-Erro")
    expect(a).not.toBe(b)
  })

  it("erro conhecido (ErroHttp) não ganha código: não é falha do servidor", () => {
    expect(respostaDeErro(semPermissao("esta viagem")).headers.get("X-Codigo-Erro")).toBeNull()
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
