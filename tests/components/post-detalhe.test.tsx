// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * @RF09.17 — o detalhe do post na tela (GET /api/social/posts/[postId]): autor,
 * carrossel ou grafismo, legenda, marcados, a cópia da viagem agrupada por dia,
 * o 404 que não revela nada e, para a autora, excluir (ConfirmModal + DELETE) e
 * editar legenda e marcações (PATCH, @RF09.15).
 */

const h = vi.hoisted(() => ({ toast: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, refresh: h.refresh }) }))

import { PostDetalhe } from "@/components/social/post-detalhe"
import { roteiroPorDia } from "@/components/social/post-detalhe-modelo"
import type { PostVisto } from "@/components/social/post-detalhe-modelo"

const ID = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const bia = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", username: "bia", full_name: "Bia Lima", avatar_url: null }

const COM_FOTOS: PostVisto = {
  id: ID,
  autor: { username: "ana", full_name: "Ana Souza", avatar_url: null },
  caption: "Fim de semana na serra",
  fotos: ["https://storage/1.webp?token=a", "https://storage/2.webp?token=b"],
  marcados: [bia],
  created_at: "2026-11-18T15:00:00Z",
  updated_at: "2026-11-18T15:00:00Z",
  proprio: false,
  viagem: null,
}

const DE_VIAGEM: PostVisto = {
  ...COM_FOTOS,
  caption: null,
  fotos: [],
  marcados: [],
  viagem: {
    title: "Férias em Lisboa",
    destination: "Lisboa, Portugal",
    start_date: "2026-06-12",
    end_date: "2026-06-18",
    items: [
      { title: "Castelo de São Jorge", date: "2026-06-13", start_time: "09:00:00", end_time: "11:00:00", category: "attraction" },
      { title: "Chegada", date: "2026-06-12" },
      { title: "Fado", date: "2026-06-13", location: "Alfama" },
      { title: "Lembrar do adaptador" },
    ],
    places: [{ name: "Pastéis de Belém", category: "restaurant", address: "R. de Belém, 84" }, { name: "Miradouro" }],
  },
}

type Resposta = { status: number; corpo?: unknown }

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

