"use client"

import "./globals.css"
import { EstadoErro } from "@/components/estado-erro"

/**
 * Erro no próprio layout raiz (por exemplo, no AuthProvider). Substitui o
 * documento inteiro, então precisa de <html> e <body> e importa o CSS global
 * por conta própria — o layout raiz, que o importaria, é justamente o que
 * quebrou. Sem `metadata`: error boundary é Client Component; o título vai pela
 * tag <title> do React.
 *
 * @RNF04.4
 */
export default function ErroGlobal({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="pt-BR">
      <body className="font-sans antialiased">
        <title>Erro · Viaja +</title>
        <main className="flex min-h-screen items-center justify-center p-4">
          <EstadoErro error={error} retry={retry} voltarPara="/" />
        </main>
      </body>
    </html>
  )
}
