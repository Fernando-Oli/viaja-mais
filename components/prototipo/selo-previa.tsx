import { Eye } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Marca as telas que já têm o visual final, mas ainda rodam com dados de
 * exemplo: a lógica chega depois (feed, IA, publicação, comentários).
 * Some quando a tela passa a usar dados reais.
 */
export function SeloPrevia({ children = "Prévia com dados de exemplo", className }: { children?: React.ReactNode; className?: string }) {
  return (
    <p
      role="note"
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-dashed border-input bg-card px-3 py-1 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <Eye className="h-3.5 w-3.5" aria-hidden />
      {children}
    </p>
  )
}
