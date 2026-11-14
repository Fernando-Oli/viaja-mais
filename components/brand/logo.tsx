import { cn } from "@/lib/utils"

/**
 * Assinatura e símbolo da Avori, sempre a partir dos SVG do manual
 * (public/brand/). O nome nunca é redigitado como texto.
 *
 * Mínimos do manual: assinatura com 140px de largura, símbolo com 24px.
 */
type Variante = "floresta" | "marfim" | "grafite"

export function Logo({
  variante = "floresta",
  soSimbolo = false,
  className,
  decorativo = false,
}: {
  variante?: Variante
  soSimbolo?: boolean
  className?: string
  /** true quando há texto "Avori" ao lado (evita leitura duplicada). */
  decorativo?: boolean
}) {
  const simboloVariante = variante === "grafite" ? "floresta" : variante
  const src = soSimbolo ? `/brand/avori-simbolo-${simboloVariante}.svg` : `/brand/avori-logo-${variante}.svg`
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG estático da marca, sem ganho com next/image
    <img
      src={src}
      alt={decorativo ? "" : "Avori"}
      className={cn(soSimbolo ? "h-8 w-8 min-w-6" : "h-auto w-[140px] min-w-[140px]", className)}
    />
  )
}
