// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * A tela de recuperação de senha, com o cliente do Better Auth simulado. O
 * fluxo de verdade (e-mail, link, token de uso único) é provado em
 * `tests/integracao/recuperar-senha.test.ts`.
 *
 * Regressão do bug P0 (S02-A): `hasToken` era fixo em `true` e a tela nunca lia
 * a URL. Qualquer visita caía direto no formulário de "nova senha", que falha
 * sem token. Sem token na URL, a tela pede o e-mail.
 *
 * @RF01.7 redefinir por e-mail a senha esquecida
 */

const h = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
  resetPassword: vi.fn(),
  push: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("@/lib/auth-cliente", () => ({
  authCliente: { requestPasswordReset: h.requestPasswordReset, resetPassword: h.resetPassword },
}))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }))

import ResetPasswordPage from "@/app/auth/reset-password/page"
import { SENHA_TESTE } from "../fixtures/usuarios"

function abrir(busca = "") {
  window.history.replaceState(null, "", `/auth/reset-password${busca}`)
  render(<ResetPasswordPage />)
}

async function escolherSenha(senha = SENHA_TESTE) {
  const usuario = userEvent.setup()
  await waitFor(() => expect(screen.getByText("Nova senha", { selector: "div" })).toBeInTheDocument())
  for (const campo of document.querySelectorAll('input[type="password"]')) await usuario.type(campo as HTMLElement, senha)
  await usuario.click(screen.getByRole("button", { name: /redefinir senha/i }))
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe("ResetPasswordPage — pedir o link", () => {
  it("sem token na URL, mostra o formulário de pedir e-mail", async () => {
    abrir()
    await waitFor(() => expect(screen.getByText("Esqueceu sua senha?")).toBeInTheDocument())
    expect(screen.queryByText("Nova senha", { selector: "div" })).not.toBeInTheDocument()
  })

  it("pede o link com volta para esta tela e responde igual com e sem conta", async () => {
    h.requestPasswordReset.mockResolvedValue({ data: { status: true }, error: null })
    abrir()
    const usuario = userEvent.setup()
    await usuario.type(await screen.findByLabelText("Email"), "alguem@exemplo.local")
    await usuario.click(screen.getByRole("button", { name: /enviar link/i }))

    await waitFor(() =>
      expect(h.requestPasswordReset).toHaveBeenCalledWith({
        email: "alguem@exemplo.local",
        redirectTo: `${window.location.origin}/auth/reset-password`,
      }),
    )
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ description: expect.stringMatching(/^Se houver uma conta/) }),
    )
  })

  it("link expirado (?error=INVALID_TOKEN) avisa e oferece pedir outro", async () => {
    abrir("?error=INVALID_TOKEN")
    expect(await screen.findByText(/expirou ou já foi usado/)).toBeInTheDocument()
    expect(screen.getByText("Esqueceu sua senha?")).toBeInTheDocument()
  })
})

describe("ResetPasswordPage — escolher a senha nova", () => {
  it("com ?token=, troca a senha com ele, tira o token da URL e manda para o login", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    h.resetPassword.mockResolvedValue({ data: { status: true }, error: null })
    abrir("?token=abc123")

    await escolherSenha()

    await waitFor(() => expect(h.resetPassword).toHaveBeenCalledWith({ newPassword: SENHA_TESTE, token: "abc123" }))
    expect(window.location.search).toBe("")
    vi.advanceTimersByTime(1500)
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/auth/login"))
    vi.useRealTimers()
  })

  it("senha fraca não chega ao servidor", async () => {
    abrir("?token=abc123")
    await escolherSenha("curta")
    expect(h.resetPassword).not.toHaveBeenCalled()
    expect(screen.getByText(/senha/i, { selector: ".text-destructive" })).toBeInTheDocument()
  })

  it("token recusado pelo servidor volta ao pedido de link, com aviso", async () => {
    h.resetPassword.mockResolvedValue({ data: null, error: { status: 400, code: "INVALID_TOKEN", message: "Invalid token" } })
    abrir("?token=usado")

    await escolherSenha()

    expect(await screen.findByText(/expirou ou já foi usado/)).toBeInTheDocument()
    expect(screen.getByText("Esqueceu sua senha?")).toBeInTheDocument()
    expect(screen.queryByText("Invalid token")).not.toBeInTheDocument()
    expect(h.push).not.toHaveBeenCalled()
  })
})
