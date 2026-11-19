// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * @RF09.15 — criar post na tela: selecionar de 1 a 3 fotos na ordem da escolha
 * (acrescentar, limite, remover, tipo e tamanho), legenda e "Compartilhar" em
 * multipart para POST /api/social/posts, com `toast()` e sem `alert`/`confirm`.
 */

const h = vi.hoisted(() => ({ toast: vi.fn(), push: vi.fn(), refresh: vi.fn() }))
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, refresh: h.refresh }) }))

import { BotaoCriarPost } from "@/components/social/criar-post"
import { acrescentarFotos, avisoDaEscolha } from "@/components/social/criar-post-fotos"

const foto = (nome: string, tipo = "image/jpeg", bytes = 10) => new File([new Uint8Array(bytes)], nome, { type: tipo })

function servidor(status: number, corpo: unknown = {}) {
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    void url
    void init
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(corpo) })
  })
  vi.stubGlobal("fetch", fetch)
  return fetch
}

/** As miniaturas, na ordem: o `alt` leva o número e o nome do arquivo. */
function ordem() {
  const lista = screen.getByRole("list", { name: "Fotos escolhidas, na ordem do carrossel" })
  return within(lista)
    .getAllByRole("img")
    .map((img) => img.getAttribute("alt"))
}

async function abrir() {
  // O `accept` do input é conferido pela tela também: aqui ele não filtra, para provar a conferência dela.
  const user = userEvent.setup({ applyAccept: false })
  render(<BotaoCriarPost />)
  await user.click(screen.getByRole("button", { name: "Criar" }))
  const campo = screen.getByLabelText("Selecionar fotos") as HTMLInputElement
  return { user, campo }
}

beforeEach(() => {
  vi.spyOn(window, "confirm")
  vi.spyOn(window, "alert")
  URL.createObjectURL = vi.fn((f: Blob) => `blob:${(f as File).name}`)
  URL.revokeObjectURL = vi.fn()
})

