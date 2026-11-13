import Link from "next/link"
import { SearchX } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

/**
 * Tela de "não encontrado", usada pelos `not-found.tsx`.
 *
 * A mesma frase para "não existe" e "você não tem acesso", de propósito: uma
 * mensagem diferente para cada caso diria a quem não participa de uma viagem
 * que ela existe.
 *
 * @RNF04.4 · @RNF02.4
 */
export function EstadoNaoEncontrado({
  titulo = "Página não encontrada",
  voltarPara,
  rotuloVoltar,
}: {
  titulo?: string
  voltarPara: string
  rotuloVoltar: string
}) {
  return (
    <Empty className="min-h-[60vh]">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{titulo}</EmptyTitle>
        <EmptyDescription>
          O endereço não existe, ou você não tem acesso a ele. Confira o link ou volte para uma página conhecida.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href={voltarPara}>{rotuloVoltar}</Link>
        </Button>
      </EmptyContent>
    </Empty>
  )
}
