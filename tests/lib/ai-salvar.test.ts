import { describe, it, expect } from "vitest"
import {
  corpoDaViagem,
  corposDosItens,
  datasDaViagem,
  hojeLocal,
  roteiroPronto,
  rotuloDoDia,
  somarDias,
  tituloPadrao,
} from "@/lib/ai/salvar"
import type { DiaDoRoteiro, ItemDoRoteiro } from "@/lib/ai/roteiro"
import { normalizarRoteiro } from "@/lib/ai/roteiro"
import { criarViagemSchema } from "@/lib/schemas/viagem"
import { criarItemItinerarioSchema } from "@/lib/schemas/itinerario"

/**
 * Do roteiro revisado aos corpos das rotas de viagem e de itinerário. Os
 * corpos são conferidos contra os schemas da Audrey: se ela mudar o contrato,
 * este teste quebra antes da tela.
 *
 * @RF12.2
 */

const item = (extra: Partial<ItemDoRoteiro> = {}): ItemDoRoteiro => ({
  horario: "10:00",
  titulo: "Museu",
  descricao: null,
  local: null,
  categoria: "attraction",
  ...extra,
})

describe("datas", () => {
  it.each([
    ["2026-12-12", 0, "2026-12-12"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-01-31", 1, "2026-02-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2026-10-17", 1, "2026-10-18"],
  ])("somarDias(%s, %i) = %s", (inicio, n, esperado) => {
    expect(somarDias(inicio, n)).toBe(esperado)
  })

  it("data malformada é erro de programação, não silêncio", () => {
    expect(() => somarDias("12/12/2026", 1)).toThrow(/data inválida/)
  })

  it("datasDaViagem dá uma data por dia; zero ou negativo dá lista vazia", () => {
    expect(datasDaViagem("2026-12-30", 3)).toEqual(["2026-12-30", "2026-12-31", "2027-01-01"])
    expect(datasDaViagem("2026-12-30", 0)).toEqual([])
    expect(datasDaViagem("2026-12-30", -2)).toEqual([])
  })

  it("rotuloDoDia em português, sem depender do ICU", () => {
    expect(rotuloDoDia("2026-12-12")).toBe("sáb, 12/12")
    expect(rotuloDoDia("2026-11-22")).toBe("dom, 22/11")
    expect(rotuloDoDia("2027-01-04")).toBe("seg, 04/01")
  })

  it("hojeLocal usa a data do fuso de quem usa", () => {
    expect(hojeLocal(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05")
    expect(hojeLocal(new Date(2026, 10, 20, 0, 1))).toBe("2026-11-20")
    expect(hojeLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe("tituloPadrao", () => {
  it("monta e corta no limite da viagem (120)", () => {
    expect(tituloPadrao("  Lisboa ")).toBe("Viagem para Lisboa")
    expect(Array.from(tituloPadrao("ã".repeat(200)))).toHaveLength(120)
  })
})

describe("roteiroPronto", () => {
  const dia = (itens: ItemDoRoteiro[]): DiaDoRoteiro => ({ titulo: "D", itens })

  it("pronto com título e horário em todas as atividades", () => {
    expect(roteiroPronto([dia([item()]), dia([item({ horario: "23:59" })])])).toBe(true)
  })

  it.each([
    ["sem nenhuma atividade", [dia([])]],
    ["lista vazia", []],
    ["título em branco", [dia([item({ titulo: "   " })])]],
    ["horário apagado", [dia([item({ horario: "" })])]],
    ["horário inválido", [dia([item({ horario: "25:00" })])]],
  ])("não pronto: %s", (_caso, dias) => {
    expect(roteiroPronto(dias as DiaDoRoteiro[])).toBe(false)
  })
})

describe("corpoDaViagem", () => {
  it("monta o corpo de POST /api/trips, aceito pelo schema da Audrey", () => {
    const corpo = corpoDaViagem({ titulo: "  Lisboa a dois ", destino: " Lisboa ", inicio: "2026-12-30", dias: 3 })

    expect(corpo).toEqual({
      title: "Lisboa a dois",
      destination: "Lisboa",
      start_date: "2026-12-30",
      end_date: "2027-01-01",
      currency: "BRL",
      status: "planning",
    })
    expect(criarViagemSchema.safeParse(corpo).success).toBe(true)
  })

  it("título em branco cai no padrão; viagem de 1 dia começa e termina no mesmo dia", () => {
    const corpo = corpoDaViagem({ titulo: " ", destino: "Recife", inicio: "2026-12-01", dias: 1 })

    expect(corpo.title).toBe("Viagem para Recife")
    expect(corpo.end_date).toBe("2026-12-01")
  })

  it("textos longos são cortados nos limites do schema", () => {
    const corpo = corpoDaViagem({ titulo: "t".repeat(300), destino: "d".repeat(300), inicio: "2026-12-01", dias: 2 })

    expect(corpo.title).toHaveLength(120)
    expect(corpo.destination).toHaveLength(160)
    expect(criarViagemSchema.safeParse(corpo).success).toBe(true)
  })
})

describe("corposDosItens", () => {
  // Regressão (revisão de 20/11): com o dia 1 descartado pela normalização, as
  // atividades do dia 2 eram gravadas na data do dia 1.
  it("dia que a IA devolveu sem atividade não desloca a data dos seguintes", () => {
    const roteiro = normalizarRoteiro(
      { dias: [{ titulo: "A", itens: [{ horario: "manhã", titulo: "x" }] }, { titulo: "B", itens: [item()] }] },
      2,
    )

    expect(corposDosItens(roteiro.dias, "2026-12-01").map((c) => c.date)).toEqual(["2026-12-02"])
  })

  const dias: DiaDoRoteiro[] = [
    {
      titulo: "Chegada",
      itens: [item({ horario: "14:00", titulo: " Check-in ", categoria: "accommodation" }), item({ horario: "20:00", titulo: "Jantar", descricao: "Uma frase", local: "Alfama", categoria: "restaurant" })],
    },
    { titulo: "Belém", itens: [item({ titulo: "   " }), item({ horario: "09:30", titulo: "Torre de Belém" })] },
  ]

  it("o dia i cai em inicio + i, na ordem do roteiro, e cada corpo passa no schema do itinerário", () => {
    const corpos = corposDosItens(dias, "2026-12-31")

    expect(corpos.map((c) => [c.date, c.start_time, c.title])).toEqual([
      ["2026-12-31", "14:00", "Check-in"],
      ["2026-12-31", "20:00", "Jantar"],
      ["2027-01-01", "09:30", "Torre de Belém"],
    ])
    expect(corpos[1]).toEqual({
      title: "Jantar",
      description: "Uma frase",
      date: "2026-12-31",
      start_time: "20:00",
      location: "Alfama",
      category: "restaurant",
      status: "planned",
    })
    for (const corpo of corpos) expect(criarItemItinerarioSchema.safeParse(corpo).success).toBe(true)
  })

  it("item com título em branco não vai (segunda linha atrás da tela)", () => {
    expect(corposDosItens(dias, "2026-12-31")).toHaveLength(3)
  })

  it("descrição e local nulos vão como null, e o schema aceita", () => {
    const [corpo] = corposDosItens([{ titulo: "D", itens: [item()] }], "2026-12-01")

    expect(corpo).toMatchObject({ description: null, location: null })
    expect(criarItemItinerarioSchema.safeParse(corpo).success).toBe(true)
  })
})
