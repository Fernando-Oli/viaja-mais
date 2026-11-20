"use client"

import { useRef, type Ref } from "react"
import { ImagePlus, Loader2, RotateCcw, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TIPOS_FOTO } from "@/lib/social/foto"
import { MAXIMO_FOTOS } from "./post-detalhe-modelo"
import type { FotoEscolhida } from "./publicar-modelo"

/**
 * "Fotos (até 3, opcional)" do diálogo de publicar viagem (redesenho do post
 * de 18/11): no lugar da capa única, de 0 a 3 fotos, na ordem em que foram
 * escolhidas, que é a ordem do carrossel. Sem foto, o post de viagem usa o
 * grafismo da marca. Só apresenta: o estado e o envio são de publicar-viagem.tsx.
 *
 * - Antes de publicar: "Escolher fotos" acrescenta (até 3), cada miniatura tem
 *   "Remover foto N". Nada sobe ainda; as fotos vão logo depois do "Publicar".
 * - Ao gerenciar, as fotos do post aparecem como estão. "Trocar fotos" começa
 *   uma escolha nova, que substitui todas ao atualizar (a rota troca o conjunto
 *   inteiro); "Remover fotos" marca para tirar todas. "Manter as fotos atuais"
 *   desfaz qualquer das duas antes de atualizar.
 *
 * @RF09.7 publicar viagem — fotos do post de viagem
 */

const TIPOS_ACEITOS = TIPOS_FOTO.join(",")

export function SecaoFotos({
  fotos,
  atuais,
  publicado,
  desabilitado,
  enviando,
  refBotao,
  aoEscolher,
  aoRemover,
  aoRemoverTodas,
  aoManter,
}: {
  /** As escolhidas, ou `null` = manter as `atuais` (só ao gerenciar). */
  fotos: FotoEscolhida[] | null
  /** URLs assinadas das fotos que o post já tem. */
  atuais: string[]
  publicado: boolean
  desabilitado: boolean
  enviando: boolean
  refBotao?: Ref<HTMLButtonElement>
  aoEscolher: (arquivos: File[]) => void
  aoRemover: (indice: number) => void
  aoRemoverTodas: () => void
  aoManter: () => void
}) {
  const arquivo = useRef<HTMLInputElement>(null)
  const mantendo = fotos === null
  const mostradas = mantendo ? atuais : fotos.map((f) => f.url)
  const cheio = !mantendo && fotos.length >= MAXIMO_FOTOS
  const rotuloEscolher = mantendo ? "Trocar fotos" : fotos.length === 0 ? "Escolher fotos" : "Adicionar foto"

  let aviso: string
  if (mantendo) aviso = atuais.length === 0 ? "A publicação usa o grafismo da viagem." : "As fotos atuais da publicação."
  else if (!publicado) aviso = fotos.length === 0 ? "Sem fotos, a publicação usa o grafismo da viagem." : "As fotos sobem ao publicar."
  else if (fotos.length === 0) aviso = "Ao atualizar, as fotos saem e a publicação volta ao grafismo."
  else aviso = "Ao atualizar, estas fotos substituem as atuais."

  return (
    <section aria-labelledby="pub-fotos-titulo" className="space-y-2">
      <h3 id="pub-fotos-titulo" className="text-sm font-semibold">
        Fotos (até {MAXIMO_FOTOS}, opcional)
      </h3>

      {mostradas.length > 0 ? (
        <ol className="grid grid-cols-3 gap-2" aria-label="Fotos na ordem do carrossel">
          {mostradas.map((src, i) => (
            <li key={`${i}-${src}`} className="relative aspect-square overflow-hidden rounded-xl bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- blob: local da prévia ou URL assinada do Storage */}
              <img src={src} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
              <span
                aria-hidden
                className="absolute bottom-1 left-1 rounded-full bg-grafite/70 px-1.5 text-xs font-medium text-white"
              >
                {i + 1}
              </span>
              {!mantendo && (
                <button
                  type="button"
                  aria-label={`Remover foto ${i + 1}`}
                  disabled={desabilitado}
                  onClick={() => aoRemover(i)}
                  className="absolute top-0 right-0 inline-flex h-11 w-11 items-center justify-center disabled:opacity-50"
                >
                  <span className="rounded-full bg-background/90 p-1 text-foreground shadow-sm">
                    <X className="h-4 w-4" aria-hidden />
                  </span>
                </button>
              )}
            </li>
          ))}
        </ol>
      ) : null}

      <p id="pub-fotos-aviso" className="text-xs text-muted-foreground" aria-live="polite">
        {aviso}
      </p>

      <input
        ref={arquivo}
        type="file"
        accept={TIPOS_ACEITOS}
        multiple
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const escolhidos = Array.from(e.target.files ?? [])
          e.target.value = ""
          if (escolhidos.length > 0) aoEscolher(escolhidos)
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          ref={refBotao}
          type="button"
          variant="outline"
          className="h-11 flex-1 rounded-xl"
          disabled={desabilitado || cheio}
          aria-describedby="pub-fotos-aviso pub-fotos-formatos"
          onClick={() => arquivo.current?.click()}
        >
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ImagePlus className="h-4 w-4" aria-hidden />}
          {rotuloEscolher}
        </Button>
        {mantendo && atuais.length > 0 && (
          <Button type="button" variant="ghost" className="h-11 rounded-xl" disabled={desabilitado} onClick={aoRemoverTodas}>
            <Trash2 className="h-4 w-4" aria-hidden />
            Remover fotos
          </Button>
        )}
        {!mantendo && publicado && (
          <Button type="button" variant="ghost" className="h-11 rounded-xl" disabled={desabilitado} onClick={aoManter}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Manter as fotos atuais
          </Button>
        )}
      </div>
      <p id="pub-fotos-formatos" className="text-xs text-muted-foreground">
        JPEG, PNG ou WebP, até 2 MB cada.
      </p>
    </section>
  )
}
