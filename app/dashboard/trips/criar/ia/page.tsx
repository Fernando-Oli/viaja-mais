"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ChevronLeft, PenLine, RotateCcw, SendHorizontal, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SeloPrevia } from "@/components/prototipo/selo-previa"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

/**
 * Nova viagem com a Avori: conversa guiada, uma pergunta por vez, com chips de
 * resposta rápida, e a prévia do roteiro ao lado.
 *
 * PRÉVIA VISUAL. A geração de roteiro (lib/ai/, app/api/roteiros/, do Micael:
 * S10-M-ia-adapter e S11-M-tela-roteiro-ia) ainda não existe. Aqui a conversa
 * funciona, mas o roteiro é montado com um modelo fixo e "Criar viagem" não
 * grava nada. Quando a rota existir, `gerarRoteiro` vira a chamada a ela.
 */

type Pergunta = { id: string; texto: string; ajuda?: string; opcoes: string[]; multipla?: boolean }

const PERGUNTAS: Pergunta[] = [
  { id: "destino", texto: "Para onde vocês vão?", opcoes: ["Lisboa", "Rio de Janeiro", "Buenos Aires", "Chapada dos Veadeiros"] },
  { id: "datas", texto: "Quando, e por quantos dias?", opcoes: ["Um fim de semana", "5 dias", "Uma semana", "Duas semanas"] },
  { id: "quem", texto: "Quem vai com você?", opcoes: ["Só eu", "Em casal", "Com amigos", "Em família"] },
  {
    id: "ritmo",
    texto: "Qual é o ritmo da viagem?",
    ajuda: "Isso define quantas atividades cabem em cada dia.",
    opcoes: ["Tranquilo", "Equilibrado", "Intenso"],
  },
  { id: "orcamento", texto: "E o orçamento por pessoa?", opcoes: ["Econômico", "Moderado", "Confortável"] },
  {
    id: "interesses",
    texto: "Do que vocês mais gostam?",
    ajuda: "Escolha quantos quiser.",
    opcoes: ["Comida", "História", "Natureza", "Museus", "Vida noturna", "Compras"],
    multipla: true,
  },
]

type Dia = { titulo: string; itens: [string, string][] }

function gerarRoteiro(respostas: Record<string, string>): Dia[] {
  const destino = respostas.destino || "o destino"
  const intenso = respostas.ritmo === "Intenso"
  const tranquilo = respostas.ritmo === "Tranquilo"
  const base: Dia[] = [
    {
      titulo: "Chegada e primeiro passeio",
      itens: [
        ["14:00", "Check-in na hospedagem"],
        ["16:30", `Caminhada pelo centro histórico de ${destino}`],
        ["20:00", "Jantar perto da hospedagem"],
      ],
    },
    {
      titulo: "Os clássicos",
      itens: [
        ["09:00", "Ponto mais conhecido da cidade, cedo para evitar fila"],
        ["13:00", "Almoço com comida local"],
        ["15:30", "Museu ou mirante, conforme o tempo"],
        ["20:30", "Bairro boêmio"],
      ],
    },
    {
      titulo: "Bate-volta",
      itens: [
        ["08:30", "Saída para uma cidade próxima"],
        ["12:30", "Almoço por lá"],
        ["18:00", "Volta e noite livre"],
      ],
    },
  ]
  return base.map((d) => ({
    ...d,
    itens: tranquilo ? d.itens.slice(0, 2) : intenso ? [...d.itens, ["22:00", "Programa noturno"] as [string, string]] : d.itens,
  }))
}

