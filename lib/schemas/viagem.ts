import { z } from "zod"

/**
 * Contratos de entrada das rotas de viagem.
 *
 * A validação existe no servidor porque o cliente é hostil por definição: o
 * formulário do navegador é apenas conveniência, não garantia. Antes disso o
 * corpo da requisição ia inteiro para o `.update()`, o que permitia reescrever
 * `user_id` e transferir a viagem para outra conta.
 */

export const STATUS_VIAGEM = ["planning", "confirmed", "ongoing", "completed", "cancelled"] as const

const base = {
  title: z.string().trim().min(1, "informe um título").max(120),
  destination: z.string().trim().min(1, "informe o destino").max(160),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD"),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD"),
  description: z.string().trim().max(2000).optional().nullable(),
  budget: z.coerce.number().nonnegative("o orçamento não pode ser negativo").max(99_999_999).optional(),
  currency: z.string().trim().length(3, "use o código ISO de 3 letras").toUpperCase().optional(),
  status: z.enum(STATUS_VIAGEM).optional(),
}

const naoTerminaAntesDeComecar = <T extends { start_date?: string; end_date?: string }>(v: T) =>
  !v.start_date || !v.end_date || v.end_date >= v.start_date

export const criarViagemSchema = z
  .object(base)
  .refine(naoTerminaAntesDeComecar, { message: "a data de fim não pode ser anterior à de início", path: ["end_date"] })

/**
 * Na edição todo campo é opcional, mas a lista continua fechada: qualquer chave
 * fora dela é descartada pelo zod e nunca chega ao banco.
 */
export const atualizarViagemSchema = z
  .object({
    title: base.title.optional(),
    destination: base.destination.optional(),
    start_date: base.start_date.optional(),
    end_date: base.end_date.optional(),
    description: base.description,
    budget: base.budget,
    currency: base.currency,
    status: base.status,
  })
  .refine((v) => Object.keys(v).length > 0, { message: "envie ao menos um campo para atualizar" })
  .refine(naoTerminaAntesDeComecar, { message: "a data de fim não pode ser anterior à de início", path: ["end_date"] })

export type CriarViagem = z.infer<typeof criarViagemSchema>
export type AtualizarViagem = z.infer<typeof atualizarViagemSchema>
