// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"

/**
 * Regressão do bug P0 (S02-A): `hasToken` era fixo em `true` e o `useEffect`
 * nunca lia a URL. Qualquer visita a /auth/reset-password caía direto no
 * formulário de "nova senha" — que falha, porque não há sessão de recuperação.
 * Sem token na URL a tela deve pedir o e-mail de recuperação.
 *
 * @RF01.7 redefinir por e-mail a senha esquecida
 */

const h = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
  resetPasswordForEmail: vi.fn(() => Promise.resolve({ error: null })),
}))

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      onAuthStateChange: h.onAuthStateChange,
      getSession: h.getSession,
      resetPasswordForEmail: h.resetPasswordForEmail,
    },
  }),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }))

import ResetPasswordPage from "@/app/auth/reset-password/page"

beforeEach(() => {
  vi.clearAllMocks()
  h.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
  h.getSession.mockResolvedValue({ data: { session: null } })
})

describe("ResetPasswordPage", () => {
  it("sem token de recuperação na URL, mostra o formulário de pedir e-mail", async () => {
    render(<ResetPasswordPage />)

    await waitFor(() => expect(screen.getByText("Esqueceu sua senha?")).toBeInTheDocument())
    expect(screen.queryByText("Nova senha")).not.toBeInTheDocument()
  })

  it("pede o e-mail de recuperação com link de volta para esta tela", async () => {
    render(<ResetPasswordPage />)
    await waitFor(() => expect(screen.getByText("Esqueceu sua senha?")).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "teste.a@viajamais.local" } })
    fireEvent.click(screen.getByRole("button", { name: /enviar link de recuperação/i }))

    await waitFor(() =>
      expect(h.resetPasswordForEmail).toHaveBeenCalledWith("teste.a@viajamais.local", {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      }),
    )
  })
})