describe("Criar post — seleção de fotos", () => {
  it("aceita JPEG, PNG e WebP na ordem da escolha, e escolher de novo acrescenta", async () => {
    const { user, campo } = await abrir()
    expect(campo).toHaveAttribute("accept", "image/jpeg,image/png,image/webp")
    expect(campo).toHaveAttribute("multiple")
    expect(screen.getByRole("button", { name: "Avançar" })).toBeDisabled()

    await user.upload(campo, [foto("b.png", "image/png"), foto("a.jpg")])
    expect(ordem()).toEqual(["Foto 1: b.png", "Foto 2: a.jpg"])

    await user.upload(campo, foto("c.webp", "image/webp"))
    expect(ordem()).toEqual(["Foto 1: b.png", "Foto 2: a.jpg", "Foto 3: c.webp"])
    expect(screen.getByText("3 de 3 fotos — limite atingido.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Adicionar" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Avançar" })).toBeEnabled()
    expect(window.alert).not.toHaveBeenCalled()
  })

  it("no máximo 3: o que passa fica de fora, com aviso por toast", async () => {
    const { user, campo } = await abrir()
    await user.upload(campo, [foto("1.jpg"), foto("2.jpg")])
    await user.upload(campo, [foto("3.jpg"), foto("4.jpg"), foto("5.jpg")])

    expect(ordem()).toEqual(["Foto 1: 1.jpg", "Foto 2: 2.jpg", "Foto 3: 3.jpg"])
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Limite de fotos", description: "Um post tem até 3 fotos; 2 ficaram de fora." }),
    )
  })

  it("remover uma foto mantém a ordem das outras e libera a prévia", async () => {
    const { user, campo } = await abrir()
    await user.upload(campo, [foto("a.jpg"), foto("b.jpg"), foto("c.jpg")])

    await user.click(screen.getByRole("button", { name: "Remover a foto 2" }))

    expect(ordem()).toEqual(["Foto 1: a.jpg", "Foto 2: c.jpg"])
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:b.jpg")
    // Abriu vaga: dá para acrescentar de novo, e a nova entra no fim.
    await user.upload(campo, foto("d.jpg"))
    expect(ordem()).toEqual(["Foto 1: a.jpg", "Foto 2: c.jpg", "Foto 3: d.jpg"])
  })

  it("recusa outro tipo e foto de mais de 2 MB, sem tirar as aceitas", async () => {
    const { user, campo } = await abrir()
    await user.upload(campo, [foto("ok.jpg"), foto("doc.pdf", "application/pdf"), foto("grande.jpg", "image/jpeg", 2 * 1024 * 1024 + 1)])

    expect(ordem()).toEqual(["Foto 1: ok.jpg"])
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "destructive",
        description: "doc.pdf: envie JPEG, PNG ou WebP. grande.jpg: cada foto pode ter até 2 MB.",
      }),
    )
  })

  it("a prévia é o carrossel: setas e pontos trocam de foto", async () => {
    const { user, campo } = await abrir()
    await user.upload(campo, [foto("a.jpg"), foto("b.jpg")])
    const carrossel = screen.getByRole("region", { name: "Prévia das fotos" })

    expect(within(carrossel).getByRole("button", { name: "Foto anterior" })).toBeDisabled()
    await user.click(within(carrossel).getByRole("button", { name: "Próxima foto" }))
    expect(within(carrossel).getByRole("status")).toHaveTextContent("Foto 2 de 2")
    expect(within(carrossel).getByRole("button", { name: "Ir para a foto 2" })).toHaveAttribute("aria-current", "true")
    await user.click(within(carrossel).getByRole("button", { name: "Ir para a foto 1" }))
    expect(within(carrossel).getByRole("status")).toHaveTextContent("Foto 1 de 2")
  })

  it("fechar com fotos pede confirmação no ConfirmModal, não no confirm()", async () => {
    const { user, campo } = await abrir()
    await user.upload(campo, foto("a.jpg"))
    await user.click(screen.getByRole("button", { name: "Cancelar" }))

    expect(await screen.findByRole("alertdialog", { name: "Descartar publicação?" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Descartar" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(window.confirm).not.toHaveBeenCalled()
  })
})

describe("Criar post — compartilhar", () => {
  async function ateOPasso2() {
    const r = await abrir()
    await r.user.upload(r.campo, [foto("b.jpg"), foto("a.jpg")])
    await r.user.click(screen.getByRole("button", { name: "Avançar" }))
    return r
  }

  it("envia multipart na ordem, com legenda; depois toast, refresh e o detalhe", async () => {
    const fetch = servidor(201, { post: { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" } })
    const { user } = await ateOPasso2()

    await user.type(screen.getByLabelText("Legenda"), "  Fim de semana  ")
    expect(screen.getByText("17 de 280")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Compartilhar" }))

    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/feed/dddddddd-dddd-4ddd-8ddd-dddddddddddd"))
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe("/api/social/posts")
    expect(init?.method).toBe("POST")
    const corpo = init?.body as FormData
    expect((corpo.getAll("fotos") as File[]).map((f) => f.name)).toEqual(["b.jpg", "a.jpg"])
    expect(corpo.get("legenda")).toBe("Fim de semana")
    expect(corpo.has("marcados")).toBe(false)
    expect(h.refresh).toHaveBeenCalled()
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Publicação compartilhada" }))
  })

  it("403 sem_username leva ao perfil; 401 oferece entrar de novo", async () => {
    servidor(403, { error: "Escolha um nome de usuário", codigo: "sem_username" })
    const { user } = await ateOPasso2()
    await user.click(screen.getByRole("button", { name: "Compartilhar" }))
    expect(await screen.findByRole("link", { name: "Escolher nome de usuário" })).toHaveAttribute("href", "/dashboard/perfil")

    servidor(401, { error: "Não autenticado" })
    await user.click(screen.getByRole("button", { name: "Compartilhar" }))
    expect(await screen.findByRole("link", { name: "Entrar de novo" })).toHaveAttribute("href", "/auth/login")
    expect(h.push).not.toHaveBeenCalled()
  })

  it("400/413/429 mostram a mensagem do servidor; falha de rede, mensagem amigável", async () => {
    servidor(429, { error: "Muitos envios. Tente em 1 minuto." })
    const { user } = await ateOPasso2()
    await user.click(screen.getByRole("button", { name: "Compartilhar" }))
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Muitos envios. Tente em 1 minuto." })),
    )

    servidor(400, { error: "Dados inválidos", detalhes: { fieldErrors: { legenda: ["legenda passa de 280 caracteres"] }, formErrors: [] } })
    await user.click(screen.getByRole("button", { name: "Compartilhar" }))
    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Legenda passa de 280 caracteres" })),
    )

    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))))
    await user.click(screen.getByRole("button", { name: "Compartilhar" }))
    await waitFor(() => expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Sem conexão com o servidor" })))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("durante o envio, os controles ficam desabilitados", async () => {
    let responder: (v: unknown) => void = () => {}
    vi.stubGlobal("fetch", vi.fn(() => new Promise((r) => (responder = r))))
    const { user } = await ateOPasso2()
    await user.click(screen.getByRole("button", { name: "Compartilhar" }))

    expect(screen.getByRole("button", { name: "Compartilhando…" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Voltar" })).toBeDisabled()
    expect(screen.getByLabelText("Legenda")).toBeDisabled()
    expect(screen.getByRole("combobox", { name: "Marcar pessoas" })).toBeDisabled()
    responder({ ok: false, status: 500, json: () => Promise.resolve({}) })
    await waitFor(() => expect(screen.getByRole("button", { name: "Compartilhar" })).toBeEnabled())
  })
})

describe("Criar post — quem removeu a marcação (@RF09.13)", () => {
  it("400 marcado_recusou: a pessoa sai da seleção, fica desabilitada, o toast diz quem e o diálogo fica", async () => {
    const bia = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", username: "bia", full_name: "Bia Lima", avatar_url: null }
    const fetch = vi.fn((url: string, init?: RequestInit) => {
      void init
      if (url.startsWith("/api/social/pessoas")) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ pessoas: [bia] }) })
      }
      const corpo = { error: "Alguém removeu a marcação", codigo: "marcado_recusou", recusados: [bia.id] }
      return Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve(corpo) })
    })
    vi.stubGlobal("fetch", fetch)
    const { user, campo } = await abrir()
    await user.upload(campo, foto("a.jpg"))
    await user.click(screen.getByRole("button", { name: "Avançar" }))

    await user.type(screen.getByRole("combobox", { name: "Marcar pessoas" }), "bi")
    await user.click(await screen.findByRole("option", { name: /Bia Lima/ }))
    expect(screen.getByRole("button", { name: "Remover a marcação de @bia" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Compartilhar" }))

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ description: expect.stringMatching(/^@bia removeu a própria marcação/) }),
      ),
    )
    const posts = fetch.mock.calls.filter(([url]) => url === "/api/social/posts")
    expect(JSON.parse((posts[0][1]?.body as FormData).get("marcados") as string)).toEqual([bia.id])
    expect(screen.queryByRole("button", { name: "Remover a marcação de @bia" })).not.toBeInTheDocument()
    const opcao = screen.getByRole("option", { name: /Bia Lima/ })
    expect(opcao).toHaveAttribute("aria-disabled", "true")
    expect(opcao).toHaveTextContent("Removeu a marcação")
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(h.push).not.toHaveBeenCalled()
  })
})

describe("acrescentarFotos (regra pura)", () => {
  it("mantém as atuais, acrescenta na ordem e conta recusas e excedentes", () => {
    const r = acrescentarFotos(["x"], [foto("a.jpg"), foto("b.gif", "image/gif"), foto("c.jpg"), foto("d.jpg")], (f) => f.name)
    expect(r.fotos).toEqual(["x", "a.jpg", "c.jpg"])
    expect(r.recusados).toEqual([{ nome: "b.gif", motivo: "tipo" }])
    expect(r.excedentes).toBe(1)
    expect(avisoDaEscolha({ recusados: [], excedentes: 0 })).toBeNull()
    expect(avisoDaEscolha({ recusados: [], excedentes: 1 })).toBe("Um post tem até 3 fotos; 1 ficou de fora.")
  })
})
