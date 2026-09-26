// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * Regressão: a tela mandava sempre para `/auth/sign-up-success`, que pede para
 * confirmar o e-mail. Com `enable_confirmations = false` — o padrão do
 * `supabase/config.toml` — o GoTrue já devolve sessão e não envia e-mail
 * nenhum, então a pessoa ficava esperando uma mensagem que nunca chegaria,
 * já logada.
 *
 * O destino tem de sair do que o `signUp` respondeu, não de suposição: assim o
 * mesmo código serve para os dois modos de confirmação.
 *
 * @RF01.1 registro com e-mail e senha
 * @RF01.2 confirmação por e-mail quando estiver habilitada
 */

const h = vi.hoisted(() => ({
  signUp: vi.fn(),
  push: vi.fn(),
}))

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signUp: h.signUp } }),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

import SignUpPage from "@/app/auth/sign-up/page"

/** Preenche o formulário e envia. */
async function cadastrar() {
  const usuario = userEvent.setup()
  render(<SignUpPage />)

  const campos = screen.getAllByRole("textbox")
  const senhas = document.querySelectorAll('input[type="password"]')

  await usuario.type(campos[0], "Fulano de Tal")
  await usuario.type(campos[1], "novo@viajamais.local")
  for (const campo of senhas) await usuario.type(campo as HTMLElement, "viajamais123")

  await usuario.click(screen.getByRole("button", { name: /criar conta/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("SignUpPage", () => {
  it("sem confirmação de e-mail, leva direto ao painel", async () => {
    // O GoTrue devolveu sessão: a conta já está criada e confirmada.
    h.signUp.mockResolvedValue({
      data: { user: { id: "u1" }, session: { access_token: "t" } },
      error: null,
    })

    await cadastrar()

    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/dashboard"))
    expect(h.push).not.toHaveBeenCalledWith("/auth/sign-up-success")
  })

  it("com confirmação de e-mail, manda aguardar a mensagem", async () => {
    // Sem sessão: o e-mail de confirmação é real e precisa ser aberto.
    h.signUp.mockResolvedValue({
      data: { user: { id: "u1" }, session: null },
      error: null,
    })

    await cadastrar()

    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/auth/sign-up-success"))
  })

  it("erro do GoTrue não redireciona e aparece na tela", async () => {
    h.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: new Error("User already registered"),
    })

    await cadastrar()

    await waitFor(() => expect(screen.getByText(/User already registered/i)).toBeInTheDocument())
    expect(h.push).not.toHaveBeenCalled()
  })
})
