"use client"

import { EstadoErro } from "@/components/estado-erro"

/**
 * Erro numa página da rede social, dentro do layout dela (o menu Início,
 * Pesquisar e o sino continuam).
 *
 * @RNF04.4
 */
export default function ErroRedeSocial({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <EstadoErro error={error} retry={retry} voltarPara="/feed" />
}
