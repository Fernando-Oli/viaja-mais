// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * Regressão do bug P0 (S02-A): ao aceitar um convite o componente chamava só
 * `router.refresh()`, que não recarrega o contexto de autenticação onde vivem as
 * viagens e os convites. A viagem aceita só aparecia depois de um reload manual.
 *
 * Regressões da S07-A: o cartão quebrava quando a viagem chegava `null` (o
 * convidado ainda não enxerga a viagem pela RLS), a data saía um dia antes e o
 * erro do aceite não chegava ao usuário.
 */

const h = vi.hoisted(() => ({
  refreshTrips: vi.fn(() => Promise.resolve()),
  refreshInvitations: vi.fn(() => Promise.resolve()),
  setTripsLoading: vi.fn(),
  routerRefresh: vi.fn(),
  toast: vi.fn(),
}))

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({
    refreshTrips: h.refreshTrips,
    refreshInvitations: h.refreshInvitations,
    setTripsLoading: h.setTripsLoading,
  }),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.routerRefresh }) }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }))

import { TripInvitations } from "@/components/trip-invitations"

const CONVITE = [
  {
    id: "inv-1",
    trip_id: "trip-1",
    status: "pending",
    created_at: "2026-01-01",
    trip: {
      id: "trip-1",
      title: "Paris",
      destination: "França",
      start_date: "2026-01-01",
      end_date: "2026-01-05",
    },
  },
]

function respostaFetch(ok: boolean, corpo: unknown) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(corpo) })))
}

beforeEach(() => {
  vi.clearAllMocks()
  h.refreshTrips.mockResolvedValue(undefined)
  h.refreshInvitations.mockResolvedValue(undefined)
  respostaFetch(true, { success: true })
})

describe("TripInvitations", () => {
  it("recarrega viagens e convites do contexto ao aceitar", async () => {
    render(<TripInvitations invitations={CONVITE} />)

    await userEvent.click(screen.getByRole("button", { name: /aceitar/i }))

    await waitFor(() => expect(h.refreshTrips).toHaveBeenCalled())
    expect(h.refreshInvitations).toHaveBeenCalled()
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Convite aceito" }))
  })

  it("mostra a data digitada, sem voltar um dia pelo fuso", () => {
    render(<TripInvitations invitations={CONVITE} />)

    expect(screen.getByText("01/01/2026 - 05/01/2026")).toBeTruthy()
  })

  it("continua de pé quando a viagem ainda não é visível ao convidado", async () => {
    render(<TripInvitations invitations={[{ ...CONVITE[0], trip: null }]} />)

    expect(screen.getByText("Viagem em grupo")).toBeTruthy()
    expect(screen.getByText(/aparecem depois que você aceitar/)).toBeTruthy()

    await userEvent.click(screen.getByRole("button", { name: /aceitar/i }))
    await waitFor(() => expect(h.refreshTrips).toHaveBeenCalled())
  })

  it("avisa por toast quando o servidor recusa o aceite, sem recarregar nada", async () => {
    respostaFetch(false, { error: "Convite não encontrado" })
    render(<TripInvitations invitations={CONVITE} />)

    await userEvent.click(screen.getByRole("button", { name: /aceitar/i }))

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Convite não encontrado", variant: "destructive" }),
      ),
    )
    expect(h.refreshTrips).not.toHaveBeenCalled()
    expect(h.setTripsLoading).toHaveBeenLastCalledWith(false)
  })

  it("recusa pela rota de decline e só recarrega os convites", async () => {
    render(<TripInvitations invitations={CONVITE} />)

    await userEvent.click(screen.getByRole("button", { name: /recusar/i }))

    await waitFor(() => expect(h.refreshInvitations).toHaveBeenCalled())
    expect(fetch).toHaveBeenCalledWith("/api/invitations/inv-1/decline", { method: "POST" })
    expect(h.refreshTrips).not.toHaveBeenCalled()
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Convite recusado" }))
  })

  it("sem rede, troca o erro do navegador por uma mensagem em português", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))))
    render(<TripInvitations invitations={CONVITE} />)

    await userEvent.click(screen.getByRole("button", { name: /aceitar/i }))

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Não foi possível responder ao convite" }),
      ),
    )
  })
})
