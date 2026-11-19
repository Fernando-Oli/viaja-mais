// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * @RF09.14 — a aba Marcações na tela: os dois cartões (o visível com a 1ª foto
 * ou o grafismo, e o link ao detalhe /feed/<post_id>), os estados e remover a
 * própria marca com `ConfirmModal` e `toast()`. Nada de `confirm()`/`alert()`,
 * e só as rotas de /api/social (nenhum cliente Supabase).
 */

const h = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }))

import { MarcacoesDoPerfil } from "@/components/social/marcacoes-do-perfil"
import { periodo } from "@/components/social/marcacoes-cartao"

const POST_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const POST_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const bruno = { username: "bruno", full_name: "Bruno Teste", avatar_url: null }

const VISIVEL = {
  post_id: POST_1,
  marcado_em: "2026-11-18T12:00:00Z",
  autor: bruno,
  post: {
    title: "Férias em Lisboa",
    destination: "Lisboa, Portugal",
    start_date: "2026-06-12",
    end_date: "2026-06-18",
    caption: "Sete dias entre Alfama e Belém",
    foto: null,
  },
}
const POST_3 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
/** Post sem viagem: os quatro campos da viagem nulos e a 1ª foto assinada. */
const SEM_VIAGEM = {
  post_id: POST_3,
  marcado_em: "2026-11-19T12:00:00Z",
  autor: bruno,
  post: {
    title: null,
    destination: null,
    start_date: null,
    end_date: null,
    caption: "Pôr do sol no Tejo",
    foto: "https://storage.local/assinada/foto-1.webp",
  },
}
const OCULTA = { post_id: POST_2, marcado_em: "2026-11-17T12:00:00Z", autor: bruno, post: null }

type Resposta = { status: number; corpo?: unknown }

/** Responde em ordem; a última resposta se repete. */
function servidor(...respostas: Resposta[]) {
  const fila = [...respostas]
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    void url
    void init
    const r = fila.length > 1 ? fila.shift()! : fila[0]
    return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: () => Promise.resolve(r.corpo ?? {}) })
  })
  vi.stubGlobal("fetch", fetch)
  return fetch
}

beforeEach(() => {
  vi.spyOn(window, "confirm")
  vi.spyOn(window, "alert")
})

