"use client"

import { useEffect, useRef, useState } from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Área que rola por dentro, sem barra de rolagem visível, com um indicador de
 * "há mais conteúdo abaixo" (pedido do Micael, 20/11, na tela da Avori).
 *
 * - A barra some (`scrollbar-width: none` e `::-webkit-scrollbar`), mas a área
 *   continua rolando com roda, toque e teclado.
 * - Enquanto há conteúdo abaixo, aparecem um esmaecido na borda inferior e uma
 *   setinha pulando (simplificação pedida pelo Micael: sem texto nem cápsula).
 *   A seta é clicável — rola quase uma tela — e tem nome acessível. No fim, os
 *   dois somem.
 * - O estado é recalculado ao rolar e pelos observadores: `ResizeObserver` na
 *   área e em cada filho (conteúdo cresceu ou encolheu, janela mudou) e
 *   `MutationObserver` para filhos que entram ou saem. Nada de `setState`
 *   direto no corpo do efeito (regra do React Compiler).
 *
 * @RF12.2 revisar o roteiro gerado
 */

/** Folga para arredondamento de subpixel: 8px do fim já conta como "no fim". */
const FOLGA_PX = 8

const temConteudoAbaixo = (el: HTMLElement) => el.scrollTop + el.clientHeight < el.scrollHeight - FOLGA_PX

type Props = {
  children: React.ReactNode
  /** Classes do contêiner externo (ocupa o espaço no layout). */
  className?: string
  /** Classes da área que rola (espaçamento entre os filhos, por exemplo). */
  classNameRolagem?: string
  /** Nome acessível da área que rola. */
  rotulo?: string
  /** Nome acessível da seta (há duas na tela; precisam ser distintos). */
  rotuloIndicador: string
  /** Ref da área que rola, para quem precisa rolar por código (a conversa desce sozinha). */
  refRolagem?: React.RefObject<HTMLDivElement | null>
}

export function RolagemComIndicador({ children, className, classNameRolagem, rotulo, rotuloIndicador, refRolagem }: Props) {
  const propria = useRef<HTMLDivElement>(null)
  const rolagem = refRolagem ?? propria
  const [temMaisAbaixo, setTemMaisAbaixo] = useState(false)

  useEffect(() => {
    const el = rolagem.current
    if (!el || typeof ResizeObserver === "undefined") return
    const atualizar = () => setTemMaisAbaixo(temConteudoAbaixo(el))

    // O ResizeObserver chama o retorno logo ao observar: é a medida inicial.
    const tamanho = new ResizeObserver(atualizar)
    const observarFilhos = () => {
      tamanho.disconnect()
      tamanho.observe(el)
      for (const filho of Array.from(el.children)) tamanho.observe(filho)
    }
    observarFilhos()

    const filhos = new MutationObserver(() => {
      observarFilhos()
      atualizar()
    })
    filhos.observe(el, { childList: true })

    return () => {
      tamanho.disconnect()
      filhos.disconnect()
    }
  }, [rolagem])

  function aoRolar(evento: React.UIEvent<HTMLDivElement>) {
    setTemMaisAbaixo(temConteudoAbaixo(evento.currentTarget))
  }

  function descer() {
    const el = rolagem.current
    el?.scrollBy({ top: Math.max(120, el.clientHeight * 0.8), behavior: "smooth" })
  }

  return (
    <div className={cn("relative min-h-0 flex-1", className)}>
      <div
        ref={rolagem}
        aria-label={rotulo}
        onScroll={aoRolar}
        className={cn("h-full overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", classNameRolagem)}
      >
        {children}
      </div>
      {temMaisAbaixo ? (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-background via-background/70 to-transparent"
          />
          <button
            type="button"
            onClick={descer}
            aria-label={rotuloIndicador}
            className="absolute bottom-1 left-1/2 inline-flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full text-primary transition-opacity hover:opacity-80"
          >
            <ChevronDown className="h-6 w-6 motion-safe:animate-bounce" strokeWidth={2.5} aria-hidden />
          </button>
        </>
      ) : null}
    </div>
  )
}
