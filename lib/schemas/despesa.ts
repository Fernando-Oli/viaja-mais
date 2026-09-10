import { z } from "zod"

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
})

export type CriarDespesa = z.infer<typeof criarDespesaSchema>
