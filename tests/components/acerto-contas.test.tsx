// @vitest-environment jsdom
import { Suspense } from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { Acerto } from "@/lib/finance/acerto"

/**
 * Tela de acerto de contas: carregamento, erro com nova tentativa, viagem sem
 * despesas, "Tudo acertado", saldos e transferências. A tela não calcula: o
 * acerto chega pronto da API. Feedback só por `toast()` — `alert`/`confirm`
 * vigiados em todos os casos.
 *
 * @RF06.11 saldo por membro · @RF06.13 transferências sugeridas
 */

const TRIP = "trip-1"
const ANA = "a"
const BRUNO = "b"
const CARLA = "c"

const h = vi.hoisted(() => ({ toast: vi.fn() }))

vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: h.toast }) }))

import AcertoContasPage from "@/app/dashboard/trips/[id]/acerto/page"

const voce = { userId: BRUNO, rotulo: "Você", papel: "member" as const }
const dona = { userId: ANA, rotulo: "Participante 2", papel: "owner" as const }
const carla = { userId: CARLA, rotulo: "Participante 3", papel: "member" as const }

const COM_SALDOS: Acerto = {
  usuarioAtualId: BRUNO,
  totalDespesas: 2,
  despesasSemRateio: 0,
  tudoAcertado: false,
  grupos: [
    {
      moeda: "BRL",
      saldos: [
        { ...voce, valor: -15 },
        { ...dona, valor: 1234.56 },
        { ...carla, valor: 0 },
      ],
      transferencias: [
        { de: carla, para: dona, valor: 30 },
        { de: voce, para: dona, valor: 15 },
      ],
    },
  ],
}

const SEM_DESPESAS: Acerto = {
  usuarioAtualId: BRUNO,
  totalDespesas: 0,
  despesasSemRateio: 0,
  tudoAcertado: false,
  grupos: [{ moeda: "BRL", saldos: [voce, dona, carla].map((p) => ({ ...p, valor: 0 })), transferencias: [] }],
}

const QUITE: Acerto = { ...SEM_DESPESAS, totalDespesas: 3, tudoAcertado: true }

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
  // Promise já resolvida, no formato que o `use()` do React lê sem suspender.
  const params = Object.assign(Promise.resolve({ id: TRIP }), { status: "fulfilled", value: { id: TRIP } })
  render(
    <Suspense fallback={null}>
      <AcertoContasPage params={params} />
    </Suspense>,
  )
  await screen.findByRole("heading", { name: "Acerto de contas" })
  return usuario
}

/** Texto visível com espaços normalizados (o Intl usa espaço não separável). */
const texto = (el: HTMLElement) => el.textContent?.replace(/\s+/g, " ").trim()