describe("MarcacoesDoPerfil", () => {
  it("lê pela rota da aba e mostra o post visível com resumo e o oculto só com quem marcou", async () => {
    const fetch = servidor({ status: 200, corpo: { marcacoes: [VISIVEL, OCULTA], proprio: true } })
    render(<MarcacoesDoPerfil username="Carla" />)

    const cartao = await screen.findByRole("article", { name: "Férias em Lisboa" })
    expect(fetch).toHaveBeenCalledWith("/api/social/perfis/carla/marcacoes")
    expect(within(cartao).getByText("Lisboa, Portugal")).toBeInTheDocument()
    expect(within(cartao).getByText("Sete dias entre Alfama e Belém")).toBeInTheDocument()
    expect(within(cartao).getByRole("link", { name: /Bruno Teste/ })).toHaveAttribute("href", "/u/bruno")

    const oculta = screen.getByRole("article", { name: "Marcação de @bruno" })
    expect(oculta).toHaveTextContent("Bruno Teste marcou você numa publicação que só os seguidores veem.")
    expect(screen.getAllByRole("button", { name: /^Remover marcação/ })).toHaveLength(2)
    // O cartão visível leva ao detalhe; o oculto, não (o detalhe responderia 404).
    expect(within(cartao).getByRole("link", { name: /^Abrir a publicação de @bruno: Lisboa, Portugal, 12 de jun/ })).toHaveAttribute(
      "href",
      `/feed/${POST_1}`,
    )
    expect(within(oculta).queryByRole("link", { name: /Abrir a publicação/ })).not.toBeInTheDocument()
  })

  it("post sem viagem: a 1ª foto, a legenda, sem faixa de destino, e o link ao detalhe", async () => {
    servidor({ status: 200, corpo: { marcacoes: [SEM_VIAGEM], proprio: false } })
    const { container } = render(<MarcacoesDoPerfil username="carla" />)

    const cartao = await screen.findByRole("article", { name: "Publicação de @bruno" })
    expect(within(cartao).getByText("Pôr do sol no Tejo")).toBeInTheDocument()
    expect(within(cartao).queryByRole("heading", { level: 3 })).not.toBeInTheDocument()
    expect(within(cartao).getByRole("link", { name: "Abrir a publicação de @bruno" })).toHaveAttribute("href", `/feed/${POST_3}`)
    expect(container.querySelector('img[src="https://storage.local/assinada/foto-1.webp"]')).not.toBeNull()
  })

  it("na aba de outra pessoa, nenhum botão de remover", async () => {
    servidor({ status: 200, corpo: { marcacoes: [VISIVEL], proprio: false } })
    render(<MarcacoesDoPerfil username="carla" />)

    await screen.findByRole("article", { name: "Férias em Lisboa" })
    expect(screen.queryByRole("button", { name: /Remover/ })).not.toBeInTheDocument()
  })

  it("vazio: na própria aba e na de outra pessoa", async () => {
    servidor({ status: 200, corpo: { marcacoes: [], proprio: true } })
    const { unmount } = render(<MarcacoesDoPerfil username="carla" />)
    expect(await screen.findByText(/Quando alguém marcar você/)).toBeInTheDocument()
    unmount()

    servidor({ status: 200, corpo: { marcacoes: [], proprio: false } })
    render(<MarcacoesDoPerfil username="carla" />)
    expect(await screen.findByText("@carla ainda não foi marcado em nenhuma publicação que você pode ver.")).toBeInTheDocument()
  })

  it("403 vira conta privada; 401, sessão expirada; 404, perfil inexistente", async () => {
    servidor({ status: 403 })
    const a = render(<MarcacoesDoPerfil username="carla" />)
    expect(await screen.findByText("Esta conta é privada")).toBeInTheDocument()
    a.unmount()

    servidor({ status: 401 })
    const b = render(<MarcacoesDoPerfil username="carla" />)
    expect(await screen.findByText("Sua sessão expirou.")).toBeInTheDocument()
    b.unmount()

    servidor({ status: 404 })
    render(<MarcacoesDoPerfil username="carla" />)
    expect(await screen.findByText("Nenhum perfil usa esse nome de usuário.")).toBeInTheDocument()
  })

  it("erro ao carregar: mensagem e Tentar de novo, que pede de novo", async () => {
    const fetch = servidor({ status: 500 }, { status: 200, corpo: { marcacoes: [VISIVEL], proprio: true } })
    render(<MarcacoesDoPerfil username="carla" />)

    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }))

    expect(await screen.findByRole("article", { name: "Férias em Lisboa" })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("remover: confirma no ConfirmModal, apaga pela rota, tira o cartão e avisa por toast", async () => {
    const fetch = servidor({ status: 200, corpo: { marcacoes: [VISIVEL, OCULTA], proprio: true } }, { status: 200, corpo: { ok: true } })
    render(<MarcacoesDoPerfil username="carla" />)

    const oculta = await screen.findByRole("article", { name: "Marcação de @bruno" })
    await userEvent.click(within(oculta).getByRole("button", { name: /^Remover marcação/ }))
    const dialogo = await screen.findByRole("alertdialog")
    expect(dialogo).toHaveTextContent("Remover sua marcação?")
    await userEvent.click(within(dialogo).getByRole("button", { name: "Remover" }))

    await waitFor(() => expect(screen.queryByRole("article", { name: "Marcação de @bruno" })).not.toBeInTheDocument())
    expect(fetch).toHaveBeenLastCalledWith(`/api/social/marcacoes/${POST_2}`, { method: "DELETE" })
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Marcação removida" }))
    expect(screen.getByRole("article", { name: "Férias em Lisboa" })).toBeInTheDocument()
    expect(window.confirm).not.toHaveBeenCalled()
    expect(window.alert).not.toHaveBeenCalled()
  })

  it("cancelar no ConfirmModal não apaga nada", async () => {
    const fetch = servidor({ status: 200, corpo: { marcacoes: [VISIVEL], proprio: true } })
    render(<MarcacoesDoPerfil username="carla" />)

    await userEvent.click(await screen.findByRole("button", { name: /^Remover marcação/ }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancelar" }))

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("article", { name: "Férias em Lisboa" })).toBeInTheDocument()
  })

  it("404 ao remover: a marca já não existia, o cartão sai e o toast avisa", async () => {
    servidor({ status: 200, corpo: { marcacoes: [VISIVEL], proprio: true } }, { status: 404 })
    render(<MarcacoesDoPerfil username="carla" />)

    await userEvent.click(await screen.findByRole("button", { name: /^Remover marcação/ }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover" }))

    await waitFor(() => expect(screen.queryByRole("article", { name: "Férias em Lisboa" })).not.toBeInTheDocument())
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Marcação já removida" }))
  })

  it("erro ao remover: toast destrutivo e o cartão fica", async () => {
    servidor({ status: 200, corpo: { marcacoes: [VISIVEL], proprio: true } }, { status: 500 })
    render(<MarcacoesDoPerfil username="carla" />)

    await userEvent.click(await screen.findByRole("button", { name: /^Remover marcação/ }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remover" }))

    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })))
    expect(screen.getByRole("article", { name: "Férias em Lisboa" })).toBeInTheDocument()
  })
})

describe("periodo", () => {
  it("formata em UTC, sem trocar de dia, e junta o ano quando é o mesmo", () => {
    expect(periodo("2026-06-12", "2026-06-18")).toMatch(/^12 de jun\.? – 18 de jun\.? de 2026$/)
    expect(periodo("2026-12-30", "2027-01-02")).toMatch(/2026 – 2 de jan\.? de 2027$/)
    expect(periodo("2026-06-12", "2026-06-12")).toMatch(/^12 de jun\.? de 2026$/)
    expect(periodo("x", "2026-06-12")).toBe("")
  })
})
