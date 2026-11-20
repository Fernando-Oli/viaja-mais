"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ChevronLeft, Loader2, PenLine, RotateCcw, SendHorizontal, Sparkles, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { RolagemComIndicador } from "@/components/ia/rolagem-com-indicador"
import { DIAS_MAXIMOS, type GerarRoteiro } from "@/lib/schemas/roteiro"
import type { DiaDoRoteiro, ItemDoRoteiro } from "@/lib/ai/roteiro"
import {
  corpoDaViagem,
  corposDosItens,
  datasDaViagem,
  hojeLocal,
  roteiroPronto,
  rotuloDoDia,
  tituloPadrao,
} from "@/lib/ai/salvar"

/**
 * Nova viagem com a Avori: conversa guiada, uma pergunta por vez, e o roteiro
 * gerado por IA ao lado, para revisar antes de criar.
 *
 * Visual da prévia do Fernando (rebranding Avori); a lógica é da S11:
 * - as respostas vão para `POST /api/roteiros/gerar` (S10), que só gera;
 * - a pessoa edita título, horários e atividades, e remove o que não quer;
 * - **nada é gravado** até "Criar viagem", que usa as rotas de viagem e de
 *   itinerário (`POST /api/trips` e `POST /api/trips/[id]/itinerary`);
 * - "Refazer" descarta tudo sem chamar nenhuma rota de escrita.
 *
 * @RF12.1 gerar roteiro por IA · @RF12.2 revisar e editar antes de gravar ·
 * @RF12.3 descartar sem salvar
 */

type Opcao = { rotulo: string; valor: string }

type Pergunta =
  | {
      id: "destino" | "quem"
      tipo: "livre"
      texto: string
      ajuda?: string
      opcoes: string[]
      maximo: number
    }
  | { id: "datas"; tipo: "datas"; texto: string; ajuda: string }
  | {
      id: "ritmo" | "orcamento"
      tipo: "escolha"
      texto: string
      ajuda?: string
      opcoes: Opcao[]
    }
  | {
      id: "interesses"
      tipo: "multipla"
      texto: string
      ajuda: string
      opcoes: string[]
      maximo: number
    }

const PERGUNTAS: Pergunta[] = [
  {
    id: "destino",
    tipo: "livre",
    texto: "Para onde vocês vão?",
    opcoes: ["Lisboa", "Rio de Janeiro", "Buenos Aires", "Chapada dos Veadeiros"],
    maximo: 160,
  },
  {
    id: "datas",
    tipo: "datas",
    texto: "Quando, e por quantos dias?",
    ajuda: `A Avori monta roteiros de até ${DIAS_MAXIMOS} dias. Para uma viagem mais longa, use “Criar do meu jeito”.`,
  },
  {
    id: "quem",
    tipo: "livre",
    texto: "Quem vai com você?",
    opcoes: ["Só eu", "Em casal", "Com amigos", "Em família"],
    maximo: 60,
  },
  {
    id: "ritmo",
    tipo: "escolha",
    texto: "Qual é o ritmo da viagem?",
    ajuda: "Isso define quantas atividades cabem em cada dia.",
    opcoes: [
      { rotulo: "Tranquilo", valor: "tranquilo" },
      { rotulo: "Equilibrado", valor: "equilibrado" },
      { rotulo: "Intenso", valor: "intenso" },
    ],
  },
  {
    id: "orcamento",
    tipo: "escolha",
    texto: "E o orçamento por pessoa?",
    opcoes: [
      { rotulo: "Econômico", valor: "economico" },
      { rotulo: "Moderado", valor: "moderado" },
      { rotulo: "Confortável", valor: "confortavel" },
    ],
  },
  {
    id: "interesses",
    tipo: "multipla",
    texto: "Do que vocês mais gostam?",
    ajuda: "Escolha quantos quiser, ou escreva outro.",
    opcoes: ["Comida", "História", "Natureza", "Museus", "Vida noturna", "Compras"],
    maximo: 40,
  },
]

const MAXIMO_INTERESSES = 8

type Respostas = Partial<GerarRoteiro> & { inicio?: string }
type Fase = "perguntas" | "gerando" | "erro" | "revisao" | "criando"

