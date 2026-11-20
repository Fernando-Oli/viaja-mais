"use client"

import { useRef, useState, type KeyboardEvent, type TouchEvent } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * O carrossel das fotos de um post, como no Instagram: uma foto por vez, setas
 * nas laterais, pontos embaixo, contador "1/3" no canto e arrastar para o lado
 * no celular. Com uma foto só, nem setas nem pontos.
 *
 * Serve à prévia do "Criar" (URLs `blob:` locais) e ao detalhe (URLs
 * assinadas): só recebe `src` e `alt`. O tamanho vem de `className` (ex.:
 * `aspect-square`), e a foto cobre a área (`object-cover`).
 *
 * Acessível pelo padrão de carrossel da APG: região com `aria-roledescription`,
 * cada slide um grupo "1 de 3", e só o atual exposto ao leitor de tela; setas
 * e pontos são botões de 44 px com nome, e as setas do teclado trocam de foto
 * quando o foco está dentro do carrossel. A troca é anunciada numa região de status.
 *
 * @RF09.15 post com fotos · @RF09.17 detalhe do post
 */

export type FotoDoCarrossel = { src: string; alt: string }

/** Distância mínima, em px, para um arrasto contar como troca de foto. */
const ARRASTO_MINIMO = 40

export function PostCarrossel({
  fotos,
  rotulo,
  className,
}: {
  fotos: FotoDoCarrossel[]
  /** Nome da região, ex.: "Fotos da publicação de @ana". */
  rotulo: string
  className?: string
}) {
  const [indice, setIndice] = useState(0)
  const inicioDoToque = useRef<number | null>(null)
  const total = fotos.length
  // Removida a última foto (prévia do Criar), o índice volta para a que existe.
  const atual = total === 0 ? 0 : Math.min(indice, total - 1)

  const ir = (novo: number) => setIndice(Math.max(0, Math.min(total - 1, novo)))

  function teclado(e: KeyboardEvent<HTMLElement>) {
    if (total < 2) return
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      ir(atual - 1)
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      ir(atual + 1)
    }
  }

  function comecarToque(e: TouchEvent<HTMLDivElement>) {
    inicioDoToque.current = e.touches[0]?.clientX ?? null
  }

  function terminarToque(e: TouchEvent<HTMLDivElement>) {
    const inicio = inicioDoToque.current
    inicioDoToque.current = null
    const fim = e.changedTouches[0]?.clientX
    if (inicio === null || fim === undefined) return
    const delta = fim - inicio
    if (delta <= -ARRASTO_MINIMO) ir(atual + 1)
    else if (delta >= ARRASTO_MINIMO) ir(atual - 1)
  }

  if (total === 0) return null

  return (
    <section
      aria-roledescription="carrossel"
      aria-label={rotulo}
      onKeyDown={teclado}
      className={cn("relative overflow-hidden bg-muted", className)}
    >
      <div
        className="flex h-full w-full touch-pan-y transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{ transform: `translateX(-${atual * 100}%)` }}
        onTouchStart={comecarToque}
        onTouchEnd={terminarToque}
      >
        {fotos.map((foto, i) => (
          <div
            key={`${i}-${foto.src}`}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} de ${total}`}
            aria-hidden={i !== atual}
            className="h-full w-full shrink-0"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage ou blob: local da prévia */}
            <img src={foto.src} alt={foto.alt} draggable={false} className="h-full w-full object-cover select-none" />
          </div>
        ))}
      </div>

      {total > 1 && (
        <>
          <span
            aria-hidden
            className="absolute top-3 right-3 rounded-full bg-grafite/70 px-2.5 py-0.5 text-xs font-medium text-white"
          >
            {atual + 1}/{total}
          </span>
          <button
            type="button"
            aria-label="Foto anterior"
            disabled={atual === 0}
            onClick={() => ir(atual - 1)}
            className="absolute top-1/2 left-2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm transition-opacity hover:bg-background disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            aria-label="Próxima foto"
            disabled={atual === total - 1}
            onClick={() => ir(atual + 1)}
            className="absolute top-1/2 right-2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm transition-opacity hover:bg-background disabled:pointer-events-none disabled:opacity-0"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <div className="absolute inset-x-0 bottom-1 flex justify-center">
            {fotos.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`Ir para a foto ${i + 1}`}
                aria-current={i === atual ? "true" : undefined}
                onClick={() => ir(i)}
                className="group inline-flex h-11 w-7 items-center justify-center"
              >
                <span
                  aria-hidden
                  className={cn(
                    "block h-2 w-2 rounded-full bg-white/60 shadow-sm transition-colors group-hover:bg-white/90",
                    i === atual && "bg-white",
                  )}
                />
              </button>
            ))}
          </div>
          <p className="sr-only" role="status">
            Foto {atual + 1} de {total}
          </p>
        </>
      )}
    </section>
  )
}
