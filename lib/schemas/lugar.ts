import { z } from "zod"

/**
 * Contratos de entrada das rotas de lugares.
 *
 * Antes disso a tela "Lugares da Viagem" gravava e excluía direto do navegador, e
 * a rota fazia `.insert({ ...body, trip_id, user_id })`. A lista de campos agora é
 * fechada: `id`, `trip_id`, `user_id` e `created_at` não estão aqui e são
 * descartados pelo zod. `trip_id` sai da URL e `user_id` da sessão.
 *
 * @RF08.2 salvar lugar · @RF08.3 notas no lugar
 */

const notas = z.string().trim().max(2000).optional().nullable()

export const criarLugarSchema = z.object({
  name: z.string().trim().min(1, "informe o nome do lugar").max(200),
  address: z.string().trim().max(300).optional().nullable(),
  // Faixas de NUMERIC(10,8) e NUMERIC(11,8), os tipos de `latitude` e `longitude`.
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  place_id: z.string().trim().max(300).optional().nullable(),
  category: z.string().trim().max(60).optional().nullable(),
  // Nota do Google, de 0 a 5. NUMERIC(2,1) guarda uma casa decimal.
  rating: z.number().min(0).max(5).optional().nullable(),
  notes: notas,
})

/**
 * Atualização parcial: campo ausente não é alterado. Nome e coordenadas vêm da
 * busca do Google e não são editáveis; o grupo marca visita e anota.
 *
 * @RF08.3 notas no lugar · @RF08.4 marcar visitado
 */
export const atualizarLugarSchema = z
  .object({
    visited: z.boolean().optional(),
    notes: notas,
  })
  .refine((v) => Object.keys(v).length > 0, { message: "envie ao menos um campo para atualizar" })

export type CriarLugar = z.infer<typeof criarLugarSchema>
export type AtualizarLugar = z.infer<typeof atualizarLugarSchema>
