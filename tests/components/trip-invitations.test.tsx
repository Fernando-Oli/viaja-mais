// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * Regressão do bug P0 (S02-A): ao aceitar um convite o componente chamava só
 * `router.refresh()`, que não recarrega o contexto de autenticação onde vivem as
 * viagens e os convites. A viagem aceita só aparecia depois de um reload manual.
 */

const h = vi.hoisted(() => ({
  refreshTrips: vi.fn(() => Promise.resolve()),
  refreshInvitations: vi.fn(() => Promise.resolve()),
  setTripsLoading: vi.fn(),
  routerRefresh: vi.fn(),
}))

vi.mock("@/context/auth-context", () => ({
  useAuth: () => ({
    refreshTrips: h.refreshTrips,
    refreshInvitations: h.refreshInvitations,
    setTripsLoading: h.setTripsLoading,
  }),
}))

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.routerRefresh }) }))

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
    profiles: { full_name: "Ana" },
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  h.refreshTrips.mockResolvedValue(undefined)
  h.refreshInvitations.mockResolvedValue(undefined)
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) })),
  )
})

describe("TripInvitations", () => {
  it("recarrega viagens e convites do contexto ao aceitar", async () => {
    render(<TripInvitations invitations={CONVITE} />)

    await userEvent.click(screen.getByRole("button", { name: /aceitar/i }))

    await waitFor(() => expect(h.refreshTrips).toHaveBeenCalled())
    expect(h.refreshInvitations).toHaveBeenCalled()
  })
})
