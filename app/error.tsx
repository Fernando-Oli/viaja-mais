"use client"

import { EstadoErro } from "@/components/estado-erro"

/**
 * Erro em qualquer página fora do dashboard e da rede social (início, login,
 * cadastro). O layout raiz continua de pé; só o conteúdo é trocado.
 *
 * @RNF04.4
 */
export default function Erro({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <EstadoErro error={error} retry={retry} voltarPara="/" />
    </main>
  )
}
