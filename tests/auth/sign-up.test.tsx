// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * Regressão: a tela mandava sempre para `/auth/sign-up-success`, que pede para
 * confirmar o e-mail. Sem confirmação (`requireEmailVerification: false` em
 * `api/auth/auth.ts`) a conta já nasce com sessão e nenhum e-mail sai, então a
 * pessoa ficava esperando uma mensagem que nunca chegaria, já logada.
 *
 * O destino tem de sair do que o cadastro respondeu, não de suposição: assim o
 * mesmo código serve para os dois modos de confirmação.
 *
 * O cliente do Better Auth é simulado; o cadastro de verdade é provado nos
 * testes de integração (`tests/integracao/foto.test.ts` e outros criam a conta
 * por ele).
 *
 * @RF01.1 registro com e-mail e senha
 * @RF01.2 confirmação por e-mail quando estiver habilitada
 */

const h = vi.hoisted(() => ({
  signUp: vi.fn(),
  push: vi.fn(),
  busca: new URLSearchParams(),
}))

vi.mock("@/lib/auth-cliente", () => ({ authCliente: { signUp: { email: h.signUp } } }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, refresh: vi.fn() }),
  useSearchParams: () => h.busca,
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

import SignUpPage from "@/app/auth/sign-up/page"
import { SENHA_TESTE } from "../fixtures/usuarios"

/** Preenche o formulário e envia. */
async function cadastrar() {
  const usuario = userEvent.setup()
  render(<SignUpPage />)

  const campos = screen.getAllByRole("textbox")
  const senhas = document.querySelectorAll('input[type="password"]')

  await usuario.type(campos[0], "Fulano de Tal")
  await usuario.type(campos[1], "novo@viajamais.local")
  for (const campo of senhas) await usuario.type(campo as HTMLElement, SENHA_TESTE)

  await usuario.click(screen.getByRole("button", { name: /criar conta/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
  h.busca = new URLSearchParams()
})

describe("SignUpPage", () => {
  // @RF01.1 o perfil guarda até 120 caracteres; a tela mostra o teto em vez de cortar calada.
  it("o nome completo para em 120 caracteres", async () => {
    const usuario = userEvent.setup()
    render(<SignUpPage />)
    const nome = screen.getAllByRole("textbox")[0] as HTMLInputElement

    await usuario.type(nome, "N".repeat(130))

    expect(nome.value).toHaveLength(120)
  })

  it("envia nome, e-mail e senha ao Better Auth e, com sessão, leva direto ao painel", async () => {
    h.signUp.mockResolvedValue({ data: { token: "t", user: { id: "u1" } }, error: null })

    await cadastrar()

    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/dashboard"))
    expect(h.signUp).toHaveBeenCalledWith({
      name: "Fulano de Tal",
      email: "novo@viajamais.local",
      password: SENHA_TESTE,
    })
    expect(h.push).not.toHaveBeenCalledWith("/auth/sign-up-success")
  })

  it("com confirmação de e-mail (sem sessão), manda aguardar a mensagem", async () => {
    h.signUp.mockResolvedValue({ data: { token: null, user: { id: "u1" } }, error: null })

    await cadastrar()

    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/auth/sign-up-success"))
  })

  it.each([
    [{ status: 422, code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", message: "User already exists" }, /Já existe uma conta com este e-mail/],
    [{ status: 400, code: "SENHA_FRACA", message: "A senha precisa de um símbolo" }, /A senha precisa de um símbolo/],
    [{ status: 429 }, /Muitas tentativas/],
    [{ status: 500, code: "FAILED_TO_CREATE_USER", message: "Failed to create user" }, /Não foi possível criar a conta/],
  ])("erro %o não redireciona e aparece em português", async (erro, texto) => {
    h.signUp.mockResolvedValue({ data: null, error: erro })

    await cadastrar()

    await waitFor(() => expect(screen.getByText(texto)).toBeInTheDocument())
    expect(screen.queryByText(/User already exists|Failed to create/)).not.toBeInTheDocument()
    expect(h.push).not.toHaveBeenCalled()
  })

  // @RF04.2 o link do e-mail de convite traz o endereço convidado.
  it("o e-mail do convite (?email=) chega preenchido", () => {
    h.busca = new URLSearchParams({ email: "convidado@exemplo.local" })
    render(<SignUpPage />)
    expect((screen.getAllByRole("textbox")[1] as HTMLInputElement).value).toBe("convidado@exemplo.local")
  })
})
