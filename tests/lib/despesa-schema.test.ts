import { describe, it, expect } from "vitest"
import { criarDespesaSchema, CATEGORIAS_DESPESA } from "@/lib/schemas/despesa"

/**
 * O schema é a primeira linha de defesa contra mass-assignment: o que não está
 * na lista de campos é descartado antes de chegar ao banco. Estes testes provam
 * as regras de valor exigidas no plano (bloco 5) e o descarte de campos de
 * propriedade.
 *
 * @RF06.1
 */

const valida = {
  title: "Jantar no restaurante",
  amount: "42.50",
  currency: "BRL",
  category: "food" as const,
  date: "2026-09-08",
  payment_method: "Cartão de crédito",
  notes: "Divisão entre o grupo",
}

describe("criarDespesaSchema — caminho feliz", () => {
  it("aceita um payload completo e converte amount de texto para número", () => {
    const r = criarDespesaSchema.parse(valida)
    expect(r.amount).toBe(42.5)
    expect(r.title).toBe("Jantar no restaurante")
    expect(r.category).toBe("food")
  })

  it("assume BRL quando a moeda não é enviada", () => {
    const semMoeda = { title: valida.title, amount: valida.amount, category: valida.category, date: valida.date }
    expect(criarDespesaSchema.parse(semMoeda).currency).toBe("BRL")
  })

  it("normaliza a moeda para maiúsculas", () => {
    expect(criarDespesaSchema.parse({ ...valida, currency: "usd" }).currency).toBe("USD")
  })

  it("aceita payment_method e notes ausentes ou nulos", () => {
    const r = criarDespesaSchema.parse({
      ...valida,
      payment_method: null,
      notes: undefined,
    })
    expect(r.payment_method).toBeNull()
    expect(r.notes).toBeUndefined()
  })

  it("aceita todas as categorias do CHECK da tabela", () => {
    for (const c of CATEGORIAS_DESPESA) {
      expect(criarDespesaSchema.parse({ ...valida, category: c }).category).toBe(c)
    }
  })
})

describe("criarDespesaSchema — regra do valor (amount > 0)", () => {
  it("recusa amount igual a zero", () => {
    expect(criarDespesaSchema.safeParse({ ...valida, amount: "0" }).success).toBe(false)
    expect(criarDespesaSchema.safeParse({ ...valida, amount: 0 }).success).toBe(false)
  })

  it("recusa amount negativo", () => {
    expect(criarDespesaSchema.safeParse({ ...valida, amount: "-10" }).success).toBe(false)
    expect(criarDespesaSchema.safeParse({ ...valida, amount: -0.01 }).success).toBe(false)
  })

  it("recusa amount ausente", () => {
    const semValor = { title: valida.title, currency: valida.currency, category: valida.category, date: valida.date }
    expect(criarDespesaSchema.safeParse(semValor).success).toBe(false)
  })

  it("recusa amount não numérico", () => {
    expect(criarDespesaSchema.safeParse({ ...valida, amount: "abc" }).success).toBe(false)
  })

  it("recusa amount acima do teto de NUMERIC(10,2)", () => {
    expect(criarDespesaSchema.safeParse({ ...valida, amount: "100000000" }).success).toBe(false)
  })
})

describe("criarDespesaSchema — demais campos obrigatórios", () => {
  it("recusa título vazio", () => {
    expect(criarDespesaSchema.safeParse({ ...valida, title: "   " }).success).toBe(false)
  })

  it("recusa categoria fora da lista", () => {
    expect(criarDespesaSchema.safeParse({ ...valida, category: "viagem" }).success).toBe(false)
  })

  it("recusa data fora do formato AAAA-MM-DD", () => {
    expect(criarDespesaSchema.safeParse({ ...valida, date: "08/09/2026" }).success).toBe(false)
  })

  it("recusa moeda que não tem 3 letras", () => {
    expect(criarDespesaSchema.safeParse({ ...valida, currency: "REAL" }).success).toBe(false)
  })
})

describe("criarDespesaSchema — anti mass-assignment", () => {
  it("descarta id, trip_id, user_id e outros campos de propriedade enviados no corpo", () => {
    const r = criarDespesaSchema.parse({
      ...valida,
      id: "00000000-0000-0000-0000-000000000000",
      trip_id: "11111111-1111-1111-1111-111111111111",
      user_id: "22222222-2222-2222-2222-222222222222",
      paid_by: "33333333-3333-3333-3333-333333333333",
      created_at: "1999-01-01",
    })
    expect(r).not.toHaveProperty("id")
    expect(r).not.toHaveProperty("trip_id")
    expect(r).not.toHaveProperty("user_id")
    expect(r).not.toHaveProperty("paid_by")
    expect(r).not.toHaveProperty("created_at")
    expect(Object.keys(r).sort()).toEqual(
      ["amount", "category", "currency", "date", "notes", "payment_method", "title"].sort(),
    )
  })
})