/** Item editável: o `id` só existe na tela, para a lista manter o foco ao editar e remover. */
type ItemEditavel = ItemDoRoteiro & { id: string }
type DiaEditavel = Omit<DiaDoRoteiro, "itens"> & { itens: ItemEditavel[] }

let proximoId = 0
const comIds = (dias: DiaDoRoteiro[]): DiaEditavel[] =>
  dias.map((d) => ({
    ...d,
    itens: d.itens.map((i) => ({ ...i, id: `item-${++proximoId}` })),
  }))

function BolhaAvori({ children }: { children: React.ReactNode }) {
  return <div className="max-w-[90%] self-start rounded-2xl rounded-bl-sm border border-border bg-card px-3.5 py-2.5 text-sm">{children}</div>
}
function BolhaMinha({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[86%] self-end rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">{children}</div>
  )
}

function Chip({ ativo, onClick, children, ...resto }: React.ButtonHTMLAttributes<HTMLButtonElement> & { ativo?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-9 items-center rounded-full px-3.5 text-sm font-medium transition-colors disabled:opacity-50",
        ativo ? "bg-primary text-primary-foreground" : "border border-input hover:bg-muted",
      )}
      {...resto}
    >
      {children}
    </button>
  )
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

export default function CriarComAvoriPage() {
  const { toast } = useToast()
  const router = useRouter()
  const [respostas, setRespostas] = useState<Respostas>({})
  const [exibidas, setExibidas] = useState<string[]>([])
  const [passo, setPasso] = useState(0)
  const [texto, setTexto] = useState("")
  const [marcados, setMarcados] = useState<string[]>([])
  const [inicio, setInicio] = useState("")
  const [diasEscolhidos, setDiasEscolhidos] = useState<number | null>(null)
  const [fase, setFase] = useState<Fase>("perguntas")
  const [erro, setErro] = useState<string | null>(null)
  const [roteiro, setRoteiro] = useState<DiaEditavel[]>([])
  const [titulo, setTitulo] = useState("")
  const rolagemDaConversa = useRef<HTMLDivElement>(null)
  const previa = useRef<HTMLElement>(null)
  // Cada geração tem um número; resposta que chega depois de "Refazer" é ignorada.
  const geracao = useRef(0)

  const atual = fase === "perguntas" ? PERGUNTAS[passo] : undefined
  const respondidas = Math.min(passo, PERGUNTAS.length)
  const datas = respostas.inicio && respostas.dias ? datasDaViagem(respostas.inicio, respostas.dias) : []
  const pronto = roteiroPronto(roteiro)

  // Rola só o painel da conversa (scrollIntoView arrastaria a página junto).
  useEffect(() => {
    const painel = rolagemDaConversa.current
    painel?.scrollTo({ top: painel.scrollHeight, behavior: "smooth" })
  }, [passo, fase])

  // Celular: os painéis ficam um embaixo do outro; quando o roteiro sai, a prioridade é ele.
  useEffect(() => {
    if (fase !== "revisao" || window.matchMedia("(min-width: 1024px)").matches) return
    previa.current?.scrollIntoView({ block: "start", behavior: "smooth" })
  }, [fase])

  async function gerar(r: Respostas) {
    const minha = ++geracao.current
    setFase("gerando")
    setErro(null)
    try {
      const resposta = await fetch("/api/roteiros/gerar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          destino: r.destino,
          dias: r.dias,
          quem: r.quem,
          ritmo: r.ritmo,
          orcamento: r.orcamento,
          interesses: r.interesses ?? [],
        }),
      })
      const corpo = await resposta.json().catch(() => null)
      if (minha !== geracao.current) return
      if (!resposta.ok || !corpo?.roteiro?.dias) {
        throw new Error(corpo?.error ?? "Não foi possível montar o roteiro agora.")
      }
      setRoteiro(comIds(corpo.roteiro.dias))
      setTitulo(tituloPadrao(r.destino ?? ""))
      setFase("revisao")
    } catch (e) {
      if (minha !== geracao.current) return
      const mensagem =
        e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Sem conexão com o servidor. Tente de novo."
      setErro(mensagem)
      setFase("erro")
      toast({
        title: "A Avori não conseguiu montar o roteiro",
        description: mensagem,
        variant: "destructive",
      })
    }
  }

  function avancar(campos: Respostas, exibida: string) {
    const novas = { ...respostas, ...campos }
    setRespostas(novas)
    setExibidas((e) => [...e, exibida])
    setTexto("")
    setMarcados([])
    const proximo = passo + 1
    setPasso(proximo)
    if (proximo >= PERGUNTAS.length) void gerar(novas)
  }

  function responderLivre(valor: string) {
    const v = valor.trim()
    if (!v || !atual || atual.tipo !== "livre") return
    avancar({ [atual.id]: v }, v)
  }

  function adicionarInteresse(valor: string) {
    const v = valor.trim()
    if (!v || marcados.includes(v) || marcados.length >= MAXIMO_INTERESSES) return
    setMarcados((m) => [...m, v])
    setTexto("")
  }

  function refazer() {
    geracao.current++
    setRespostas({})
    setExibidas([])
    setPasso(0)
    setTexto("")
    setMarcados([])
    setInicio("")
    setDiasEscolhidos(null)
    setFase("perguntas")
    setErro(null)
    setRoteiro([])
    setTitulo("")
  }

  function editarItem(dia: number, id: string, campos: Partial<ItemDoRoteiro>) {
    setRoteiro((r) =>
      r.map((d, i) =>
        i !== dia
          ? d
          : {
              ...d,
              itens: d.itens.map((it) => (it.id === id ? { ...it, ...campos } : it)),
            },
      ),
    )
  }

  function removerItem(dia: number, id: string) {
    setRoteiro((r) => r.map((d, i) => (i !== dia ? d : { ...d, itens: d.itens.filter((it) => it.id !== id) })))
  }

  async function criar() {
    if (!respostas.inicio || !respostas.destino || !respostas.dias || !pronto) return
    setFase("criando")
    try {
      const resposta = await fetch("/api/trips", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          corpoDaViagem({
            titulo,
            destino: respostas.destino,
            inicio: respostas.inicio,
            dias: respostas.dias,
          }),
        ),
      })
      const corpo = await resposta.json().catch(() => null)
      const viagemId: string | undefined = corpo?.data?.[0]?.id
      if (!resposta.ok || !viagemId) throw new Error(corpo?.error ?? "Não foi possível criar a viagem.")

      // A viagem já existe; cada atividade é um pedido independente à rota de
      // itinerário. Sem transação: o que falhar é contado e avisado.
      const itens = corposDosItens(roteiro, respostas.inicio)
      const resultados = await Promise.allSettled(
        itens.map((item) =>
          fetch(`/api/trips/${viagemId}/itinerary`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(item),
          }).then((r) => {
            if (!r.ok) throw new Error(String(r.status))
          }),
        ),
      )
      const falhas = resultados.filter((r) => r.status === "rejected").length
      if (falhas === 0) {
        toast({
          title: "Viagem criada",
          description: `${plural(itens.length, "atividade", "atividades")} no itinerário.`,
        })
      } else {
        toast({
          title: "Viagem criada, mas faltou parte do roteiro",
          description: `${falhas} de ${plural(itens.length, "atividade", "atividades")} não foram salvas. Dá para incluí-las no itinerário.`,
          variant: "destructive",
        })
      }
      router.push(`/dashboard/trips/${viagemId}`)
    } catch (e) {
      const mensagem = e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Sem conexão com o servidor."
      toast({
        title: "A viagem não foi criada",
        description: mensagem,
        variant: "destructive",
      })
      setFase("revisao")
    }
  }

  const bloqueado = fase === "gerando" || fase === "criando"

  return (
    <div className="space-y-3 lg:space-y-4">
      {/* Topo numa linha só: o espaço vertical é do roteiro. */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            href="/dashboard/trips/criar"
            aria-label="Voltar para Nova viagem"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-primary hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </Link>
          <h1 className="truncate text-xl font-semibold tracking-tight lg:text-2xl">Nova viagem com a Avori</h1>
        </div>
        <Button asChild variant="outline" className="h-9 rounded-xl px-3 text-sm">
          {/* No celular só o ícone, para o topo caber numa linha; o nome acessível é o mesmo. */}
          <Link href="/dashboard/trips/new" aria-label="Criar do meu jeito">
            <PenLine className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Criar do meu jeito</span>
          </Link>
        </Button>
      </div>

      {/*
        Altura fixa, rolagem por painel: nem a conversa nem o roteiro esticam a página.
        Prioridade de espaço para o roteiro (pedido do Micael, 20/11): conversa estreita no
        desktop e encolhida no celular depois que o roteiro sai.
        Desktop: a grade ocupa o resto da tela (barra 72px + margens 72px + topo ≈ 12.5rem).
        Celular: cada painel cabe numa tela (barra de 64px em cima e abas de 64px embaixo).
      */}
      <div className="grid gap-4 lg:h-[calc(100dvh-12.5rem)] lg:min-h-[24rem] lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)] lg:gap-5">
        <section
          aria-label="Conversa"
          className={cn(
            "flex flex-col overflow-hidden rounded-2xl border border-border bg-card lg:h-full lg:min-h-0",
            fase === "revisao" || fase === "criando" ? "h-56" : "h-[calc(100dvh-13rem)] min-h-[22rem]",
          )}
        >
          <header className="shrink-0 border-b border-border px-4 py-2.5">
            <div className="text-xs font-semibold">
              {atual ? `Pergunta ${passo + 1} de ${PERGUNTAS.length}` : "Tudo respondido"}
            </div>
            <div
              role="progressbar"
              aria-label="Perguntas respondidas"
              aria-valuemin={0}
              aria-valuemax={PERGUNTAS.length}
              aria-valuenow={respondidas}
              className="mt-1.5 flex gap-1"
            >
              {PERGUNTAS.map((p, i) => (
                <span key={p.id} className={cn("h-1 flex-1 rounded-full", i < respondidas ? "bg-primary" : "bg-border")} />
              ))}
            </div>
          </header>

          <RolagemComIndicador
            refRolagem={rolagemDaConversa}
            className="bg-background"
            rotuloIndicador="Ver o resto da conversa"
          >
            <div className="flex min-h-full flex-col justify-end gap-2.5 p-4" aria-live="polite">
              {PERGUNTAS.slice(0, respondidas).map((p, i) => (
                <div key={p.id} className="flex flex-col gap-2.5">
                  <BolhaAvori>{p.texto}</BolhaAvori>
                  <BolhaMinha>{exibidas[i]}</BolhaMinha>
                </div>
              ))}

              {atual ? (
                <>
                  <BolhaAvori>
                    <strong className="font-semibold">{atual.texto}</strong>
                    {"ajuda" in atual && atual.ajuda ? (
                      <span className="block text-xs text-muted-foreground">{atual.ajuda}</span>
                    ) : null}
                  </BolhaAvori>

                  {atual.tipo === "livre" ? (
                    <div className="flex flex-wrap gap-1.5">
                      {atual.opcoes.map((o) => (
                        <Chip key={o} onClick={() => responderLivre(o)}>
                          {o}
                        </Chip>
                      ))}
                    </div>
                  ) : null}

                  {atual.tipo === "escolha" ? (
                    <div className="flex flex-wrap gap-1.5">
                      {atual.opcoes.map((o) => (
                        <Chip key={o.valor} onClick={() => avancar({ [atual.id]: o.valor } as Respostas, o.rotulo)}>
                          {o.rotulo}
                        </Chip>
                      ))}
                    </div>
                  ) : null}

                  {atual.tipo === "multipla" ? (
                    <div className="flex flex-wrap gap-1.5">
                      {[...atual.opcoes, ...marcados.filter((m) => !atual.opcoes.includes(m))].map((o) => {
                        const on = marcados.includes(o)
                        return (
                          <Chip
                            key={o}
                            ativo={on}
                            aria-pressed={on}
                            disabled={!on && marcados.length >= MAXIMO_INTERESSES}
                            onClick={() => setMarcados((m) => (on ? m.filter((x) => x !== o) : [...m, o]))}
                          >
                            {o}
                          </Chip>
                        )
                      })}
                      <Button
                        type="button"
                        disabled={marcados.length === 0}
                        onClick={() => avancar({ interesses: marcados }, marcados.join(", "))}
                        className="h-9 rounded-full px-4"
                      >
                        Continuar
                      </Button>
                    </div>
                  ) : null}

                  {atual.tipo === "datas" ? (
                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <Label htmlFor="inicio">Data de início</Label>
                        <Input
                          id="inicio"
                          type="date"
                          min={hojeLocal()}
                          value={inicio}
                          onChange={(e) => setInicio(e.target.value)}
                          className="h-10 w-full max-w-56 rounded-xl"
                        />
                      </div>
                      <div role="group" aria-label="Quantos dias" className="flex flex-wrap gap-1.5">
                        {Array.from({ length: DIAS_MAXIMOS }, (_, i) => i + 1).map((n) => (
                          <Chip
                            key={n}
                            ativo={diasEscolhidos === n}
                            aria-pressed={diasEscolhidos === n}
                            onClick={() => setDiasEscolhidos(n)}
                          >
                            {plural(n, "dia", "dias")}
                          </Chip>
                        ))}
                      </div>
                      <Button
                        type="button"
                        disabled={!inicio || !diasEscolhidos || inicio < hojeLocal()}
                        onClick={() =>
                          avancar(
                            { inicio, dias: diasEscolhidos ?? 1 },
                            `A partir de ${rotuloDoDia(inicio)}, ${plural(diasEscolhidos ?? 1, "dia", "dias")}`,
                          )
                        }
                        className="h-9 rounded-full px-4"
                      >
                        Continuar
                      </Button>
                    </div>
                  ) : null}
                </>
              ) : fase === "gerando" ? (
                <BolhaAvori>
                  <span className="inline-flex items-center gap-2">
                    <Sparkles className="h-4 w-4 animate-pulse text-primary" aria-hidden />
                    Montando um roteiro para {respostas.destino}…
                  </span>
                </BolhaAvori>
              ) : fase === "erro" ? (
                <BolhaAvori>
                  <span role="alert" className="block">
                    {erro}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void gerar(respostas)}
                    className="mt-2 h-9 rounded-full px-4"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    Tentar de novo
                  </Button>
                </BolhaAvori>
              ) : (
                <BolhaAvori>Pronto. Revise o roteiro ao lado e ajuste o que quiser antes de criar a viagem.</BolhaAvori>
              )}
            </div>
          </RolagemComIndicador>

          {atual && (atual.tipo === "livre" || atual.tipo === "multipla") ? (
            <form
              className="flex shrink-0 items-center gap-2 border-t border-border p-2.5"
              onSubmit={(e) => {
                e.preventDefault()
                if (atual.tipo === "multipla") adicionarInteresse(texto)
                else responderLivre(texto)
              }}
            >
              <label htmlFor="resposta" className="sr-only">
                {atual.tipo === "multipla" ? "Outro interesse" : "Sua resposta"}
              </label>
              <Input
                id="resposta"
                value={texto}
                maxLength={atual.maximo}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={atual.tipo === "multipla" ? "Outro interesse" : "Ou escreva com suas palavras"}
                className="h-10 rounded-xl text-base"
              />
              <Button type="submit" size="icon" aria-label="Enviar resposta" className="h-10 w-10 shrink-0 rounded-xl">
                <SendHorizontal className="h-4 w-4" aria-hidden />
              </Button>
            </form>
          ) : null}
        </section>

        <section
          ref={previa}
          aria-label="Prévia do roteiro"
          className="flex h-[calc(100dvh-9rem)] min-h-[24rem] scroll-mt-20 flex-col gap-2 lg:h-full lg:min-h-0"
        >
          <div className="relative flex h-14 shrink-0 items-center overflow-hidden rounded-xl bg-primary px-4 text-primary-foreground">
            {/* eslint-disable-next-line @next/next/no-img-element -- arte estática da marca */}
            <img
              src="/brand/avori-grafismo-floresta.svg"
              alt=""
              className="absolute inset-y-0 right-0 h-full w-1/3 object-cover"
            />
            <div className="relative min-w-0 max-w-[66%]">
              <div className="truncate text-lg font-semibold leading-tight">{respostas.destino || "Seu destino"}</div>
              <div className="truncate text-xs font-medium">
                {[datas.length ? `${rotuloDoDia(datas[0])} a ${rotuloDoDia(datas[datas.length - 1])}` : null, exibidas[2]]
                  .filter(Boolean)
                  .join(" · ") || "Responda as perguntas ao lado"}
              </div>
            </div>
          </div>

          <RolagemComIndicador rotulo="Dias do roteiro" classNameRolagem="space-y-2" rotuloIndicador="Ver mais do roteiro">
            {fase === "revisao" || fase === "criando" ? (
              <>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2">
                  <Label htmlFor="titulo-viagem" className="shrink-0 text-xs text-muted-foreground">
                    Título da viagem
                  </Label>
                  <Input
                    id="titulo-viagem"
                    value={titulo}
                    maxLength={120}
                    disabled={fase === "criando"}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder={tituloPadrao(respostas.destino ?? "")}
                    className="h-9 rounded-lg"
                  />
                </div>

                {roteiro.map((d, i) => (
                  <article
                    key={`dia-${i}`}
                    aria-label={`Dia ${i + 1}`}
                    className="space-y-1.5 rounded-xl border border-border bg-card px-3 py-2.5"
                  >
                    <header className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
                        Dia {i + 1}
                      </span>
                      {datas[i] ? (
                        <span className="text-xs font-medium text-muted-foreground">{rotuloDoDia(datas[i])}</span>
                      ) : null}
                      <h3 className="text-sm font-semibold">{d.titulo}</h3>
                    </header>
                    {d.itens.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhuma atividade neste dia.</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {d.itens.map((it, j) => (
                          // No celular: horário e "×" numa linha, título com a largura toda embaixo.
                          // A partir de sm: tudo numa linha só.
                          <li key={it.id} className="grid grid-cols-[1fr_auto] items-start gap-1.5 sm:grid-cols-[6.5rem_1fr_auto]">
                            <Input
                              type="time"
                              aria-label={`Horário da atividade ${j + 1} do dia ${i + 1}`}
                              value={it.horario}
                              disabled={fase === "criando"}
                              onChange={(e) =>
                                editarItem(i, it.id, {
                                  horario: e.target.value,
                                })
                              }
                              className="order-1 h-9 w-[6.5rem] rounded-lg tabular-nums"
                            />
                            <div className="order-3 col-span-2 min-w-0 space-y-0.5 sm:order-2 sm:col-span-1">
                              <Input
                                aria-label={`Título da atividade ${j + 1} do dia ${i + 1}`}
                                value={it.titulo}
                                maxLength={120}
                                disabled={fase === "criando"}
                                aria-invalid={!it.titulo.trim()}
                                onChange={(e) =>
                                  editarItem(i, it.id, {
                                    titulo: e.target.value,
                                  })
                                }
                                className="h-9 rounded-lg"
                              />
                              {it.local || it.descricao ? (
                                <p className="px-1 text-xs text-muted-foreground">
                                  {[it.local, it.descricao].filter(Boolean).join(" · ")}
                                </p>
                              ) : null}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Remover atividade ${j + 1} do dia ${i + 1}`}
                              disabled={fase === "criando"}
                              onClick={() => removerItem(i, it.id)}
                              className="order-2 h-9 w-9 sm:order-3"
                            >
                              <X className="h-4 w-4" aria-hidden />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </article>
                ))}
              </>
            ) : (
              Array.from({ length: respostas.dias ?? 3 }, (_, n) => (
                <div key={n} className="flex items-center gap-2 rounded-xl border border-dashed border-input px-3 py-2.5">
                  <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">Dia {n + 1}</span>
                  <span className="text-sm text-muted-foreground">
                    {fase === "gerando"
                      ? "Montando…"
                      : fase === "erro"
                        ? "Não foi possível montar"
                        : "Aparece quando você terminar as perguntas"}
                  </span>
                </div>
              ))
            )}
          </RolagemComIndicador>

          <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border pt-2">
            <p className="min-w-0 flex-1 text-xs text-muted-foreground">
              {fase === "revisao" && !pronto ? "Toda atividade precisa de título e horário." : "Nada é salvo até você criar a viagem."}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={refazer}
              disabled={fase === "criando"}
              className="h-10 rounded-xl px-4"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Refazer
            </Button>
            <Button
              type="button"
              disabled={fase !== "revisao" || !pronto || bloqueado}
              onClick={() => void criar()}
              className="h-10 rounded-xl px-5"
            >
              {fase === "criando" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {fase === "criando" ? "Criando…" : "Criar viagem"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}
