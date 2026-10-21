// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * Regressão da S07-A: o convite não dava retorno nenhum — nem de sucesso, nem
 * de erro — e remover membro usava `confirm()` e `alert()`.
 */

const h = vi.hoisted(() => ({ toast: vi.fn(), refresh: vi.fn() }))

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: h.refresh }) }))

import { TripMembers } from "@/components/trip-members"

const MEMBROS = [
  { id: "m-1", user_id: "u-ana", role: "owner", profiles: { full_name: "Ana Teste" } },
  { id: "m-2", user_id: "u-bruno", role: "member", profiles: { full_name: null } },
]

function respostaFetch(ok: boolean, corpo: unknown) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok, json: () => Promise.resolve(corpo) })))
}

async function convidar(email = "carla@viajamais.local") {
  await userEvent.type(screen.getByLabelText("E-mail de quem convidar"), email)
  await userEvent.click(screen.getByRole("button", { name: "Enviar Convite" }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(window, "confirm")
  vi.spyOn(window, "alert")
})

describe("TripMembers — convite", () => {
  it.each([
    ["enviado", /Enviamos um e-mail/],
    ["ja-cadastrado", /já tem conta/],
    ["falhou", /não pôde ser enviado/],
  ])("desfecho %s vira toast de sucesso com o aviso certo", async (envio, aviso) => {
    respostaFetch(true, { success: true, envio })
    render(<TripMembers tripId="t-1" members={MEMBROS} isOwner />)

    await convidar()

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Convite enviado", description: expect.stringMatching(aviso) }),
      ),
    )
    expect(screen.getByLabelText("E-mail de quem convidar")).toHaveProperty("value", "")
  })

  it("erro do servidor vira toast destrutivo e o e-mail fica no campo", async () => {
    respostaFetch(false, { error: "Sem permissão para convidar" })
    render(<TripMembers tripId="t-1" members={MEMBROS} isOwner />)

    await convidar()

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Sem permissão para convidar", variant: "destructive" }),
      ),
    )
    expect(screen.getByLabelText("E-mail de quem convidar")).toHaveProperty("value", "carla@viajamais.local")
  })

  it("sem rede, a mensagem é em português", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))))
    render(<TripMembers tripId="t-1" members={MEMBROS} isOwner />)

    await convidar()

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Não foi possível enviar o convite" }),
      ),
    )
  })

  it("quem não é dono não vê o formulário", () => {
    render(<TripMembers tripId="t-1" members={MEMBROS} isOwner={false} />)

    expect(screen.queryByLabelText("E-mail de quem convidar")).toBeNull()
    expect(screen.queryByRole("button", { name: /remover/i })).toBeNull()
  })
})

describe("TripMembers — remover", () => {
  it("pede confirmação no modal, não no confirm() do navegador", async () => {
    respostaFetch(true, { success: true })
    render(<TripMembers tripId="t-1" members={MEMBROS} isOwner />)

    await userEvent.click(screen.getByRole("button", { name: "Remover membro" }))
    expect(screen.getByText("Remover membro?")).toBeTruthy()
    expect(fetch).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole("button", { name: "Remover" }))

    await waitFor(() => expect(h.toast).toHaveBeenCalledWith({ title: "Membro removido" }))
    expect(fetch).toHaveBeenCalledWith("/api/trips/t-1/members?userId=u-bruno", { method: "DELETE" })
    expect(h.refresh).toHaveBeenCalled()
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it("cancelar no modal não remove", async () => {
    respostaFetch(true, { success: true })
    render(<TripMembers tripId="t-1" members={MEMBROS} isOwner />)

    await userEvent.click(screen.getByRole("button", { name: "Remover membro" }))
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }))

    expect(fetch).not.toHaveBeenCalled()
  })

  it("erro ao remover vira toast, não alert()", async () => {
    respostaFetch(false, { error: "Sem permissão" })
    render(<TripMembers tripId="t-1" members={MEMBROS} isOwner />)

    await userEvent.click(screen.getByRole("button", { name: "Remover membro" }))
    await userEvent.click(screen.getByRole("button", { name: "Remover" }))

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Sem permissão", variant: "destructive" }),
      ),
    )
    expect(window.alert).not.toHaveBeenCalled()
    expect(h.refresh).not.toHaveBeenCalled()
  })
})
