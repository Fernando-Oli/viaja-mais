import { MapPin } from "lucide-react"
import { linkDoMapa, type LugarNoMapa } from "@/lib/ai/mapa"

/**
 * "Ver no mapa" de uma atividade do roteiro: abre a busca do lugar no Google
 * Maps em nova aba, sem chave e sem passar pelo nosso servidor. A aba do app
 * fica onde estava, com o roteiro em revisão.
 *
 * O nome acessível começa pelo texto visível (WCAG 2.5.3) e diz qual atividade
 * abre e que é em nova aba.
 *
 * @RF12.2 revisar o roteiro gerado antes de gravá-lo
 */
export function VerNoMapa(lugar: LugarNoMapa) {
  const href = linkDoMapa(lugar)
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Ver no mapa: ${lugar.titulo.trim() || lugar.local?.trim()} (abre em nova aba)`}
      className="inline-flex items-center gap-1 rounded px-1 text-xs font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <MapPin className="h-3.5 w-3.5" aria-hidden />
      Ver no mapa
    </a>
  )
}
