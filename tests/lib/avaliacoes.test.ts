import { describe, it, expect } from "vitest"
import { resumirAvaliacoes } from "@/lib/lugares/avaliacoes"
import { avaliacaoSchema } from "@/lib/schemas/avaliacao"

/** @RF11.2 média das avaliações · @RF11.1 contrato da nota */

describe("resumirAvaliacoes", () => {
  it("sem avaliações, média nula e total zero", () => {
    expect(resumirAvaliacoes([])).toEqual({ media: null, total: 0 })
  })

  it("uma nota é a própria média", () => {
    expect(resumirAvaliacoes([{ rating: 4 }])).toEqual({ media: 4, total: 1 })
  })

  it("arredonda a média para uma casa decimal", () => {
    // 14 / 3 = 4,666…
    expect(resumirAvaliacoes([{ rating: 5 }, { rating: 5 }, { rating: 4 }])).toEqual({ media: 4.7, total: 3 })
    // 4 / 3 = 1,333…
    expect(resumirAvaliacoes([{ rating: 1 }, { rating: 1 }, { rating: 2 }])).toEqual({ media: 1.3, total: 3 })
  })

  it("ignora nota fora de 1 a 5 ou não inteira", () => {
    expect(
      resumirAvaliacoes([{ rating: 0 }, { rating: 6 }, { rating: 3.5 }, { rating: Number.NaN }, { rating: 2 }]),
    ).toEqual({ media: 2, total: 1 })
  })

  it("só notas inválidas contam como nenhuma avaliação", () => {
    expect(resumirAvaliacoes([{ rating: 0 }, { rating: 9 }])).toEqual({ media: null, total: 0 })
  })
})

describe("avaliacaoSchema", () => {
  it("aceita nota de 1 a 5 com ou sem comentário", () => {
    expect(avaliacaoSchema.safeParse({ rating: 1 }).success).toBe(true)
    expect(avaliacaoSchema.safeParse({ rating: 5, comment: "Ótimo" }).success).toBe(true)
    expect(avaliacaoSchema.safeParse({ rating: 3, comment: null }).success).toBe(true)
  })

  it("recusa nota 0, 6, fracionária ou ausente", () => {
    for (const corpo of [{ rating: 0 }, { rating: 6 }, { rating: 3.5 }, {}, { rating: "4" }]) {
      expect(avaliacaoSchema.safeParse(corpo).success, JSON.stringify(corpo)).toBe(false)
    }
  })

  it("recusa comentário com mais de 1000 caracteres", () => {
    expect(avaliacaoSchema.safeParse({ rating: 4, comment: "a".repeat(1001) }).success).toBe(false)
    expect(avaliacaoSchema.safeParse({ rating: 4, comment: "a".repeat(1000) }).success).toBe(true)
  })

  it("descarta campos fora do contrato", () => {
    const r = avaliacaoSchema.parse({ rating: 4, user_id: "outra", google_place_id: "x", id: "y" })
    expect(r).toEqual({ rating: 4 })
  })
})
