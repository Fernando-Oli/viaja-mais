"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, BedDouble, CalendarDays, Check, ChevronRight, Clock, Coffee, CookingPot, Heart, Landmark, Search, Star, Wifi } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CapaViagem } from "@/components/brand/capa-viagem"
import { SeloPrevia } from "@/components/prototipo/selo-previa"
import { cn } from "@/lib/utils"
import { HOTEIS, NOITES, PESSOAS, reais, type Hotel } from "./dados"
import { Confirmacao, FormaPagamento, Passos, ResumoCompra } from "./pecas"

/**
 * Reserva de hotel (PRÉVIA VISUAL): resultados → hotel → pagamento →
 * confirmação. Filtros funcionam sobre os dados de exemplo; nada é reservado.
 */

const ETAPAS = ["Hotel", "Opção", "Pagamento"]

function Nota({ nota, texto }: { nota: string; texto: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex h-7 min-w-10 items-center justify-center rounded-lg bg-primary px-1.5 text-sm font-semibold text-primary-foreground">{nota}</span>
      <span className="text-sm font-medium">{texto}</span>
    </span>
  )
}

function Estrelas({ n }: { n: number }) {
  if (!n) return null
  return (
    <span role="img" aria-label={`${n} estrelas`} className="inline-flex">
      {Array.from({ length: n }, (_, i) => (
        <Star key={i} className="h-3.5 w-3.5 fill-primary text-primary" aria-hidden />
      ))}
    </span>
  )
}

const OPCOES = [
  { id: "sem-cafe", nome: "Apartamento inteiro", detalhe: "Sem café · cancelamento grátis até 5 jun", fator: 1 },
  { id: "com-cafe", nome: "Com café da manhã", detalhe: "Cancelamento grátis até 5 jun", fator: 1.12 },
  { id: "nao-reembolsavel", nome: "Tarifa não reembolsável", detalhe: "Sem café · sem cancelamento", fator: 0.91 },
]

