"use client"

import { EstadoErro } from "@/components/estado-erro"

/**
 * Erro numa página do dashboard. Fica dentro do layout do dashboard: a barra
 * lateral continua, e a pessoa navega para outra área sem recarregar.
 *
 * @RNF04.4
 */
export default function ErroDashboard({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <EstadoErro error={error} retry={retry} voltarPara="/dashboard" />
}
