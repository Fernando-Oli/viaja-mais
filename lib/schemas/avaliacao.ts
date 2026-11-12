import { z } from "zod"

/**
 * Contrato de entrada da avaliação de um lugar.
 *
 * Só nota e comentário. `user_id` sai da sessão; `google_place_id` e
 * `place_name`, do lugar salvo na viagem da URL. Qualquer outro campo do corpo
 * é descartado pelo zod.
 *
 * @RF11.1 avaliar com nota e comentário · @RF11.3 editar a própria
 */
export const avaliacaoSchema = z.object({
  // Inteira, de 1 a 5: a mesma faixa do check `place_reviews_rating_faixa`.
  rating: z.number().int("a nota é um número inteiro").min(1, "a nota vai de 1 a 5").max(5, "a nota vai de 1 a 5"),
  comment: z.string().trim().max(1000).optional().nullable(),
})

export type Avaliacao = z.infer<typeof avaliacaoSchema>