export function FluxoHotel() {
  const [etapa, setEtapa] = useState(0)
  const [hotel, setHotel] = useState<Hotel>(HOTEIS[0])
  const [opcao, setOpcao] = useState("sem-cafe")
  const [soCancelamento, setSoCancelamento] = useState(false)
  const [soCafe, setSoCafe] = useState(false)
  const [salvos, setSalvos] = useState<string[]>([])

  const lista = useMemo(
    () => HOTEIS.filter((h) => (!soCancelamento || h.cancelamento) && (!soCafe || h.cafe)),
    [soCancelamento, soCafe],
  )
  const fator = OPCOES.find((o) => o.id === opcao)!.fator
  const hospedagem = Math.round(hotel.noite * NOITES * fator)
  const taxas = 310
  const total = hospedagem + taxas

  if (etapa === 3) {
    return (
      <Confirmacao
        titulo="Hospedagem reservada."
        sub={`${hotel.nome} · 12 a 18 de junho · ${NOITES} noites · ${PESSOAS} hóspedes.`}
        codigos={[
          ["Código da reserva", "BK-5521"],
          ["Pedido Avori", "AV-20947"],
        ]}
        feitos={[
          ["A hospedagem entra nas reservas da viagem", "Com endereço, check-in e contato do anfitrião."],
          [`A despesa de ${reais(total)} é dividida`, `${reais(Math.round((total / PESSOAS) * 100) / 100)} para cada pessoa.`],
          ["O check-in aparece no roteiro", "Sex, 12 jun, às 15h, no dia 1."],
        ]}
        proximo={
          <Link href="/dashboard/trips" className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 hover:bg-muted">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-muted text-primary">
              <CalendarDays className="h-5 w-5" aria-hidden />
            </span>
            <span className="flex-1 text-sm">
              <strong className="font-semibold">Ver o roteiro da viagem</strong>
              <br />O check-in já estaria no dia 1.
            </span>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Link>
        }
      />
    )
  }

  const resumo = (cta?: React.ReactNode) => (
    <ResumoCompra
      icone={<CapaViagem semente={hotel.id} className="h-12 w-12 shrink-0 rounded-lg" />}
      titulo={hotel.nome}
      sub={`12 a 18 jun · ${NOITES} noites · ${PESSOAS} adultos`}
      linhas={[
        [`${NOITES} noites`, reais(hospedagem)],
        ["Taxas e encargos", reais(taxas)],
      ]}
      total={total}
      parcelas={6}
    >
      {cta}
    </ResumoCompra>
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-3">
          {etapa === 0 ? (
            <Link href="/dashboard/bookings" className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Reservas
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => setEtapa(etapa - 1)}
              className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Voltar
            </button>
          )}
          <h1 className="text-3xl font-semibold tracking-tight">{etapa === 0 ? "Hotéis em Lisboa" : hotel.nome}</h1>
        </div>
        <SeloPrevia />
      </div>
      <Passos atual={etapa} itens={ETAPAS} />

      {etapa === 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <Search className="h-5 w-5 text-muted-foreground" aria-hidden />
            <span className="flex-1 text-[15px] font-medium">Lisboa, Portugal · 12 a 18 jun · {NOITES} noites · {PESSOAS} adultos · 2 quartos</span>
            <Button asChild variant="outline" className="h-10 rounded-xl">
              <Link href="/dashboard/bookings">Alterar busca</Link>
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["Cancelamento grátis", soCancelamento, setSoCancelamento],
                ["Café da manhã", soCafe, setSoCafe],
              ] as const
            ).map(([r, on, set]) => (
              <button
                key={r}
                type="button"
                aria-pressed={on}
                onClick={() => set(!on)}
                className={cn("h-9 rounded-full px-4 text-sm font-medium", on ? "bg-primary text-primary-foreground" : "border border-input hover:bg-muted")}
              >
                {r}
              </button>
            ))}
            <span className="ml-auto text-sm font-medium text-muted-foreground">{lista.length} opções</span>
          </div>
          <div className="space-y-3">
            {lista.map((h) => (
              <article key={h.id} className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card md:flex-row">
                <CapaViagem semente={h.id} className="h-44 shrink-0 md:h-auto md:w-56">
                  <button
                    type="button"
                    aria-pressed={salvos.includes(h.id)}
                    aria-label={`Salvar ${h.nome}`}
                    onClick={() => setSalvos((s) => (s.includes(h.id) ? s.filter((x) => x !== h.id) : [...s, h.id]))}
                    className="absolute right-2.5 top-2.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-card"
                  >
                    <Heart className={cn("h-[18px] w-[18px]", salvos.includes(h.id) && "fill-primary text-primary")} aria-hidden />
                  </button>
                </CapaViagem>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-semibold">{h.nome}</h2>
                    <Estrelas n={h.estrelas} />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {h.tipo} · {h.bairro}
                  </div>
                  <Nota nota={h.nota} texto={h.avaliacao} />
                  {h.destaque ? (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-primary">
                      <Check className="h-4 w-4" aria-hidden />
                      {h.destaque}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-end justify-between gap-3 border-t border-border p-4 md:w-48 md:flex-col md:items-end md:justify-end md:border-l md:border-t-0">
                  <div className="md:text-right">
                    <div className="text-xs font-medium text-muted-foreground">por noite</div>
                    <div className="text-2xl font-semibold tabular-nums">{reais(h.noite)}</div>
                    <div className="text-xs font-medium text-muted-foreground">
                      {reais(h.noite * NOITES)} por {NOITES} noites
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    className="h-10 rounded-xl"
                    onClick={() => {
                      setHotel(h)
                      setEtapa(1)
                    }}
                  >
                    Ver opções
                  </Button>
                </div>
              </article>
            ))}
            {lista.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-input p-8 text-center text-muted-foreground">Nenhum hotel com esses filtros.</p>
            ) : null}
          </div>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {etapa === 1 ? (
              <>
                <div className="grid h-64 grid-cols-3 grid-rows-2 gap-2 overflow-hidden rounded-2xl">
                  <CapaViagem semente={hotel.id} className="col-span-2 row-span-2" />
                  <CapaViagem semente={hotel.id + "b"} />
                  <CapaViagem semente={hotel.id + "c"} />
                </div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm text-muted-foreground">
                      {hotel.tipo} · {hotel.bairro}
                    </div>
                  </div>
                  <Nota nota={hotel.nota} texto={hotel.avaliacao} />
                </div>
                <ul className="grid grid-cols-2 gap-2.5 text-sm md:grid-cols-3">
                  {(
                    [
                      [BedDouble, "2 quartos, 4 hóspedes"],
                      [CookingPot, "Cozinha equipada"],
                      [Wifi, "Wi-Fi rápido"],
                      [Landmark, "Vista para o Tejo"],
                      [Coffee, "Café da manhã opcional"],
                      [Clock, "Check-in a partir de 15h"],
                    ] as const
                  ).map(([Icone, t]) => (
                    <li key={t} className="flex items-center gap-2.5">
                      <Icone className="h-5 w-5 text-primary" aria-hidden />
                      {t}
                    </li>
                  ))}
                </ul>
                <h2 className="text-xl font-semibold">Escolha a opção</h2>
                <div role="radiogroup" aria-label="Opção de quarto" className="space-y-2">
                  {OPCOES.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={opcao === o.id}
                      onClick={() => setOpcao(o.id)}
                      className={cn(
                        "flex w-full items-center gap-3.5 rounded-2xl bg-card px-4 py-3.5 text-left",
                        opcao === o.id ? "border-2 border-primary" : "border border-border hover:border-input",
                      )}
                    >
                      <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border-2", opcao === o.id ? "border-primary" : "border-input")}>
                        {opcao === o.id ? <span className="h-2.5 w-2.5 rounded-full bg-primary" /> : null}
                      </span>
                      <span className="flex-1">
                        <span className="block font-semibold">{o.nome}</span>
                        <span className="text-sm text-muted-foreground">{o.detalhe}</span>
                      </span>
                      <span className="text-right">
                        <span className="block text-lg font-semibold tabular-nums">{reais(Math.round(hotel.noite * NOITES * o.fator))}</span>
                        <span className="text-xs font-medium text-muted-foreground">{NOITES} noites</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
                  <h2 className="text-lg font-semibold">Hóspede principal</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="hospede">Nome completo</Label>
                      <Input id="hospede" defaultValue="Marina Costa Silva" className="h-12 rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="chegada">Chegada prevista</Label>
                      <Input id="chegada" defaultValue="15:00 – 16:00" className="h-12 rounded-xl" />
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="pedido">
                        Pedidos ao anfitrião <span className="font-normal text-muted-foreground">(opcional)</span>
                      </Label>
                      <Input id="pedido" placeholder="Ex.: chegamos de voo noturno" className="h-12 rounded-xl" />
                    </div>
                  </div>
                </section>
                <FormaPagamento total={total} onPago={() => setEtapa(3)} />
              </>
            )}
          </div>
          {resumo(
            etapa === 1 ? (
              <div className="space-y-2">
                <Button className="h-13 w-full rounded-xl text-base" onClick={() => setEtapa(2)}>
                  Reservar
                </Button>
                <p className="text-center text-xs font-medium text-muted-foreground">Você ainda não paga nada nesta etapa.</p>
              </div>
            ) : undefined,
          )}
        </div>
      )}
    </div>
  )
}
