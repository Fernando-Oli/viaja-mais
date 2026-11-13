"use client"

import Link from "next/link"
import { useEffect } from "react"
import { AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

/**
 * Tela de erro inesperado, usada pelos `error.tsx` de cada segmento.
 *
 * Nunca mostra `error.message`: em produção o Next já troca a mensagem dos
 * Server Components por uma genérica, mas erro lançado no navegador chega cru
 * — e pode trazer texto do Postgres. O que aparece é uma explicação que a
 * pessoa consegue seguir e o código do erro (`digest`), que casa com o log do
 * servidor quando alguém relata o problema.
 *
 * @RNF04.4 falha vira mensagem compreensível, nunca tela em branco
 * @RNF02.11 sem detalhe interno na tela
 */
export function EstadoErro({
  error,
  retry,
  voltarPara = "/dashboard",
}: {
  error: Error & { digest?: string }
  retry: () => void
  /** Para onde o botão secundário leva. */
  voltarPara?: string
}) {
  useEffect(() => {
    // Vai para o console do navegador e, em produção, para o log da Vercel.
    console.error("[erro na tela]", error.digest ?? "", error)
  }, [error])

  return (
    <Empty className="min-h-[60vh]" role="alert">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AlertTriangle aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Algo deu errado ao carregar esta página</EmptyTitle>
        <EmptyDescription>
          Pode ter sido uma falha passageira de conexão. Tente de novo; se continuar, volte ao início e avise a equipe
          {error.digest ? " informando o código abaixo" : ""}.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={() => retry()}>Tentar de novo</Button>
          <Button variant="outline" asChild>
            <Link href={voltarPara}>Voltar ao início</Link>
          </Button>
        </div>
        {error.digest ? (
          <p className="text-muted-foreground text-xs">
            Código do erro: <code className="font-mono">{error.digest}</code>
          </p>
        ) : null}
      </EmptyContent>
    </Empty>
  )
}
