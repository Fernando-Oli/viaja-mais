// @vitest-environment jsdom
import { describe, it, expect } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { PerfilCabecalho, podeVerRedeDo, type PerfilDoCabecalho } from "@/components/social/perfil-cabecalho"

/**
 * @RF02.1 @RF09.6 @RF09.16 — o cabeçalho de perfil (S06-M-perfil-instagram),
 * o mesmo em /dashboard/perfil e em /u/<username>: os três contadores, quando
 * seguidores e seguindo viram link para as listas, o "—" do contador nulo, o
 * selo de visibilidade e o espaço dos botões.
 */

const ANA: PerfilDoCabecalho = {
  username: "ana",
  full_name: "Ana Teste",
  avatar_url: null,
  bio: "Gosto de trilhas.",
  is_public: true,
  vinculo: "proprio",
  seguidores: 34,
  seguindo: 1,
  publicacoes: 12,
}

const contadores = () => within(screen.getByRole("list", { name: "Contadores do perfil" }))

describe("PerfilCabecalho", () => {
  it("@RF02.1 mostra nome, @username, bio e os três contadores", () => {
    render(<PerfilCabecalho perfil={ANA} />)

    expect(screen.getByRole("region", { name: "Perfil de @ana" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 1, name: "Ana Teste" })).toBeTruthy()
    expect(screen.getByText("@ana")).toBeTruthy()
    expect(screen.getByText("Gosto de trilhas.")).toBeTruthy()
    const itens = contadores().getAllByRole("listitem").map((li) => li.textContent)
    expect(itens).toEqual(["12 publicações", "34 seguidores", "1 seguindo"])
  })

  it("@RF09.6 com a rede visível, seguidores e seguindo levam às listas; publicações não é link", () => {
    render(<PerfilCabecalho perfil={ANA} />)

    expect(contadores().getByRole("link", { name: "34 seguidores" }).getAttribute("href")).toBe("/u/ana/seguidores")
    expect(contadores().getByRole("link", { name: "1 seguindo" }).getAttribute("href")).toBe("/u/ana/seguindo")
    expect(contadores().queryByRole("link", { name: /publica/ })).toBeNull()
  })

  it("@RF09.6 perfil privado de quem não segue: contadores sem link", () => {
    render(<PerfilCabecalho perfil={{ ...ANA, vinculo: "nenhum", is_public: false, publicacoes: null }} />)

    expect(contadores().queryAllByRole("link")).toHaveLength(0)
    expect(screen.getByText("Perfil privado")).toBeTruthy()
  })

  it("@RF09.16 contador nulo aparece como —, e o singular quando é 1", () => {
    render(<PerfilCabecalho perfil={{ ...ANA, publicacoes: null, seguidores: 1, seguindo: null }} />)

    const itens = contadores().getAllByRole("listitem").map((li) => li.textContent)
    expect(itens).toEqual(["— publicações", "1 seguidor", "— seguindo"])
  })

  it("o número sai no formato pt-BR", () => {
    render(<PerfilCabecalho perfil={{ ...ANA, seguidores: 1234 }} />)

    expect(contadores().getByRole("link", { name: "1.234 seguidores" })).toBeTruthy()
  })

  it.each([
    [true, "Público"],
    [false, "Privado"],
  ])("@RF02.1 no próprio perfil, o selo diz a visibilidade (público = %s)", (is_public, selo) => {
    render(<PerfilCabecalho perfil={{ ...ANA, is_public }} />)

    expect(screen.getByText(selo)).toBeTruthy()
    expect(screen.queryByText("Perfil privado")).toBeNull()
  })

  it("no perfil público de outra pessoa não há selo", () => {
    render(<PerfilCabecalho perfil={{ ...ANA, vinculo: "nenhum" }} />)

    expect(screen.queryByText(/^(Público|Privado|Perfil privado)$/)).toBeNull()
  })

  it("sem nome, o título é o username; sem foto, o ícone com nome acessível", () => {
    render(<PerfilCabecalho perfil={{ ...ANA, full_name: null }} />)

    expect(screen.getByRole("heading", { level: 1, name: "ana" })).toBeTruthy()
    expect(screen.getByRole("img", { name: "Sem foto de perfil" })).toBeTruthy()
  })

  it("sem bio, nenhum parágrafo vazio; os botões e o children entram no cartão", () => {
    render(
      <PerfilCabecalho perfil={{ ...ANA, bio: null }} acoes={<button type="button">Editar perfil</button>}>
        <p role="status">aviso</p>
      </PerfilCabecalho>,
    )

    const cartao = within(screen.getByRole("region", { name: "Perfil de @ana" }))
    expect(cartao.getByRole("button", { name: "Editar perfil" })).toBeTruthy()
    expect(cartao.getByRole("status").textContent).toBe("aviso")
    expect(screen.queryByText("Gosto de trilhas.")).toBeNull()
  })
})

describe("podeVerRedeDo", () => {
  it.each([
    ["proprio", false, true],
    ["seguindo", false, true],
    ["solicitado", false, false],
    ["nenhum", false, false],
    ["nenhum", true, true],
  ] as const)("vínculo %s, público %s → %s", (vinculo, is_public, esperado) => {
    expect(podeVerRedeDo({ vinculo, is_public })).toBe(esperado)
  })
})
