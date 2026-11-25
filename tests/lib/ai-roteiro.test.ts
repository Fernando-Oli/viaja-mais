import { describe, it, expect } from "vitest"
import { normalizarRoteiro, roteiroSchema, LIMITES_DO_ROTEIRO } from "@/lib/ai/roteiro"
import { ErroHttp } from "@/lib/http"

/**
 * `normalizarRoteiro` é a guarda entre a saída do modelo e a tela: aproveita o
 * que dá, descarta o resto e lança 502 quando não sobra nada.
 *
 * @RF12.1
 */

const item = (extra: Record<string, unknown> = {}) => ({
  horario: "10:00",
  titulo: "Museu",
  descricao: "Uma frase",
  local: "Centro",
  categoria: "attraction",
  ...extra,
})

function esperar502(fn: () => unknown) {
  try {
    fn()
  } catch (erro) {
    expect(erro).toBeInstanceOf(ErroHttp)
    expect((erro as ErroHttp).status).toBe(502)
    return
  }
  throw new Error("deveria ter lançado 502")
}

describe("normalizarRoteiro", () => {
  it("aceita um roteiro bem formado e devolve exatamente o formato do schema", () => {
    const roteiro = normalizarRoteiro({ dias: [{ titulo: "Chegada", itens: [item()] }] }, 1)

    expect(roteiro).toEqual({
      dias: [
        {
          titulo: "Chegada",
          itens: [{ horario: "10:00", titulo: "Museu", descricao: "Uma frase", local: "Centro", categoria: "attraction" }],
        },
      ],
    })
    expect(roteiroSchema.safeParse(roteiro).success).toBe(true)
  })

  it.each([[null], [undefined], ["texto"], [42], [[]], [{}], [{ dias: "não é lista" }]])(
    "502 para resposta que não é um roteiro (%j)",
    (bruto) => esperar502(() => normalizarRoteiro(bruto, 3)),
  )

  it("502 quando nenhum item é aproveitável", () => {
    esperar502(() => normalizarRoteiro({ dias: [{ titulo: "x", itens: [item({ horario: "manhã" })] }] }, 1))
  })

  it("só os dias pedidos contam: o 'bônus' do modelo é cortado", () => {
    const dias = Array.from({ length: 5 }, (_, i) => ({ titulo: `D${i}`, itens: [item()] }))

    expect(normalizarRoteiro({ dias }, 3).dias.map((d) => d.titulo)).toEqual(["D0", "D1", "D2"])
  })

  it("diasPedidos zero ou negativo não aproveita nada", () => {
    esperar502(() => normalizarRoteiro({ dias: [{ titulo: "x", itens: [item()] }] }, 0))
    esperar502(() => normalizarRoteiro({ dias: [{ titulo: "x", itens: [item()] }] }, -1))
  })

  it("descarta item sem título, com título só de espaços ou que não é objeto", () => {
    const roteiro = normalizarRoteiro(
      { dias: [{ titulo: "x", itens: [item({ titulo: undefined }), item({ titulo: "   " }), "lixo", null, item()] }] },
      1,
    )

    expect(roteiro.dias[0].itens).toHaveLength(1)
  })

  it.each([
    ["9:05", "09:05"],
    ["09:05:00", "09:05"],
    [" 23:59 ", "23:59"],
  ])("normaliza o horário %j para %j", (bruto, esperado) => {
    expect(normalizarRoteiro({ dias: [{ titulo: "x", itens: [item({ horario: bruto })] }] }, 1).dias[0].itens[0].horario).toBe(
      esperado,
    )
  })

  it.each([["24:00"], ["12:60"], ["manhã"], ["1200"], [900], [null]])("descarta horário inválido (%j)", (horario) => {
    const roteiro = normalizarRoteiro({ dias: [{ titulo: "x", itens: [item({ horario }), item()] }] }, 1)

    expect(roteiro.dias[0].itens).toHaveLength(1)
  })

  it("categoria desconhecida vira activity; conhecida fica", () => {
    const roteiro = normalizarRoteiro(
      { dias: [{ titulo: "x", itens: [item({ categoria: "balada" }), item({ horario: "11:00", categoria: "restaurant" })] }] },
      1,
    )

    expect(roteiro.dias[0].itens.map((i) => i.categoria)).toEqual(["activity", "restaurant"])
  })

  it("ordena por horário e mantém a ordem do modelo no empate", () => {
    const roteiro = normalizarRoteiro(
      {
        dias: [
          {
            titulo: "x",
            itens: [item({ horario: "20:00", titulo: "C" }), item({ horario: "08:00", titulo: "A" }), item({ horario: "20:00", titulo: "D" }), item({ horario: "12:00", titulo: "B" })],
          },
        ],
      },
      1,
    )

    expect(roteiro.dias[0].itens.map((i) => i.titulo)).toEqual(["A", "B", "C", "D"])
  })

  it(`no máximo ${LIMITES_DO_ROTEIRO.itensPorDia} itens por dia, os primeiros do dia`, () => {
    const itens = Array.from({ length: 12 }, (_, i) => item({ horario: `${String(8 + i).padStart(2, "0")}:00`, titulo: `I${i}` }))

    const roteiro = normalizarRoteiro({ dias: [{ titulo: "x", itens }] }, 1)

    expect(roteiro.dias[0].itens).toHaveLength(LIMITES_DO_ROTEIRO.itensPorDia)
    expect(roteiro.dias[0].itens[0].titulo).toBe("I0")
  })

  it("corta textos no limite, por caractere, e colapsa espaços", () => {
    const longo = "á".repeat(500)
    const roteiro = normalizarRoteiro(
      { dias: [{ titulo: longo, itens: [item({ titulo: longo, descricao: longo, local: `  muito\n\n  ${longo}` })] }] },
      1,
    )
    const [dia] = roteiro.dias

    expect(Array.from(dia.titulo)).toHaveLength(LIMITES_DO_ROTEIRO.tituloDoDia)
    expect(Array.from(dia.itens[0].titulo)).toHaveLength(LIMITES_DO_ROTEIRO.tituloDoItem)
    expect(Array.from(dia.itens[0].descricao!)).toHaveLength(LIMITES_DO_ROTEIRO.descricao)
    expect(dia.itens[0].local!.startsWith("muito á")).toBe(true)
    expect(Array.from(dia.itens[0].local!).length).toBeLessThanOrEqual(LIMITES_DO_ROTEIRO.local)
  })

  it("descrição e local ausentes, vazios ou de outro tipo viram null", () => {
    const roteiro = normalizarRoteiro({ dias: [{ titulo: "x", itens: [item({ descricao: "", local: 7 })] }] }, 1)

    expect(roteiro.dias[0].itens[0]).toMatchObject({ descricao: null, local: null })
  })

  // Regressão (revisão de 20/11): o dia sem item sumia e os seguintes andavam uma
  // data para trás — o check-out do dia 3 era gravado no dia 2. Agora o dia fica
  // no lugar, vazio, e cada dia mantém a sua posição (= a sua data).
  it("dia sem item aproveitável fica no lugar, vazio; dia sem título ganha 'Dia N'", () => {
    const roteiro = normalizarRoteiro(
      { dias: [{ titulo: "Vazio", itens: [] }, "lixo", { itens: [item()] }, { titulo: "Sem lista" }] },
      4,
    )

    expect(roteiro.dias.map((d) => [d.titulo, d.itens.length])).toEqual([
      ["Vazio", 0],
      ["Dia 2", 0],
      ["Dia 3", 1],
      ["Sem lista", 0],
    ])
  })

  it("chaves extras do modelo não passam adiante", () => {
    const roteiro = normalizarRoteiro({ dias: [{ titulo: "x", extra: 1, itens: [item({ preco: 999 })] }], extra: true }, 1)

    expect(Object.keys(roteiro)).toEqual(["dias"])
    expect(Object.keys(roteiro.dias[0])).toEqual(["titulo", "itens"])
    expect(Object.keys(roteiro.dias[0].itens[0]).sort()).toEqual(["categoria", "descricao", "horario", "local", "titulo"])
  })
})
