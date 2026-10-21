// @vitest-environment jsdom
import { Suspense } from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

/**
 * Tela de nova despesa com rateio: as três formas de divisão, a prévia de cada
 * parte, o bloqueio do envio enquanto o rateio não fecha e os estados de
 * carregamento e erro. Feedback só por `toast()` — `alert`/`confirm` vigiados.
 *
 * @RF06.9 @RF06.10
 */

const A = "11111111-1111-4111-8111-111111111111"
const B = "22222222-2222-4222-8222-222222222222"
const C = "33333333-3333-4333-8333-333333333333"
const TRIP = "trip-1"

const h = vi.hoisted(() => ({
  toast: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}))

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, refresh: h.refresh }) }))
vi.mock("@/context/auth-context", () => ({ useAuth: () => ({ user: { id: A } }) }))

import NewExpensePage from "@/app/dashboard/trips/[id]/expenses/new/page"

const MEMBROS = [
  { user_id: C, role: "member" },
  { user_id: B, role: "owner" },
  { user_id: A, role: "member" },
]

type Resposta = { ok: boolean; status?: number; json: () => Promise<unknown> }
const ok = (corpo: unknown): Resposta => ({ ok: true, json: () => Promise.resolve(corpo) })
const falha = (status: number, corpo: unknown): Resposta => ({ ok: false, status, json: () => Promise.resolve(corpo) })

let alerta: ReturnType<typeof vi.fn>
let confirmacao: ReturnType<typeof vi.fn>

function usarFetch(...respostas: (Resposta | Promise<Resposta>)[]) {
  const fila = [...respostas]
  const fn = vi.fn(() => Promise.resolve(fila.length > 1 ? fila.shift()! : fila[0]))
  vi.stubGlobal("fetch", fn)
  return fn
}

async function abrirPagina() {
  const usuario = userEvent.setup()
  // Promise já marcada como resolvida, no formato que o `use()` do React lê:
  // assim a página não suspende no primeiro render do teste.
  const params = Object.assign(Promise.resolve({ id: TRIP }), { status: "fulfilled", value: { id: TRIP } })
  render(
    <Suspense fallback={null}>
      <NewExpensePage params={params} />
    </Suspense>,
  )
  await screen.findByRole("heading", { name: "Nova Despesa" })
  return usuario
}

async function preencherDespesa(usuario: ReturnType<typeof userEvent.setup>, valor: string) {
  await usuario.type(screen.getByLabelText("Descrição *"), "Jantar")
  await usuario.type(screen.getByLabelText("Valor *"), valor)
}

const partesNaTela = () => screen.getAllByTestId("parte-rateio").map((el) => el.textContent?.replace(/\s/g, " "))
const botaoSalvar = () => screen.getByRole("button", { name: /Salvar Despesa|Salvando/ })

// O Checkbox do Radix mede o próprio tamanho; o jsdom não tem ResizeObserver.
class ResizeObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverFalso)
  alerta = vi.fn()
  confirmacao = vi.fn()
  vi.stubGlobal("alert", alerta)
  vi.stubGlobal("confirm", confirmacao)
})

afterEach(() => {
  vi.unstubAllGlobals()
  expect(alerta, "alert() não pode ser usado").not.toHaveBeenCalled()
  expect(confirmacao, "confirm() não pode ser usado").not.toHaveBeenCalled()
})