beforeEach(() => {
  h.toast.mockReset()
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

describe("Acerto de contas — carregamento e erro", () => {
  it("mostra o carregamento enquanto a API não responde", async () => {
    const fetch = usarFetch(new Promise<Resposta>(() => {}))
    await abrirPagina()

    expect(screen.getByText("Carregando acerto de contas...")).toBeInTheDocument()
    expect(screen.queryByTestId("saldo-membro")).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(`/api/trips/${TRIP}/acerto`)
  })

  it("mostra o erro, avisa por toast e carrega ao tentar novamente", async () => {
    const fetch = usarFetch(falha(500, { error: "Erro interno do servidor" }), ok(COM_SALDOS))
    const usuario = await abrirPagina()

    expect(await screen.findByRole("alert")).toHaveTextContent("Não foi possível carregar o acerto de contas.")
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive", description: "Não foi possível carregar o acerto de contas" }),
    )

    await usuario.click(screen.getByRole("button", { name: "Tentar novamente" }))

    expect(await screen.findAllByTestId("saldo-membro")).toHaveLength(3)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it("resposta 200 sem o formato esperado também é erro", async () => {
    usarFetch(ok({ inesperado: true }))
    await abrirPagina()

    expect(await screen.findByRole("alert")).toBeInTheDocument()
    expect(h.toast).toHaveBeenCalledTimes(1)
  })

  it("corpo que não é JSON é tratado como erro, sem quebrar a tela", async () => {
    usarFetch({ ok: false, status: 502, json: () => Promise.reject(new SyntaxError("não é JSON")) })
    await abrirPagina()

    expect(await screen.findByRole("alert")).toBeInTheDocument()
  })
})

describe("Acerto de contas — saldos e transferências", () => {
  it("saldo positivo, negativo e zero, com texto além da cor e valores em R$", async () => {
    usarFetch(ok(COM_SALDOS))
    await abrirPagina()

    const linhas = await screen.findAllByTestId("saldo-membro")
    expect(linhas.map(texto)).toEqual([
      "Você Membro deve R$ 15,00",
      "Participante 2 Dono a receber R$ 1.234,56",
      "Participante 3 Membro quite R$ 0,00",
    ])
  })

  it('transferências no formato "X paga R$ Y para Z"', async () => {
    usarFetch(ok(COM_SALDOS))
    await abrirPagina()

    const transferencias = await screen.findAllByTestId("transferencia")
    expect(transferencias.map(texto)).toEqual([
      "Participante 3 paga R$ 30,00 para Participante 2",
      "Você paga R$ 15,00 para Participante 2",
    ])
    expect(screen.queryByText(/Tudo acertado/)).not.toBeInTheDocument()
  })

  it("link de volta para a aba Despesas da viagem", async () => {
    usarFetch(ok(COM_SALDOS))
    await abrirPagina()

    expect(screen.getByRole("link", { name: /Voltar para a viagem/ })).toHaveAttribute(
      "href",
      `/dashboard/trips/${TRIP}?aba=despesas`,
    )
  })

  it("duas moedas: um bloco por moeda, cada um com o seu símbolo", async () => {
    usarFetch(
      ok({
        ...COM_SALDOS,
        grupos: [
          COM_SALDOS.grupos[0],
          {
            moeda: "EUR",
            saldos: [
              { ...voce, valor: -10 },
              { ...dona, valor: 10 },
            ],
            transferencias: [{ de: voce, para: dona, valor: 10 }],
          },
        ],
      }),
    )
    await abrirPagina()

    const grupos = await screen.findAllByTestId("grupo-moeda")
    expect(grupos).toHaveLength(2)
    expect(within(grupos[0]).getByText("Saldo por membro (BRL)")).toBeInTheDocument()
    expect(texto(within(grupos[1]).getByTestId("transferencia"))).toBe("Você paga € 10,00 para Participante 2")
  })
})

describe("Acerto de contas — estados vazios", () => {
  it("viagem sem despesas: mensagem, link para adicionar e todos em R$ 0,00", async () => {
    usarFetch(ok(SEM_DESPESAS))
    await abrirPagina()

    expect(await screen.findByText("Nenhuma despesa lançada nesta viagem ainda.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Adicionar Despesa" })).toHaveAttribute(
      "href",
      `/dashboard/trips/${TRIP}/expenses/new`,
    )
    expect(screen.getAllByTestId("saldo-membro").map(texto).every((t) => t?.endsWith("quite R$ 0,00"))).toBe(true)
    expect(screen.queryByTestId("transferencia")).not.toBeInTheDocument()
  })

  it('saldos zerados: "Tudo acertado" e nenhuma transferência', async () => {
    usarFetch(ok(QUITE))
    await abrirPagina()

    expect(await screen.findByText("Tudo acertado: ninguém deve nada a ninguém.")).toBeInTheDocument()
    expect(screen.getByText("Nenhuma transferência necessária nesta moeda.")).toBeInTheDocument()
    expect(screen.queryByTestId("transferencia")).not.toBeInTheDocument()
  })

  it("avisa quantas despesas ficaram fora por não terem divisão", async () => {
    usarFetch(ok({ ...COM_SALDOS, totalDespesas: 4, despesasSemRateio: 2 }))
    await abrirPagina()

    expect(
      await screen.findByText("2 despesas sem divisão entre participantes não entram no acerto."),
    ).toBeInTheDocument()
  })

  it("uma despesa sem divisão: mensagem no singular", async () => {
    usarFetch(ok({ ...COM_SALDOS, totalDespesas: 3, despesasSemRateio: 1 }))
    await abrirPagina()

    expect(await screen.findByText("1 despesa sem divisão entre participantes não entra no acerto.")).toBeInTheDocument()
  })

  it("ex-participante aparece identificado", async () => {
    usarFetch(
      ok({
        ...COM_SALDOS,
        grupos: [
          {
            moeda: "BRL",
            saldos: [
              { ...voce, valor: 5 },
              { userId: "x", rotulo: "Ex-participante", papel: "ex", valor: -5 },
            ],
            transferencias: [],
          },
        ],
      }),
    )
    await abrirPagina()

    const linhas = await screen.findAllByTestId("saldo-membro")
    expect(texto(linhas[1])).toBe("Ex-participante Saiu da viagem deve R$ 5,00")
  })
})

/**
 * S08 — registrar pagamento. A tela só envia o pedido e busca o acerto de novo:
 * o saldo novo vem da API. `fetch` aqui é roteado por método, para provar a
 * sequência GET → POST → GET.
 *
 * @RF06.13 registrar como paga uma transferência do acerto
 */
describe("Acerto de contas — registrar pagamento", () => {
  type Chamada = { url: string; metodo: string; corpo: Record<string, unknown> | null }

  // Uma resposta de POST pode ser uma fábrica: rejeição criada antes da hora
  // vira "unhandled rejection" no Vitest.
  type RespostaPost = Resposta | Promise<Resposta> | (() => Promise<Resposta>)

  function rotearFetch(opcoes: { acertos: Acerto[]; post: RespostaPost[] }) {
    const chamadas: Chamada[] = []
    const acertos = [...opcoes.acertos]
    const posts = [...opcoes.post]
    const fn = vi.fn((url: string, init?: RequestInit) => {
      const metodo = init?.method ?? "GET"
      chamadas.push({ url, metodo, corpo: init?.body ? JSON.parse(String(init.body)) : null })
      if (metodo === "POST") {
        const resposta = posts.length > 1 ? posts.shift()! : posts[0]
        return typeof resposta === "function" ? resposta() : Promise.resolve(resposta)
      }
      return Promise.resolve(ok(acertos.length > 1 ? acertos.shift()! : acertos[0]))
    })
    vi.stubGlobal("fetch", fn)
    return chamadas
  }

  const DEPOIS_DO_PAGAMENTO: Acerto = {
    ...COM_SALDOS,
    grupos: [
      {
        moeda: "BRL",
        saldos: [
          { ...voce, valor: 0 },
          { ...dona, valor: 30 },
          { ...carla, valor: -30 },
        ],
        transferencias: [{ de: carla, para: dona, valor: 30 }],
      },
    ],
  }

  it("o botão aparece só nas transferências que saem de quem consulta", async () => {
    rotearFetch({ acertos: [COM_SALDOS], post: [] })
    await abrirPagina()

    const linhas = await screen.findAllByTestId("linha-transferencia")
    expect(within(linhas[0]).queryByRole("button", { name: "Registrar pagamento" })).not.toBeInTheDocument()
    expect(within(linhas[1]).getByRole("button", { name: "Registrar pagamento" })).toBeInTheDocument()
  })

  it("confirma o valor sugerido, desabilita durante o envio, avisa por toast e recarrega o acerto", async () => {
    let responder: (r: Resposta) => void = () => {}
    const pendente = new Promise<Resposta>((r) => {
      responder = r
    })
    const chamadas = rotearFetch({ acertos: [COM_SALDOS, DEPOIS_DO_PAGAMENTO], post: [pendente] })
    const usuario = await abrirPagina()

    await usuario.click(await screen.findByRole("button", { name: "Registrar pagamento" }))
    const dialogo = await screen.findByRole("dialog")
    expect(within(dialogo).getByLabelText("Valor pago (BRL)")).toHaveValue("15,00")
    expect(texto(within(dialogo).getByText(/Confirme quanto você já pagou/))).toContain("para Participante 2")

    await usuario.click(within(dialogo).getByRole("button", { name: "Confirmar pagamento" }))

    expect(within(dialogo).getByRole("button", { name: "Registrando..." })).toBeDisabled()
    expect(within(dialogo).getByRole("button", { name: "Cancelar" })).toBeDisabled()
    const post = chamadas.find((c) => c.metodo === "POST")!
    expect(post.url).toBe(`/api/trips/${TRIP}/acerto/transferencias`)
    expect(post.corpo).toMatchObject({ de: BRUNO, para: ANA, valor: "15,00", moeda: "BRL" })
    expect(post.corpo?.chave).toMatch(/^[0-9a-f-]{36}$/)

    responder({ ok: true, status: 201, json: () => Promise.resolve({ transferencia: {} }) })

    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(h.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Pagamento registrado" }))
    await vi.waitFor(() =>
      expect(screen.getAllByTestId("transferencia").map(texto)).toEqual([
        "Participante 3 paga R$ 30,00 para Participante 2",
      ]),
    )
    expect(texto(screen.getAllByTestId("saldo-membro")[0])).toBe("Você Membro quite R$ 0,00")
    expect(screen.queryByRole("button", { name: "Registrar pagamento" })).not.toBeInTheDocument()
    expect(chamadas.map((c) => c.metodo)).toEqual(["GET", "POST", "GET"])
  })

  it("pagamento parcial: envia o valor editado", async () => {
    const chamadas = rotearFetch({ acertos: [COM_SALDOS], post: [ok({ transferencia: {} })] })
    const usuario = await abrirPagina()

    await usuario.click(await screen.findByRole("button", { name: "Registrar pagamento" }))
    const campo = await screen.findByLabelText("Valor pago (BRL)")
    await usuario.clear(campo)
    await usuario.type(campo, "5,50")
    await usuario.click(screen.getByRole("button", { name: "Confirmar pagamento" }))

    await vi.waitFor(() => expect(chamadas.some((c) => c.metodo === "POST")).toBe(true))
    expect(chamadas.find((c) => c.metodo === "POST")?.corpo).toMatchObject({ valor: "5,50" })
  })

  it("valor inválido não é enviado e o campo explica o porquê", async () => {
    const chamadas = rotearFetch({ acertos: [COM_SALDOS], post: [] })
    const usuario = await abrirPagina()

    await usuario.click(await screen.findByRole("button", { name: "Registrar pagamento" }))
    const campo = await screen.findByLabelText("Valor pago (BRL)")
    await usuario.clear(campo)
    await usuario.type(campo, "0")
    await usuario.click(screen.getByRole("button", { name: "Confirmar pagamento" }))

    expect(screen.getByText("Informe um valor maior que zero, com até duas casas.")).toBeInTheDocument()
    expect(campo).toHaveAttribute("aria-invalid", "true")
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false)
  })

  it("erro da API: toast com a mensagem, diálogo aberto e nova tentativa com a mesma chave", async () => {
    const chamadas = rotearFetch({
      acertos: [COM_SALDOS, DEPOIS_DO_PAGAMENTO],
      post: [falha(422, { error: "O valor passa da dívida atual do pagador (R$ 15,00)" }), ok({ transferencia: {} })],
    })
    const usuario = await abrirPagina()

    await usuario.click(await screen.findByRole("button", { name: "Registrar pagamento" }))
    await usuario.click(await screen.findByRole("button", { name: "Confirmar pagamento" }))

    await vi.waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: "O valor passa da dívida atual do pagador (R$ 15,00)",
        }),
      ),
    )
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    await vi.waitFor(() => expect(screen.getByRole("button", { name: "Confirmar pagamento" })).toBeEnabled())

    await usuario.click(screen.getByRole("button", { name: "Confirmar pagamento" }))
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    const posts = chamadas.filter((c) => c.metodo === "POST")
    expect(posts).toHaveLength(2)
    expect(posts[1].corpo?.chave).toBe(posts[0].corpo?.chave)
  })

  it("falha de rede no envio: toast genérico, sem quebrar a tela", async () => {
    rotearFetch({ acertos: [COM_SALDOS], post: [() => Promise.reject(new TypeError("Failed to fetch"))] })
    const usuario = await abrirPagina()

    await usuario.click(await screen.findByRole("button", { name: "Registrar pagamento" }))
    await usuario.click(await screen.findByRole("button", { name: "Confirmar pagamento" }))

    await vi.waitFor(() =>
      expect(h.toast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive", description: "Não foi possível registrar o pagamento" }),
      ),
    )
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("cancelar fecha o diálogo sem enviar nada", async () => {
    const chamadas = rotearFetch({ acertos: [COM_SALDOS], post: [] })
    const usuario = await abrirPagina()

    await usuario.click(await screen.findByRole("button", { name: "Registrar pagamento" }))
    await usuario.click(await screen.findByRole("button", { name: "Cancelar" }))

    await vi.waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(chamadas.some((c) => c.metodo === "POST")).toBe(false)
  })
})
