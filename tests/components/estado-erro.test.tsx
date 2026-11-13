// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, cleanup } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { EstadoErro } from "@/components/estado-erro"
import { EstadoNaoEncontrado } from "@/components/estado-nao-encontrado"

/**
 * As telas de erro e de "não encontrado" (S07-F).
 *
 * O caminho até elas (o Next montando o error boundary e o not-found de cada
 * segmento) é provado no E2E `e2e/estados-erro.spec.ts`. Aqui fica o que o
 * E2E não alcança: um erro de verdade no meio da renderização.
 *
 * @RNF04.4 · @RNF02.11
 */

const ERRO_DO_BANCO = Object.assign(new Error('duplicate key value violates unique constraint "trips_pkey"'), {
  digest: "4127891234",
})

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("EstadoErro", () => {
  it("explica o que fazer, e nunca mostra a mensagem interna do erro", () => {
    render(<EstadoErro error={ERRO_DO_BANCO} retry={() => {}} />)

    expect(screen.getByRole("alert")).toHaveTextContent("Algo deu errado ao carregar esta página")
    expect(document.body.textContent).not.toContain("trips_pkey")
    expect(document.body.textContent).not.toContain("duplicate key")
  })

  it("mostra o código do erro, que casa com o log do servidor", () => {
    render(<EstadoErro error={ERRO_DO_BANCO} retry={() => {}} />)

    expect(screen.getByText("4127891234")).toBeInTheDocument()
  })

  it("sem código, não promete um", () => {
    render(<EstadoErro error={new Error("x")} retry={() => {}} />)

    expect(screen.queryByText(/Código do erro/)).toBeNull()
    expect(document.body.textContent).not.toContain("informando o código")
  })

  it("'Tentar de novo' chama o retry do Next", async () => {
    const retry = vi.fn()
    render(<EstadoErro error={ERRO_DO_BANCO} retry={retry} />)

    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }))

    expect(retry).toHaveBeenCalledTimes(1)
  })

  it("'Voltar ao início' leva para o destino do segmento", () => {
    render(<EstadoErro error={ERRO_DO_BANCO} retry={() => {}} voltarPara="/feed" />)

    expect(screen.getByRole("link", { name: "Voltar ao início" })).toHaveAttribute("href", "/feed")
  })

  it("registra o erro no console, com o código", () => {
    render(<EstadoErro error={ERRO_DO_BANCO} retry={() => {}} />)

    expect(console.error).toHaveBeenCalledWith("[erro na tela]", "4127891234", ERRO_DO_BANCO)
  })
})

describe("EstadoNaoEncontrado", () => {
  it("a mesma frase para 'não existe' e 'sem acesso', com o caminho de volta", () => {
    render(<EstadoNaoEncontrado voltarPara="/dashboard/trips" rotuloVoltar="Ver minhas viagens" />)

    expect(screen.getByText("Página não encontrada")).toBeInTheDocument()
    expect(screen.getByText(/não existe, ou você não tem acesso/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Ver minhas viagens" })).toHaveAttribute("href", "/dashboard/trips")
  })
})