describe("Nova despesa — carregamento e erro dos participantes", () => {
  it("mostra o carregamento e mantém o envio desabilitado", async () => {
    usarFetch(new Promise<Resposta>(() => {}))
    await abrirPagina()

    expect(screen.getByText("Carregando participantes...")).toBeInTheDocument()
    expect(botaoSalvar()).toBeDisabled()
  })

  it("mostra o erro, avisa por toast e permite tentar de novo", async () => {
    const fetch = usarFetch(falha(500, { error: "Erro interno do servidor" }), ok({ trip: { trip_members: MEMBROS } }))
    const usuario = await abrirPagina()

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar os participantes")
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" }))
    expect(botaoSalvar()).toBeDisabled()

    await usuario.click(screen.getByRole("button", { name: "Tentar novamente" }))

    expect(await screen.findAllByTestId("participante-rateio")).toHaveLength(3)
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})

describe("Nova despesa — divisão igual", () => {
  it("R$ 10,00 entre 3: prévia 3,34 + 3,33 + 3,33, soma 10,00, e envia o rateio", async () => {
    const fetch = usarFetch(ok({ trip: { trip_members: MEMBROS } }), ok({ expense: { id: "exp-1" }, shares: [] }))
    const usuario = await abrirPagina()
    await screen.findAllByTestId("participante-rateio")

    // Quem lança aparece primeiro, depois o dono.
    const linhas = screen.getAllByTestId("participante-rateio")
    expect(within(linhas[0]).getByText("Você")).toBeInTheDocument()
    expect(within(linhas[1]).getByText("Dono")).toBeInTheDocument()

    await preencherDespesa(usuario, "10.00")

    expect(partesNaTela()).toEqual(["R$ 3,34", "R$ 3,33", "R$ 3,33"])
    expect(screen.getByTestId("rateio-soma").textContent?.replace(/\s/g, " ")).toBe("R$ 10,00")
    expect(screen.getByText("A soma das partes fecha com o total.")).toBeInTheDocument()
    expect(botaoSalvar()).toBeEnabled()

    await usuario.click(botaoSalvar())

    await waitFor(() => expect(h.push).toHaveBeenCalledWith(`/dashboard/trips/${TRIP}?aba=despesas`))
    const [url, init] = fetch.mock.calls[1] as unknown as [string, RequestInit]
    expect(url).toBe(`/api/trips/${TRIP}/expenses`)
    expect(JSON.parse(init.body as string).rateio).toEqual({
      tipo: "equal",
      participantes: [{ user_id: A }, { user_id: B }, { user_id: C }],
    })
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Despesa adicionada" }))
  })

  it("tirar um participante redistribui entre os que ficaram; nenhum selecionado bloqueia", async () => {
    usarFetch(ok({ trip: { trip_members: MEMBROS } }))
    const usuario = await abrirPagina()
    await screen.findAllByTestId("participante-rateio")
    await preencherDespesa(usuario, "10")

    await usuario.click(screen.getByRole("checkbox", { name: "Incluir Participante 3 no rateio" }))
    expect(partesNaTela()).toEqual(["R$ 5,00", "R$ 5,00", "Fora"])

    await usuario.click(screen.getByRole("checkbox", { name: "Incluir Você no rateio" }))
    await usuario.click(screen.getByRole("checkbox", { name: "Incluir Participante 2 no rateio" }))
    expect(screen.getByText("Selecione ao menos um participante")).toBeInTheDocument()
    expect(botaoSalvar()).toBeDisabled()
  })
})

describe("Nova despesa — divisão por peso", () => {
  it("valida peso zero e calcula as partes proporcionais", async () => {
    const fetch = usarFetch(ok({ trip: { trip_members: MEMBROS } }), ok({ expense: { id: "exp-1" } }))
    const usuario = await abrirPagina()
    await screen.findAllByTestId("participante-rateio")
    await preencherDespesa(usuario, "100")

    await usuario.click(screen.getByRole("radio", { name: "Por peso" }))

    const pesoVoce = screen.getByLabelText("Peso de Você")
    await usuario.clear(pesoVoce)
    await usuario.type(pesoVoce, "0")
    expect(pesoVoce).toHaveAttribute("aria-invalid", "true")
    expect(document.getElementById("rateio-status")).toHaveTextContent(/peso maior que zero/)
    expect(botaoSalvar()).toBeDisabled()

    await usuario.clear(pesoVoce)
    await usuario.type(pesoVoce, "2")
    expect(partesNaTela()).toEqual(["R$ 50,00", "R$ 25,00", "R$ 25,00"])
    expect(botaoSalvar()).toBeEnabled()

    await usuario.click(botaoSalvar())
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const [, init] = fetch.mock.calls[1] as unknown as [string, RequestInit]
    expect(JSON.parse(init.body as string).rateio).toEqual({
      tipo: "weight",
      participantes: [
        { user_id: A, peso: "2" },
        { user_id: B, peso: "1" },
        { user_id: C, peso: "1" },
      ],
    })
  })
})

describe("Nova despesa — divisão por valor exato", () => {
  it("mostra soma, quanto falta e quanto excede; só libera quando fecha", async () => {
    usarFetch(ok({ trip: { trip_members: MEMBROS } }), ok({ expense: { id: "exp-1" } }))
    const usuario = await abrirPagina()
    await screen.findAllByTestId("participante-rateio")
    await preencherDespesa(usuario, "100")

    await usuario.click(screen.getByRole("radio", { name: "Valor exato" }))
    const diferenca = () => screen.getByTestId("rateio-diferenca").textContent?.replace(/\s/g, " ")

    await usuario.type(screen.getByLabelText("Valor de Você"), "50")
    await usuario.type(screen.getByLabelText("Valor de Participante 2"), "30")
    expect(screen.getByTestId("rateio-soma").textContent?.replace(/\s/g, " ")).toBe("R$ 80,00")
    expect(screen.getByText("Falta")).toBeInTheDocument()
    expect(diferenca()).toBe("R$ 20,00")
    expect(botaoSalvar()).toBeDisabled()

    await usuario.type(screen.getByLabelText("Valor de Participante 3"), "30")
    expect(screen.getByText("Excedeu")).toBeInTheDocument()
    expect(diferenca()).toBe("R$ 10,00")
    expect(document.getElementById("rateio-status")).toHaveTextContent(/excede o total em R\$\s10,00/)
    expect(botaoSalvar()).toBeDisabled()

    await usuario.clear(screen.getByLabelText("Valor de Participante 3"))
    await usuario.type(screen.getByLabelText("Valor de Participante 3"), "20")
    expect(diferenca()).toBe("R$ 0,00")
    expect(botaoSalvar()).toBeEnabled()
  })

  it("erro da API no envio vira toast e o botão volta a ficar disponível", async () => {
    usarFetch(
      ok({ trip: { trip_members: MEMBROS } }),
      falha(400, { error: "A soma das partes não fecha: faltam R$ 1,00" }),
    )
    const usuario = await abrirPagina()
    await screen.findAllByTestId("participante-rateio")
    await preencherDespesa(usuario, "10")

    await usuario.click(botaoSalvar())

    await waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", description: "A soma das partes não fecha: faltam R$ 1,00" }),
      ),
    )
    expect(h.push).not.toHaveBeenCalled()
    expect(botaoSalvar()).toBeEnabled()
  })
})
