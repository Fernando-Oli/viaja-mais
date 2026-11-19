// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest"
import { useState } from "react"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * @RF09.13 @RF09.15 — "Marcar pessoas" na tela: busca com espera em
 * GET /api/social/pessoas?q=, fichas removíveis, sugestões, recusados
 * desabilitados, limite e teclado do combobox. Só a rota (nenhum cliente Supabase).
 */

import { MarcarPessoas } from "@/components/social/marcar-pessoas"
import type { PessoaNoPost } from "@/components/social/post-detalhe-modelo"

const ana: PessoaNoPost = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", username: "ana", full_name: "Ana Souza", avatar_url: null }
const bia: PessoaNoPost = { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", username: "bia", full_name: "Bia Lima", avatar_url: null }
const caio: PessoaNoPost = { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", username: "caio", full_name: null, avatar_url: null }

function servidor(status: number, pessoas: PessoaNoPost[] = []) {
  const fetch = vi.fn((url: string) => {
    void url
    return Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve({ pessoas }) })
  })
  vi.stubGlobal("fetch", fetch)
  return fetch
}

/** Com estado de verdade, como o diálogo usa; `aoMudar` também é espionado. */
function Com({
  iniciais = [],
  aoMudar,
  ...resto
}: { iniciais?: PessoaNoPost[]; aoMudar?: (p: PessoaNoPost[]) => void } & Omit<
  Parameters<typeof MarcarPessoas>[0],
  "selecionados" | "aoMudar"
>) {
  const [selecionados, setSelecionados] = useState(iniciais)
  return (
    <MarcarPessoas
      {...resto}
      selecionados={selecionados}
      aoMudar={(p) => {
        aoMudar?.(p)
        setSelecionados(p)
      }}
    />
  )
}

const fichas = () => within(screen.queryByRole("list", { name: "Pessoas marcadas" }) ?? document.createElement("ul"))

beforeEach(() => {
  vi.spyOn(window, "confirm")
  vi.spyOn(window, "alert")
})

describe("MarcarPessoas", () => {
  it("busca pela rota só depois de parar de digitar, com o termo normalizado", async () => {
    const fetch = servidor(200, [ana])
    render(<Com />)

    await userEvent.type(screen.getByRole("combobox", { name: "Marcar pessoas" }), "@ana")

    expect(await screen.findByRole("option", { name: /Ana Souza/ })).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe("/api/social/pessoas?q=ana")
    expect(screen.getByText("1 pessoa encontrada.")).toBeInTheDocument()
  })

  it("termo curto não busca e pede mais letras", async () => {
    const fetch = servidor(200, [ana])
    render(<Com />)

    await userEvent.type(screen.getByRole("combobox"), "a")
    expect(screen.getByText("Digite pelo menos 2 letras.")).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 400))
    expect(fetch).not.toHaveBeenCalled()
  })

  it("clicar marca e vira ficha; o X da ficha desmarca", async () => {
    servidor(200, [ana, bia])
    const aoMudar = vi.fn()
    render(<Com aoMudar={aoMudar} />)

    await userEvent.type(screen.getByRole("combobox"), "an")
    await userEvent.click(await screen.findByRole("option", { name: /Ana Souza/ }))

    expect(aoMudar).toHaveBeenLastCalledWith([ana])
    expect(fichas().getByText("@ana")).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Ana Souza/ })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("1 de 20")).toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Remover a marcação de @ana" }))
    expect(aoMudar).toHaveBeenLastCalledWith([])
    expect(screen.queryByRole("list", { name: "Pessoas marcadas" })).not.toBeInTheDocument()
  })

  it("com o campo vazio mostra as sugestões; quem recusou aparece desabilitado e não marca", async () => {
    const fetch = servidor(200)
    const aoMudar = vi.fn()
    render(<Com sugestoes={[ana, bia]} recusados={[bia.id]} aoMudar={aoMudar} />)

    const lista = screen.getByRole("listbox", { name: "Sugestões" })
    const recusou = within(lista).getByRole("option", { name: /Bia Lima/ })
    expect(recusou).toHaveAttribute("aria-disabled", "true")
    expect(recusou).toHaveTextContent("Removeu a marcação")

    await userEvent.click(recusou)
    expect(aoMudar).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it("teclado: setas pulam quem está desabilitado, Enter marca, Esc fecha a lista, Backspace tira o último", async () => {
    servidor(200)
    const aoMudar = vi.fn()
    render(<Com sugestoes={[ana, bia, caio]} recusados={[bia.id]} aoMudar={aoMudar} />)
    const campo = screen.getByRole("combobox")

    await userEvent.click(campo)
    await userEvent.keyboard("{ArrowDown}")
    expect(campo).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: /Ana Souza/ }).id)
    await userEvent.keyboard("{ArrowDown}")
    // Pulou a Bia (recusou) e foi para o Caio.
    expect(campo).toHaveAttribute("aria-activedescendant", screen.getByRole("option", { name: /caio/ }).id)
    await userEvent.keyboard("{Enter}")
    expect(aoMudar).toHaveBeenLastCalledWith([caio])

    expect(campo).toHaveAttribute("aria-expanded", "true")
    await userEvent.keyboard("{Escape}")
    expect(campo).toHaveAttribute("aria-expanded", "false")

    await userEvent.keyboard("{Backspace}")
    expect(aoMudar).toHaveBeenLastCalledWith([])
  })

  it("no limite, quem não está marcado fica desabilitado", async () => {
    servidor(200)
    const aoMudar = vi.fn()
    render(<Com iniciais={[ana]} sugestoes={[ana, bia]} maximo={1} aoMudar={aoMudar} />)

    expect(screen.getByText("Limite de 1 pessoa marcada.")).toBeInTheDocument()
    expect(screen.getByRole("option", { name: /Bia Lima/ })).toHaveAttribute("aria-disabled", "true")
    await userEvent.click(screen.getByRole("option", { name: /Bia Lima/ }))
    expect(aoMudar).not.toHaveBeenCalled()

    // Desmarcar quem já está continua valendo.
    await userEvent.click(screen.getByRole("option", { name: /Ana Souza/ }))
    expect(aoMudar).toHaveBeenLastCalledWith([])
  })

  it("401 pede para entrar de novo; erro oferece Tentar de novo, que busca outra vez", async () => {
    servidor(401)
    const a = render(<Com />)
    await userEvent.type(screen.getByRole("combobox"), "ana")
    expect(await screen.findByText("Sua sessão expirou. Entre de novo para buscar.")).toBeInTheDocument()
    a.unmount()

    const fetch = servidor(500)
    render(<Com />)
    await userEvent.type(screen.getByRole("combobox"), "ana")
    await userEvent.click(await screen.findByRole("button", { name: "Tentar de novo" }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  })

  it("desabilitado: campo e fichas travados", () => {
    servidor(200)
    render(<Com iniciais={[ana]} desabilitado />)
    expect(screen.getByRole("combobox")).toBeDisabled()
    expect(screen.getByRole("button", { name: "Remover a marcação de @ana" })).toBeDisabled()
  })
})
