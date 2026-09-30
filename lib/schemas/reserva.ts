import { z } from "zod"

/**
 * Contratos de entrada das rotas de reserva.
 *
 * Antes disso a tela "Nova Reserva" gravava direto do navegador e a rota fazia
 * `.insert({ ...body, trip_id, user_id })`. A lista de campos agora é fechada:
 * `id`, `trip_id`, `user_id`, `created_at` e `updated_at` não estão aqui e são
 * descartados pelo zod. `trip_id` sai da URL e `user_id` da sessão.
 *
 * @RF07.1 voo · @RF07.2 hotel · @RF07.3 carro · @RF07.4 atividade
 */

// Espelham os CHECK de `bookings` em
// supabase/migrations/20260910000333_plataforma_schema_base.sql.
export const TIPOS_RESERVA = ["flight", "hotel", "car", "activity", "other"] as const
export const STATUS_RESERVA = ["pending", "confirmed", "cancelled"] as const

// `<input type="datetime-local">` manda AAAA-MM-DDTHH:MM (às vezes com segundos).
const dataHora = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "use data e hora no formato AAAA-MM-DDTHH:MM")

const base = {
  type: z.enum(TIPOS_RESERVA),
  title: z.string().trim().min(1, "informe um título").max(120),
  provider: z.string().trim().max(120).optional().nullable(),
  confirmation_number: z.string().trim().max(60).optional().nullable(),
  start_date: dataHora,
  end_date: dataHora.optional().nullable(),
  location: z.string().trim().max(200).optional().nullable(),
  // 99_999_999.99 é o teto de NUMERIC(10,2), o tipo da coluna `price`.
  price: z.number().nonnegative("o preço não pode ser negativo").max(99_999_999.99).optional().nullable(),
  currency: z.string().trim().length(3, "use o código ISO de 3 letras").toUpperCase(),
  status: z.enum(STATUS_RESERVA),
  notes: z.string().trim().max(2000).optional().nullable(),
}

// Mesmo formato dos dois lados, então a comparação de texto respeita a ordem cronológica.
const terminoNaoAntesDoInicio = <T extends { start_date?: string; end_date?: string | null }>(v: T) =>
  !v.start_date || !v.end_date || v.end_date >= v.start_date

const mensagemTermino = { message: "o término não pode ser anterior ao início", path: ["end_date"] }

export const criarReservaSchema = z
  .object({
    ...base,
    currency: base.currency.default("BRL"),
    status: base.status.default("confirmed"),
  })
  .refine(terminoNaoAntesDoInicio, mensagemTermino)

/**
 * Atualização parcial: campo ausente não é alterado.
 *
 * @RF07.5 editar reserva
 */
export const atualizarReservaSchema = z
  .object({
    type: base.type.optional(),
    title: base.title.optional(),
    provider: base.provider,
    confirmation_number: base.confirmation_number,
    start_date: base.start_date.optional(),
    end_date: base.end_date,
    location: base.location,
    price: base.price,
    currency: base.currency.optional(),
    status: base.status.optional(),
    notes: base.notes,
  })
  .refine((v) => Object.keys(v).length > 0, { message: "envie ao menos um campo para atualizar" })
  .refine(terminoNaoAntesDoInicio, mensagemTermino)

export type CriarReserva = z.infer<typeof criarReservaSchema>
export type AtualizarReserva = z.infer<typeof atualizarReservaSchema>
