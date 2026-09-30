import { z } from "zod"

/**
 * Contrato de entrada da criação de item de itinerário.
 *
 * Antes disso a tela gravava direto do navegador e a rota fazia
 * `.insert({ ...body, trip_id })` — qualquer coluna enviada pelo cliente chegava
 * ao banco. A lista de campos agora é fechada: `id`, `trip_id`, `created_at` e
 * `updated_at` não estão aqui e são descartados pelo zod. `trip_id` sai da URL.
 *
 * @RF05.1 adicionar atividade · @RF05.5 categorizar · @RF05.6 horários · @RF05.7 localização
 */

// Espelham os CHECK de `itinerary_items` em
// supabase/migrations/20260910000333_plataforma_schema_base.sql.
export const CATEGORIAS_ITINERARIO = [
  "accommodation",
  "transport",
  "activity",
  "restaurant",
  "attraction",
  "other",
] as const

export const STATUS_ITINERARIO = ["planned", "confirmed", "completed", "cancelled"] as const

// `<input type="time">` manda HH:MM; o Postgres devolve HH:MM:SS. Aceita os dois.
const horario = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "use o formato HH:MM")
  .optional()
  .nullable()

export const criarItemItinerarioSchema = z
  .object({
    title: z.string().trim().min(1, "informe um título").max(120),
    description: z.string().trim().max(2000).optional().nullable(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD"),
    start_time: horario,
    end_time: horario,
    location: z.string().trim().max(200).optional().nullable(),
    category: z.enum(CATEGORIAS_ITINERARIO).default("activity"),
    status: z.enum(STATUS_ITINERARIO).default("planned"),
  })
  .refine((v) => !v.start_time || !v.end_time || v.end_time >= v.start_time, {
    message: "o horário de término não pode ser anterior ao de início",
    path: ["end_time"],
  })

export type CriarItemItinerario = z.infer<typeof criarItemItinerarioSchema>
