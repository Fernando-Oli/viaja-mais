import { describe, it, expect } from "vitest"
import { geradorFake, roteiroFake } from "@/lib/ai/fake"
import { roteiroSchema } from "@/lib/ai/roteiro"
import { DIAS_MAXIMOS, type GerarRoteiro } from "@/lib/schemas/roteiro"

/**
 * O gerador fake é o que roda em dev, no CI e no E2E: tem de ser determinístico
 * e respeitar o mesmo contrato do modelo real.
 *
 * @RF12.1
 */

const PEDIDO: GerarRoteiro = {
  destino: "Lisboa",
  dias: 3,
  quem: "Em casal",
  ritmo: "equilibrado",
  orcamento: "moderado",
  interesses: ["Comida", "Museus"],
}

describe("gerador fake", () => {
  it("mesmo pedido, mesmo roteiro", async () => {
    expect(await geradorFake.gerar(PEDIDO)).toEqual(await geradorFake.gerar({ ...PEDIDO }))
    expect(geradorFake.nome).toBe("fake")
  })

  it.each([1, 2, DIAS_MAXIMOS])("devolve exatamente %i dia(s), no schema", (dias) => {
    const roteiro = roteiroFake({ ...PEDIDO, dias })

    expect(roteiro.dias).toHaveLength(dias)
    expect(roteiroSchema.safeParse(roteiro).success).toBe(true)
  })

  it("o primeiro dia tem check-in e o último, check-out", () => {
    const { dias } = roteiroFake(PEDIDO)

    expect(dias[0].itens[0]).toMatchObject({ titulo: "Check-in na hospedagem", categoria: "accommodation" })
    expect(dias[2].itens[0]).toMatchObject({ titulo: "Check-out e bagagem guardada", categoria: "accommodation" })
    expect(dias[1].itens.some((i) => i.categoria === "accommodation")).toBe(false)
  })

  it("viagem de um dia não tem check-out", () => {
    const { dias } = roteiroFake({ ...PEDIDO, dias: 1 })

    expect(dias[0].itens.filter((i) => i.categoria === "accommodation").map((i) => i.titulo)).toEqual(["Check-in na hospedagem"])
  })

  it("o ritmo muda a quantidade de itens do dia do meio", () => {
    const quantos = (ritmo: GerarRoteiro["ritmo"]) => roteiroFake({ ...PEDIDO, ritmo }).dias[1].itens.length

    expect([quantos("tranquilo"), quantos("equilibrado"), quantos("intenso")]).toEqual([3, 4, 5])
  })

  it("no último dia o check-out não conta no corte do ritmo", () => {
    const ultimo = roteiroFake({ ...PEDIDO, ritmo: "tranquilo" }).dias[2]

    expect(ultimo.itens).toHaveLength(3)
    expect(ultimo.itens[0].categoria).toBe("accommodation")
  })

  it("o orçamento aparece nas refeições", () => {
    const refeicoes = (orcamento: GerarRoteiro["orcamento"]) =>
      roteiroFake({ ...PEDIDO, orcamento }).dias[1].itens.find((i) => i.categoria === "restaurant")?.descricao

    expect(refeicoes("economico")).toMatch(/barata/)
    expect(refeicoes("confortavel")).toMatch(/reserva/)
  })

  it("os interesses escolhem a atividade da tarde, sem ligar para acento ou maiúscula", () => {
    const tarde = (interesses: string[], dia = 1) =>
      roteiroFake({ ...PEDIDO, interesses }).dias[dia].itens.find((i) => i.horario === "15:00")?.titulo

    expect(tarde(["MUSEUS"])).toBe("Museu mais visitado da cidade")
    expect(tarde(["História"])).toBe("Roteiro pelo centro histórico")
    expect(tarde(["Surfe"])).toBe("Surfe em Lisboa")
    expect(tarde([])).toBe("Passeio livre por Lisboa")
  })

  it("destino longo não estoura o limite do título", () => {
    const roteiro = roteiroFake({ ...PEDIDO, destino: "X".repeat(160) })

    expect(roteiroSchema.safeParse(roteiro).success).toBe(true)
  })
})
