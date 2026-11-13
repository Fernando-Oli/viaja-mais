import { cn } from "@/lib/utils"

/**
 * Capa de viagem. Com foto (trips.cover_image), a foto; sem foto, o grafismo
 * Percursos sobre Floresta, deslocado pela `semente` para duas viagens
 * vizinhas não ficarem iguais. Sempre decorativa: o nome da viagem vem em texto.
 */
export function CapaViagem({
  src,
  semente = "",
  className,
  children,
}: {
  src?: string | null
  semente?: string
  className?: string
  children?: React.ReactNode
}) {
  let h = 0
  for (const c of semente) h = (h * 31 + c.charCodeAt(0)) % 997
  const pos = `${15 + (h % 70)}% ${30 + (h % 40)}%`
  return (
    <div className={cn("relative overflow-hidden bg-primary", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto do Storage ou arte estática da marca */}
      <img
        src={src || "/brand/avori-grafismo-floresta.svg"}
        alt=""
        className="absolute inset-0 h-full w-full object-cover"
        style={src ? undefined : { objectPosition: pos, transform: "scale(1.6)" }}
      />
      {children}
    </div>
  )
}
