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