function BolhaAvori({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[84%] self-start rounded-2xl rounded-bl-sm border border-border bg-card px-4 py-3">{children}</div>
  )
}
function BolhaMinha({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[84%] self-end rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-primary-foreground">{children}</div>
}

export default function CriarComAvoriPage() {
  const { toast } = useToast()
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [passo, setPasso] = useState(0)
  const [texto, setTexto] = useState("")
  const [marcados, setMarcados] = useState<string[]>([])
  const [gerando, setGerando] = useState(false)
  const fimDaConversa = useRef<HTMLDivElement>(null)

  const terminou = passo >= PERGUNTAS.length
  const atual = PERGUNTAS[passo]
  const roteiro = terminou && !gerando ? gerarRoteiro(respostas) : null

  useEffect(() => {
    fimDaConversa.current?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [passo, gerando])

  function responder(valor: string) {
    const v = valor.trim()
    if (!v || !atual) return
    setRespostas((r) => ({ ...r, [atual.id]: v }))
    setTexto("")
    setMarcados([])
    const proximo = passo + 1
    setPasso(proximo)
    if (proximo >= PERGUNTAS.length) {
      setGerando(true)
      window.setTimeout(() => setGerando(false), 1400)
    }
  }

  function refazer() {
    setRespostas({})
    setPasso(0)
    setMarcados([])
    setGerando(false)
  }

  function criar() {
    toast({
      title: "A criação com a Avori ainda não está ligada",
      description: "Esta tela é uma prévia. Use “Criar do meu jeito” para criar a viagem agora.",
    })
  }

  const respondidas = Math.min(passo, PERGUNTAS.length)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href="/dashboard/trips/criar"
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Nova viagem
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Nova viagem com a Avori</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SeloPrevia />
          <Button asChild variant="outline" className="h-11 rounded-xl px-5">
            <Link href="/dashboard/trips/new">
              <PenLine className="h-4 w-4" aria-hidden />
              Criar do meu jeito
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,520px)_minmax(0,1fr)]">
        <section aria-label="Conversa" className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-card">
          <header className="border-b border-border px-5 py-3.5">
            <div className="text-sm font-semibold">
              {terminou ? "Tudo respondido" : `Pergunta ${passo + 1} de ${PERGUNTAS.length}`}
            </div>
            <div
              role="progressbar"
              aria-label="Perguntas respondidas"
              aria-valuemin={0}
              aria-valuemax={PERGUNTAS.length}
              aria-valuenow={respondidas}
              className="mt-2 flex gap-1"
            >
              {PERGUNTAS.map((p, i) => (
                <span key={p.id} className={cn("h-1 flex-1 rounded-full", i < respondidas ? "bg-primary" : "bg-border")} />
              ))}
            </div>
          </header>

          <div className="flex flex-1 flex-col justify-end gap-3 bg-background p-5" aria-live="polite">
            {PERGUNTAS.slice(0, respondidas).map((p) => (
              <div key={p.id} className="flex flex-col gap-3">
                <BolhaAvori>{p.texto}</BolhaAvori>
                <BolhaMinha>{respostas[p.id]}</BolhaMinha>
              </div>
            ))}
            {atual ? (
              <>
                <BolhaAvori>
                  <strong className="font-semibold">{atual.texto}</strong>
                  {atual.ajuda ? <span className="block text-sm text-muted-foreground">{atual.ajuda}</span> : null}
                </BolhaAvori>
                <div className="flex flex-wrap gap-2 pt-1">
                  {atual.opcoes.map((o) => {
                    const on = marcados.includes(o)
                    return (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={atual.multipla ? on : undefined}
                        onClick={() =>
                          atual.multipla ? setMarcados((m) => (on ? m.filter((x) => x !== o) : [...m, o])) : responder(o)
                        }
                        className={cn(
                          "inline-flex h-10 items-center rounded-full px-4 text-sm font-medium transition-colors",
                          on ? "bg-primary text-primary-foreground" : "border border-input hover:bg-muted",
                        )}
                      >
                        {o}
                      </button>
                    )
                  })}
                  {atual.multipla ? (
                    <Button
                      type="button"
                      disabled={marcados.length === 0}
                      onClick={() => responder(marcados.join(", "))}
                      className="h-10 rounded-full px-4"
                    >
                      Continuar
                    </Button>
                  ) : null}
                </div>
              </>
            ) : gerando ? (
              <BolhaAvori>
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 animate-pulse text-primary" aria-hidden />
                  Montando um roteiro para {respostas.destino}…
                </span>
              </BolhaAvori>
            ) : (
              <BolhaAvori>Pronto. Veja a prévia ao lado e ajuste o que quiser antes de criar.</BolhaAvori>
            )}
            <div ref={fimDaConversa} />
          </div>

          {!terminou ? (
            <form
              className="flex items-center gap-2 border-t border-border p-3"
              onSubmit={(e) => {
                e.preventDefault()
                responder(texto)
              }}
            >
              <label htmlFor="resposta" className="sr-only">
                Sua resposta
              </label>
              <Input
                id="resposta"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Ou escreva com suas palavras"
                className="h-12 rounded-xl text-base"
              />
              <Button type="submit" size="icon" aria-label="Enviar resposta" className="h-12 w-12 shrink-0 rounded-xl">
                <SendHorizontal className="h-5 w-5" aria-hidden />
              </Button>
            </form>
          ) : null}
        </section>

        <section aria-label="Prévia do roteiro" className="flex flex-col gap-3">
          <div className="relative flex h-32 items-center overflow-hidden rounded-2xl bg-primary px-6 text-primary-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element -- arte estática da marca */}
            <img src="/brand/avori-grafismo-floresta.svg" alt="" className="absolute inset-y-0 right-0 h-full w-1/2 object-cover" />
            <div className="relative">
              <div className="text-xs font-medium">Prévia do roteiro</div>
              <div className="text-3xl font-semibold leading-tight">{respostas.destino || "Seu destino"}</div>
              <div className="text-sm font-medium">
                {[respostas.datas, respostas.quem].filter(Boolean).join(" · ") || "Responda as perguntas ao lado"}
              </div>
            </div>
          </div>

          {roteiro
            ? roteiro.map((d, i) => (
                <article key={d.titulo} className="space-y-2 rounded-2xl border border-border bg-card px-4 py-3.5">
                  <header className="flex items-center gap-2.5">
                    <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">Dia {i + 1}</span>
                    <h3 className="text-base font-semibold">{d.titulo}</h3>
                  </header>
                  <ul className="space-y-1">
                    {d.itens.map(([h, t]) => (
                      <li key={h + t} className="flex gap-3 text-sm">
                        <span className="w-11 shrink-0 font-semibold tabular-nums">{h}</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))
            : [1, 2, 3].map((n) => (
                <div key={n} className="flex items-center gap-2.5 rounded-2xl border border-dashed border-input px-4 py-3.5">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">Dia {n}</span>
                  <span className="text-sm text-muted-foreground">{gerando ? "Montando…" : "Aparece quando você terminar as perguntas"}</span>
                </div>
              ))}

          <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
            <p className="min-w-60 flex-1 text-sm text-muted-foreground">
              Nada é salvo até você criar a viagem. Depois dá para editar cada atividade.
            </p>
            <Button type="button" variant="outline" onClick={refazer} className="h-12 rounded-xl px-5">
              <RotateCcw className="h-4 w-4" aria-hidden />
              Refazer
            </Button>
            <Button type="button" disabled={!roteiro} onClick={criar} className="h-12 rounded-xl px-7">
              Criar viagem
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
