// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * @RF09.16 — a aba Publicações do perfil na tela: a grade de quadrados (1ª foto
 * com `alt` = descrição, ou o grafismo), o ícone de várias fotos, o link ao
 * detalhe, o "Carregar mais" pelo cursor e os estados. Só a rota de
 * /api/social (nenhum cliente Supabase), e `toast()` no lugar de `alert()`.
 */

const h = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }))

import { PublicacoesDoPerfil } from "@/components/social/publicacoes-do-perfil"

const ID = (n: number) => `${String(n).padStart(8, "0")}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`

const COM_FOTOS = { id: ID(1), foto: "https://storage.local/assinada/1.webp", quantidade_fotos: 3, descricao: "Pôr do sol no Tejo" }
const UMA_FOTO = { id: ID(2), foto: "https://storage.local/assinada/2.webp", quantidade_fotos: 1, descricao: "Café em Alfama" }
const SEM_FOTO = { id: ID(3), foto: null, quantidade_fotos: 0, descricao: "Férias em Lisboa" }

type Resposta = { status: number; corpo?: unknown }

/** Responde em ordem; a última resposta se repete. */
function servidor(...respostas: Resposta[]) {
  const fila = [...respostas]
  const fetch = vi.fn((url: string) => {
    void url
    const r = fila.length > 1 ? fila.shift()! : fila[0]
    return Promise.resolve({ ok: r.status >= 200 && r.status < 300, status: r.status, json: () => Promise.resolve(r.corpo ?? {}) })
  })
  vi.stubGlobal("fetch", fetch)
  return fetch
}

beforeEach(() => {
  h.toast.mockClear()
  vi.spyOn(window, "alert")
})

describe("PublicacoesDoPerfil", () => {
  it("lê pela rota e mostra cada post como link ao detalhe, com a foto ou o grafismo", async () => {
    const fetch = servidor({ status: 200, corpo: { posts: [COM_FOTOS, UMA_FOTO, SEM_FOTO], proximo: null } })
    render(<PublicacoesDoPerfil username="Carla" proprio={false} />)

    const regiao = await screen.findByRole("region", { name: "Publicações" })
    await within(regiao).findByRole("img", { name: "Café em Alfama" })
    expect(fetch).toHaveBeenCalledWith("/api/social/perfis/carla/posts")

    const links = within(regiao).getAllByRole("link")
    expect(links.map((l) => l.getAttribute("href"))).toEqual([`/feed/${ID(1)}`, `/feed/${ID(2)}`, `/feed/${ID(3)}`])
    expect(within(regiao).getByRole("img", { name: "Pôr do sol no Tejo" })).toHaveAttribute("src", COM_FOTOS.foto)
    // Sem foto: o grafismo é decorativo, e a descrição vira o nome do link.
    expect(within(regiao).getByRole("link", { name: "Férias em Lisboa" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Carregar mais" })).not.toBeInTheDocument()
  })

  it("o ícone de várias fotos só aparece com mais de uma foto", async () => {
    servidor({ status: 200, corpo: { posts: [COM_FOTOS, UMA_FOTO, SEM_FOTO], proximo: null } })
    render(<PublicacoesDoPerfil username="carla" proprio={false} />)

    await screen.findByRole("img", { name: "Café em Alfama" })
    const icones = screen.getAllByRole("img", { name: /\d+ fotos$/ })
    expect(icones).toHaveLength(1)
    expect(icones[0]).toHaveAccessibleName("3 fotos")
    expect(screen.getByRole("link", { name: /Pôr do sol no Tejo/ })).toContainElement(icones[0])
  })

  it("Carregar mais pede o cursor, junta ao fim sem repetir e some na última página", async () => {
    const fetch = servidor(
      { status: 200, corpo: { posts: [COM_FOTOS, UMA_FOTO], proximo: "cursor/1+a" } },
      { status: 200, corpo: { posts: [UMA_FOTO, SEM_FOTO], proximo: null } },
    )
    render(<PublicacoesDoPerfil username="carla" proprio={false} />)

    await userEvent.click(await screen.findByRole("button", { name: "Carregar mais" }))

    await screen.findByRole("link", { name: "Férias em Lisboa" })
    expect(fetch).toHaveBeenLastCalledWith("/api/social/perfis/carla/posts?cursor=cursor%2F1%2Ba")
    expect(screen.getAllByRole("link")).toHaveLength(3)
    expect(screen.queryByRole("button", { name: "Carregar mais" })).not.toBeInTheDocument()
    // O foco vai ao primeiro post novo.
    await waitFor(() => expect(screen.getByRole("link", { name: "Férias em Lisboa" })).toHaveFocus())
  })

  it("falha no Carregar mais: toast destrutivo, a grade fica e o botão continua", async () => {
    servidor({ status: 200, corpo: { posts: [COM_FOTOS], proximo: "c1" } }, { status: 500 })
    render(<PublicacoesDoPerfil username="carla" proprio={false} />)

    await userEvent.click(await screen.findByRole("button", { name: "Carregar mais" }))

    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })))
    expect(screen.getAllByRole("link")).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Carregar mais" })).toBeEnabled()
    expect(window.alert).not.toHaveBeenCalled()
  })

  it("vazio: o convite a criar só no próprio perfil", async () => {
    servidor({ status: 200, corpo: { posts: [], proximo: null } })
    const a = render(<PublicacoesDoPerfil username="carla" proprio />)
    expect(await screen.findByText("Nenhuma publicação ainda")).toBeInTheDocument()
    expect(screen.getByText(/Compartilhe a primeira/)).toBeInTheDocument()
    a.unmount()

    servidor({ status: 200, corpo: { posts: [], proximo: null } })
    render(<PublicacoesDoPerfil username="carla" proprio={false} />)
    expect(await screen.findByText("Nenhuma publicação ainda")).toBeInTheDocument()
    expect(screen.queryByText(/Compartilhe a primeira/)).not.toBeInTheDocument()
  })

  it("403 vira conta privada; 401, sessão expirada; 404, perfil inexistente", async () => {
    servidor({ status: 403 })
    const a = render(<PublicacoesDoPerfil username="carla" proprio={false} />)
    expect(await screen.findByText("Esta conta é privada")).toBeInTheDocument()
    a.unmount()

    servidor({ status: 401 })
    const b = render(<PublicacoesDoPerfil username="carla" proprio={false} />)
    expect(await screen.findByText("Sua sessão expirou.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Entrar de novo" })).toHaveAttribute("href", "/auth/login")
    b.unmount()

    servidor({ status: 404 })
    render(<PublicacoesDoPerfil username="carla" proprio={false} />)
    expect(await screen.findByText("Nenhum perfil usa esse nome de usuário.")).toBeInTheDocument()
  })

  it("erro ao carregar: mensagem e Tentar de novo, que pede de novo", async () => {
    const fetch = servidor({ status: 500 }, { status: 200, corpo: { posts: [UMA_FOTO], proximo: null } })
    render(<PublicacoesDoPerfil username="carla" proprio={false} />)

    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }))

    expect(await screen.findByRole("img", { name: "Café em Alfama" })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("carregando: o esqueleto é anunciado", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})))
    render(<PublicacoesDoPerfil username="carla" proprio={false} />)
    expect(screen.getByRole("status", { name: "Carregando publicações" })).toBeInTheDocument()
  })
})
