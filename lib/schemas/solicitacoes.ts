import { z } from "zod"

/**
 * Contrato da consulta de GET /api/social/solicitacoes: sem parâmetro, a lista
 * das solicitações pendentes; com `contagem=1`, só o total, para a bolinha do
 * sino. Qualquer outro valor de `contagem` é recusado (400), em vez de cair em
 * silêncio no modo da lista.
 *
 * @RF13.2 Zona 1 da central
 */
export const consultaSolicitacoesSchema = z.object({
  contagem: z.literal("1").optional(),
})
