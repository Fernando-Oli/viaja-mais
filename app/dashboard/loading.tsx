import { Skeleton } from "@/components/ui/skeleton"

/**
 * Enquanto a página do dashboard carrega: o esqueleto de um título e de uma
 * grade de cards, no lugar onde o conteúdo vai aparecer. Antes a tela ficava
 * parada na página anterior, sem sinal de que o clique tinha funcionado.
 *
 * @RNF04.4
 */
export default function CarregandoDashboard() {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-36 w-full" />
        ))}
      </div>
    </div>
  )
}
