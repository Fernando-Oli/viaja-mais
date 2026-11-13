import { Skeleton } from "@/components/ui/skeleton"

/**
 * Enquanto a página da rede social carrega: o esqueleto de uma lista de
 * pessoas (avatar, nome e @).
 *
 * @RNF04.4
 */
export default function CarregandoRedeSocial() {
  return (
    <div className="space-y-4" role="status" aria-live="polite">
      <span className="sr-only">Carregando…</span>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      ))}
    </div>
  )
}