describe("PostDetalhe", () => {
  it("post com fotos: autor com link, carrossel com alt, legenda, marcados com link e data", async () => {
    const fetch = servidor({ status: 200, corpo: { post: COM_FOTOS } })
    render(<PostDetalhe postId={ID} />)

    const post = await screen.findByRole("article", { name: "Publicação de @ana" })
    expect(fetch.mock.calls[0][0]).toBe(`/api/social/posts/${ID}`)
    expect(within(post).getByRole("link", { name: /Ana Souza/ })).toHaveAttribute("href", "/u/ana")
    const carrossel = within(post).getByRole("region", { name: "Fotos da publicação de @ana" })
    expect(within(carrossel).getByRole("img", { name: "Foto 1 de 2 da publicação de @ana" })).toHaveAttribute(
      "src",
      COM_FOTOS.fotos[0],
    )
    expect(within(post).getByText("Fim de semana na serra")).toBeInTheDocument()
    expect(within(post).getByRole("link", { name: "@bia" })).toHaveAttribute("href", "/u/bia")
    expect(within(post).getByText("18 de novembro de 2026")).toBeInTheDocument()
    // Não é a autora: nem editar nem excluir.
    expect(within(post).queryByRole("button", { name: /Excluir|Editar/ })).not.toBeInTheDocument()
  })

  it("post de viagem sem fotos: grafismo, título, destino, datas, roteiro por dia e lugares com endereço", async () => {
    servidor({ status: 200, corpo: { post: DE_VIAGEM } })
    render(<PostDetalhe postId={ID} />)

    expect(await screen.findByRole("heading", { level: 2, name: "Férias em Lisboa" })).toBeInTheDocument()
    expect(screen.queryByRole("region", { name: /Fotos/ })).not.toBeInTheDocument()
    expect(screen.getAllByText("Lisboa, Portugal").length).toBeGreaterThan(0)
    expect(screen.getAllByText("12 de jun. – 18 de jun. de 2026").length).toBeGreaterThan(0)

    const dias = screen.getAllByRole("heading", { level: 3 }).map((d) => d.textContent)
    expect(dias).toEqual(["Dia 1 · 12/06/2026", "Dia 2 · 13/06/2026", "Sem data"])
    expect(screen.getByText("09:00–11:00 · Atração")).toBeInTheDocument()
    expect(screen.getByText("Alfama")).toBeInTheDocument()

    const lugares = screen.getByRole("region", { name: "Lugares" })
    expect(within(lugares).getByText("R. de Belém, 84")).toBeInTheDocument()
    expect(within(lugares).getByText("Miradouro")).toBeInTheDocument()
  })

  it("404 e 400 dizem só que não está disponível; 401 pede para entrar; erro oferece tentar de novo", async () => {
    servidor({ status: 404 })
    const a = render(<PostDetalhe postId={ID} />)
    expect(await screen.findByRole("heading", { name: "Esta publicação não está disponível" })).toBeInTheDocument()
    a.unmount()

    servidor({ status: 400 })
    const b = render(<PostDetalhe postId="nao-e-uuid" />)
    expect(await screen.findByRole("heading", { name: "Esta publicação não está disponível" })).toBeInTheDocument()
    b.unmount()

    servidor({ status: 401 })
    const c = render(<PostDetalhe postId={ID} />)
    expect(await screen.findByRole("link", { name: "Entrar de novo" })).toHaveAttribute("href", "/auth/login")
    c.unmount()

    const fetch = servidor({ status: 500 }, { status: 200, corpo: { post: COM_FOTOS } })
    render(<PostDetalhe postId={ID} />)
    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }))
    expect(await screen.findByRole("article", { name: "Publicação de @ana" })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("autora exclui: ConfirmModal, DELETE, toast e volta ao próprio perfil", async () => {
    const fetch = servidor({ status: 200, corpo: { post: { ...COM_FOTOS, proprio: true } } }, { status: 200, corpo: { ok: true } })
    render(<PostDetalhe postId={ID} />)

    await userEvent.click(await screen.findByRole("button", { name: "Excluir" }))
    const modal = await screen.findByRole("alertdialog", { name: "Excluir esta publicação?" })
    await userEvent.click(within(modal).getByRole("button", { name: "Excluir" }))

    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/u/ana"))
    expect(fetch.mock.calls[1][0]).toBe(`/api/social/posts/${ID}`)
    expect(fetch.mock.calls[1][1]).toMatchObject({ method: "DELETE" })
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Publicação excluída" }))
    expect(window.confirm).not.toHaveBeenCalled()
  })

  it("autora edita legenda e marcações: PATCH com JSON campo a campo e a tela atualiza", async () => {
    const atualizado = { ...COM_FOTOS, proprio: true, caption: "Nova legenda", marcados: [] }
    const fetch = servidor({ status: 200, corpo: { post: { ...COM_FOTOS, proprio: true } } }, { status: 200, corpo: { post: atualizado } })
    render(<PostDetalhe postId={ID} />)

    await userEvent.click(await screen.findByRole("button", { name: "Editar legenda e marcações" }))
    const dialogo = await screen.findByRole("dialog", { name: "Editar publicação" })
    const legenda = within(dialogo).getByLabelText("Legenda")
    await userEvent.clear(legenda)
    await userEvent.type(legenda, "Nova legenda")
    await userEvent.click(within(dialogo).getByRole("button", { name: "Remover a marcação de @bia" }))
    await userEvent.click(within(dialogo).getByRole("button", { name: "Salvar" }))

    expect(await screen.findByText("Nova legenda")).toBeInTheDocument()
    const [url, init] = fetch.mock.calls[1]
    expect(url).toBe(`/api/social/posts/${ID}`)
    expect(init?.method).toBe("PATCH")
    expect(JSON.parse(init?.body as string)).toEqual({ legenda: "Nova legenda", marcados: [] })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("editar: os recusados do GET aparecem desabilitados na busca de marcar", async () => {
    const caio = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", username: "caio", full_name: "Caio Reis", avatar_url: null }
    const fetch = vi.fn((url: string) => {
      const corpo = url.startsWith("/api/social/pessoas")
        ? { pessoas: [caio] }
        : { post: { ...COM_FOTOS, proprio: true }, recusados: [caio.id] }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corpo) })
    })
    vi.stubGlobal("fetch", fetch)
    render(<PostDetalhe postId={ID} />)

    await userEvent.click(await screen.findByRole("button", { name: "Editar legenda e marcações" }))
    await userEvent.type(screen.getByRole("combobox", { name: "Marcar pessoas" }), "ca")
    const opcao = await screen.findByRole("option", { name: /Caio Reis/ })
    expect(opcao).toHaveAttribute("aria-disabled", "true")
    expect(opcao).toHaveTextContent("Removeu a marcação")
    await userEvent.click(opcao)
    expect(screen.queryByRole("button", { name: "Remover a marcação de @caio" })).not.toBeInTheDocument()
  })

  it("editar com quem recusou: 400 marcado_recusou tira a pessoa, a desabilita, diz quem e o diálogo fica", async () => {
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      if (url.startsWith("/api/social/pessoas")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ pessoas: [bia] }) })
      }
      if (init?.method === "PATCH") {
        const corpo = { error: "Alguém removeu a marcação", codigo: "marcado_recusou", recusados: [bia.id] }
        return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve(corpo) })
      }
      const corpo = { post: { ...COM_FOTOS, proprio: true }, recusados: [] }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(corpo) })
    })
    vi.stubGlobal("fetch", fetch)
    render(<PostDetalhe postId={ID} />)
    await userEvent.click(await screen.findByRole("button", { name: "Editar legenda e marcações" }))
    const dialogo = await screen.findByRole("dialog", { name: "Editar publicação" })
    expect(within(dialogo).getByRole("button", { name: "Remover a marcação de @bia" })).toBeInTheDocument()

    await userEvent.click(within(dialogo).getByRole("button", { name: "Salvar" }))

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringMatching(/^@bia removeu a própria marcação/) }),
      ),
    )
    expect(within(dialogo).queryByRole("button", { name: "Remover a marcação de @bia" })).not.toBeInTheDocument()
    await userEvent.type(within(dialogo).getByRole("combobox", { name: "Marcar pessoas" }), "bi")
    expect(await within(dialogo).findByRole("option", { name: /Bia Lima/ })).toHaveAttribute("aria-disabled", "true")
    expect(screen.getByRole("dialog", { name: "Editar publicação" })).toBeInTheDocument()
  })
})

describe("roteiroPorDia", () => {
  it("dia fora do período ou data inválida não quebra", () => {
    expect(roteiroPorDia([{ title: "x", date: "2026-06-10" }], "2026-06-12")[0].titulo).toBe("10/06/2026")
    expect(roteiroPorDia([{ title: "y", date: "13/06" }], "2026-06-12")[0].titulo).toBe("Sem data")
    expect(roteiroPorDia([], "2026-06-12")).toEqual([])
  })
})
