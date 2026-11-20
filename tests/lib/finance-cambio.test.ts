import { describe, expect, it } from "vitest"
import {
  converterCentavos,
  ErroCambio,
  totalizarEmMoeda,
} from "@/lib/finance/cambio"

describe("converterCentavos", () => {
  it("faz conversão exata", () => {
    expect(
      converterCentavos({
        valorCentavos: 1000,
        moedaOrigem: "USD",
        moedaDestino: "BRL",
        taxa: "5.25",
      }),
    ).toBe(5250)
  })

  it("aceita vírgula na taxa", () => {
    expect(
      converterCentavos({
        valorCentavos: 1000,
        moedaOrigem: "USD",
        moedaDestino: "BRL",
        taxa: "5,25",
      }),
    ).toBe(5250)
  })

  it("arredonda para baixo quando a fração é menor que meio centavo", () => {
    expect(
      converterCentavos({
        valorCentavos: 1,
        moedaOrigem: "USD",
        moedaDestino: "BRL",
        taxa: "0.49",
      }),
    ).toBe(0)
  })

  it("meio centavo arredonda para cima", () => {
    expect(
      converterCentavos({
        valorCentavos: 1,
        moedaOrigem: "USD",
        moedaDestino: "BRL",
        taxa: "0.5",
      }),
    ).toBe(1)
  })

  it("arredonda valor acima de meio centavo para cima", () => {
    expect(
      converterCentavos({
        valorCentavos: 1,
        moedaOrigem: "USD",
        moedaDestino: "BRL",
        taxa: "1.51",
      }),
    ).toBe(2)
  })

  it("aceita valor zero", () => {
    expect(
      converterCentavos({
        valorCentavos: 0,
        moedaOrigem: "USD",
        moedaDestino: "BRL",
        taxa: "5",
      }),
    ).toBe(0)
  })

  it("taxa 1 preserva o valor", () => {
    expect(
      converterCentavos({
        valorCentavos: 12345,
        moedaOrigem: "USD",
        moedaDestino: "BRL",
        taxa: 1,
      }),
    ).toBe(12345)
  })

  it("mesma moeda não exige taxa e preserva o valor", () => {
    expect(
      converterCentavos({
        valorCentavos: 12345,
        moedaOrigem: "brl",
        moedaDestino: "BRL",
      }),
    ).toBe(12345)
  })

  it("aceita taxa com até oito casas decimais", () => {
    expect(
      converterCentavos({
        valorCentavos: 10000,
        moedaOrigem: "USD",
        moedaDestino: "BRL",
        taxa: "5.12345678",
      }),
    ).toBe(51235)
  })

  it("recusa taxa ausente entre moedas diferentes", () => {
    expect(() =>
      converterCentavos({
        valorCentavos: 100,
        moedaOrigem: "USD",
        moedaDestino: "BRL",
      }),
    ).toThrowError(ErroCambio)

    try {
      converterCentavos({
        valorCentavos: 100,
        moedaOrigem: "USD",
        moedaDestino: "BRL",
      })
    } catch (erro) {
      expect(erro).toBeInstanceOf(ErroCambio)
      expect((erro as ErroCambio).motivo).toBe("taxa-ausente")
    }
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "recusa taxa inválida: %s",
    (taxa) => {
      expect(() =>
        converterCentavos({
          valorCentavos: 100,
          moedaOrigem: "USD",
          moedaDestino: "BRL",
          taxa,
        }),
      ).toThrowError(ErroCambio)
    },
  )

  it("recusa taxa com mais de oito casas decimais", () => {
    expect(() =>
      converterCentavos({
        valorCentavos: 100,
        moedaOrigem: "USD",
        moedaDestino: "BRL",
        taxa: "1.123456789",
      }),
    ).toThrowError(ErroCambio)
  })

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "recusa valor em centavos inválido: %s",
    (valorCentavos) => {
      expect(() =>
        converterCentavos({
          valorCentavos,
          moedaOrigem: "USD",
          moedaDestino: "BRL",
          taxa: "5",
        }),
      ).toThrowError(ErroCambio)
    },
  )

  it.each(["BR", "REAL", "12A"])("recusa código de moeda inválido: %s", (moeda) => {
    expect(() =>
      converterCentavos({
        valorCentavos: 100,
        moedaOrigem: moeda,
        moedaDestino: "BRL",
        taxa: "5",
      }),
    ).toThrowError(ErroCambio)
  })

  it("recusa resultado acima do inteiro seguro", () => {
    expect(() =>
      converterCentavos({
        valorCentavos: Number.MAX_SAFE_INTEGER,
        moedaOrigem: "USD",
        moedaDestino: "BRL",
        taxa: "2",
      }),
    ).toThrowError(ErroCambio)
  })
})

describe("totalizarEmMoeda", () => {
  it("converte cada moeda antes de somar", () => {
    const total = totalizarEmMoeda(
      [
        { valorCentavos: 10000, moeda: "BRL" },
        { valorCentavos: 2000, moeda: "USD" },
      ],
      "BRL",
      { USD: "5" },
    )

    expect(total).toBe(20000)
  })

  it("não exige taxa para valores que já estão na moeda destino", () => {
    expect(
      totalizarEmMoeda(
        [
          { valorCentavos: 1000, moeda: "BRL" },
          { valorCentavos: 2500, moeda: "BRL" },
        ],
        "BRL",
        {},
      ),
    ).toBe(3500)
  })

  it("recusa totalização quando falta uma cotação", () => {
    expect(() =>
      totalizarEmMoeda(
        [
          { valorCentavos: 1000, moeda: "BRL" },
          { valorCentavos: 1000, moeda: "USD" },
        ],
        "BRL",
        {},
      ),
    ).toThrowError(ErroCambio)
  })

  it("mantém cada taxa ligada à sua moeda de origem", () => {
    expect(
      totalizarEmMoeda(
        [
          { valorCentavos: 1000, moeda: "USD" },
          { valorCentavos: 1000, moeda: "EUR" },
        ],
        "BRL",
        {
          USD: "5",
          EUR: "6",
        },
      ),
    ).toBe(11000)
  })

  it("lista vazia totaliza zero", () => {
    expect(totalizarEmMoeda([], "BRL", {})).toBe(0)
  })

  it("recusa estouro no total", () => {
    expect(() =>
      totalizarEmMoeda(
        [
          { valorCentavos: Number.MAX_SAFE_INTEGER, moeda: "BRL" },
          { valorCentavos: 1, moeda: "BRL" },
        ],
        "BRL",
        {},
      ),
    ).toThrowError(ErroCambio)
  })
})