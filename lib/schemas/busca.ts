import { z } from "zod"
import { BUSCA_MAX, BUSCA_MIN, TERMO_PERMITIDO, normalizarTermo } from "@/lib/social/busca"

/**
 * Contrato de entrada da busca de pessoas: o `?busca=` de GET /api/social/perfis.
 *
 * Normaliza antes de medir, para "  @ana  " contar como "ana". Os limites e os
 * caracteres aceitos ficam em lib/social/busca.ts, que explica por que `%`, `*`
 * e `\` são recusados.
 *
 * @RF09.10 buscar pessoas
 */
export const buscaPessoasSchema = z
  .string()
  .transform(normalizarTermo)
  .pipe(
    z
      .string()
      .min(BUSCA_MIN, `digite pelo menos ${BUSCA_MIN} caracteres`)
      .max(BUSCA_MAX, `use até ${BUSCA_MAX} caracteres`)
      .regex(TERMO_PERMITIDO, "use só letras, números e espaço"),
  )
