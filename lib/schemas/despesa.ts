import { z } from "zod"
import { PESO_MAXIMO, pesoParaCentesimos, reaisParaCentavos } from "@/lib/finance/rateio"

/**
 * Contrato de entrada da criação de despesa.
 *
 * A validação existe no servidor porque o cliente é hostil por definição: o
 * formulário do navegador é conveniência, não garantia. Antes disso a rota fazia
 * `.insert({ ...body, trip_id, user_id })`, o que permitia ao cliente injetar
 * qualquer coluna — inclusive `user_id`, reatribuindo a despesa a outra conta.
 *
 * A lista de campos é fechada. `id`, `trip_id`, `user_id`, `created_at` e
 * `updated_at` NÃO estão aqui e por isso são descartados pelo zod antes de
 * chegarem ao banco, venha o que vier no corpo da requisição. `trip_id` sai da
 * URL e `user_id` da sessão — nunca do cliente.
 *
 * @RF06.1 — adicionar despesa com título, valor, categoria e data
 */

// Espelha o CHECK da tabela `expenses` em docs/ARCHITECTURE.md §6
// (accommodation, transport, food, activities, shopping, other) e as opções do
// formulário em app/dashboard/trips/[id]/expenses/new/page.tsx.
export const CATEGORIAS_DESPESA = [
  "accommodation",
  "transport",
  "food",
  "activities",
  "shopping",
  "other",
] as const

/**
 * Rateio enviado junto da despesa. Leva só a **intenção** — quem participa e,
 * conforme o tipo, o peso ou o valor de cada um. As partes em centavos são
 * recalculadas no servidor por `lib/finance/rateio.ts`; nada que o navegador
 * calculou é gravado sem passar por lá.
 *
 * `tipo` usa os mesmos valores do CHECK de `expenses.split_type`.
 *
 * @RF06.9 tipo de rateio: igual, por peso ou por valor exato
 */
const participanteId = z.string().uuid("participante inválido")

// Mesma regra de `reaisParaCentavos`: número não negativo com até duas casas.
const valorMonetario = z.union([z.string(), z.number()]).refine(
  (v) => reaisParaCentavos(v) !== null,
  "informe um valor maior ou igual a zero, com até duas casas",
)

const peso = z.coerce
  .number()
  .finite("informe um peso numérico")
  .refine((v) => pesoParaCentesimos(v) !== null, `o peso deve ser maior que zero e até ${PESO_MAXIMO}, com até duas casas`)

function semRepetidos(participantes: { user_id: string }[]) {
  return new Set(participantes.map((p) => p.user_id)).size === participantes.length
}

export const rateioSchema = z
  .discriminatedUnion("tipo", [
    z.object({
      tipo: z.literal("equal"),
      participantes: z.array(z.object({ user_id: participanteId })).min(1, "selecione ao menos um participante"),
    }),
    z.object({
      tipo: z.literal("weight"),
      participantes: z
        .array(z.object({ user_id: participanteId, peso }))
        .min(1, "selecione ao menos um participante"),
    }),
    z.object({
      tipo: z.literal("exact"),
      participantes: z
        .array(z.object({ user_id: participanteId, valor: valorMonetario }))
        .min(1, "selecione ao menos um participante"),
    }),
  ])
  .refine((r) => semRepetidos(r.participantes), {
    message: "participante repetido no rateio",
    path: ["participantes"],
  })

export type Rateio = z.infer<typeof rateioSchema>

export const criarDespesaSchema = z.object({
  title: z.string().trim().min(1, "informe uma descrição").max(120),

  // `coerce` porque o formulário manda o valor como texto do `<input type="number">`.
  // As três exigências do plano caem em `positive()`: zero e negativo falham
  // direto; ausente vira `NaN` (via `Number(undefined)`) e não passa em `finite()`.
  // `99_999_999.99` é o teto de NUMERIC(10,2), o tipo da coluna em ARCHITECTURE §6.
  amount: z.coerce
    .number()
    .finite("informe um valor numérico")
    .positive("o valor deve ser maior que zero")
    .max(99_999_999.99, "valor acima do limite"),

  currency: z.string().trim().length(3, "use o código ISO de 3 letras").toUpperCase().default("BRL"),

  category: z.enum(CATEGORIAS_DESPESA),

  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD"),

  // Opcionais na tabela; o formulário envia `null` quando em branco.
  payment_method: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),

  // Opcional: despesa sem rateio é estado legítimo no banco ("lançada e ainda
  // não rateada" — ver a constraint trigger de `expense_shares`).
  rateio: rateioSchema.optional(),
})

export type CriarDespesa = z.infer<typeof criarDespesaSchema>
