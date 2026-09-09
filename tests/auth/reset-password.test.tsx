// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"

/**
 * Regressão do bug P0 (S02-A): `hasToken` era fixo em `true` e o `useEffect`
 * nunca lia a URL. Qualquer visita a /auth/reset-password caía direto no
 * formulário de "nova senha" — que falha, porque não há sessão de recuperação.
 * Sem token na URL a tela deve pedir o e-mail de recuperação.
 */

const h = vi.hoisted(() => ({
  onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
  getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
}))

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { onAuthStateChange: h.onAuthStateChange, getSession: h.getSession },
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
})
