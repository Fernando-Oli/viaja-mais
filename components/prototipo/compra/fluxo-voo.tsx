"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, BedDouble, Check, ChevronRight, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SeloPrevia } from "@/components/prototipo/selo-previa"
import { cn } from "@/lib/utils"
import { PASSAGEIROS, PESSOAS, TARIFAS, TAXA_EMBARQUE_PESSOA, VOOS, reais, type Voo } from "./dados"
import { Confirmacao, FormaPagamento, Passos, ResumoCompra, SiglaCompanhia } from "./pecas"

/**
 * Compra de passagens (PRÉVIA VISUAL): resultados → tarifa → passageiros →
 * pagamento → confirmação. Filtros e ordenação funcionam sobre os dados de
 * exemplo; nada é comprado nem gravado.
 */

const ETAPAS = ["Voo", "Tarifa", "Passageiros", "Pagamento"]
type Ordem = "recomendado" | "barato" | "rapido"
const minutos = (d: string) => {
  const [h, m] = d.match(/\d+/g)!.map(Number)
  return h * 60 + m
}

function Filtro({ rotulo, marcado, onChange, detalhe }: { rotulo: string; marcado: boolean; onChange: (v: boolean) => void; detalhe?: string }) {
  return (
    <label className="flex items-center gap-2.5 text-sm">
      <input type="checkbox" checked={marcado} onChange={(e) => onChange(e.target.checked)} className="h-5 w-5 accent-primary" />
      <span className="flex-1">{rotulo}</span>
      {detalhe ? <span className="text-xs font-medium text-muted-foreground">{detalhe}</span> : null}
    </label>
  )
}

function CartaoVoo({ voo, onEscolher }: { voo: Voo; onEscolher: () => void }) {
  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-2xl border bg-card p-4 md:flex-row md:items-center md:p-5",
        voo.selo === "Melhor equilíbrio" ? "border-2 border-primary" : "border-border",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-4">
        <SiglaCompanhia sigla={voo.sigla} />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">{voo.companhia}</span>
            {voo.selo ? (
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", voo.selo === "Melhor equilíbrio" ? "bg-citrico text-grafite" : "bg-muted")}>
                {voo.selo}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-xl font-semibold tabular-nums">{voo.saida}</div>
              <div className="text-xs font-medium text-muted-foreground">GRU</div>
            </div>
            <div className="flex flex-1 flex-col items-center text-xs font-medium">
              <span className="text-muted-foreground">{voo.duracao}</span>
              <span className="relative my-1 h-0.5 w-full bg-border">
                {voo.paradas ? <span className="absolute left-1/2 top-[-3px] h-2 w-2 rounded-full bg-input" /> : null}
              </span>
              <span className={voo.paradas ? "text-muted-foreground" : "text-primary"}>
                {voo.paradas ? `1 parada · ${voo.escala}` : "Direto"}
              </span>
            </div>
            <div className="text-center">
              <div className="text-xl font-semibold tabular-nums">
                {voo.chegada}
                {voo.diaSeguinte ? <sup className="text-[10px]">+1</sup> : null}
              </div>
              <div className="text-xs font-medium text-muted-foreground">LIS</div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 border-t border-border pt-3 md:w-48 md:flex-col md:items-end md:border-l md:border-t-0 md:pl-5 md:pt-0">
        <div className="md:text-right">
          <div className="text-xs font-medium text-muted-foreground">por pessoa, ida e volta</div>
          <div className="text-2xl font-semibold tabular-nums">{reais(voo.precoPessoa)}</div>
          <div className="text-xs font-medium text-muted-foreground">{reais(voo.precoPessoa * PESSOAS)} para {PESSOAS}</div>
        </div>
        <Button onClick={onEscolher} variant={voo.selo === "Melhor equilíbrio" ? "default" : "outline"} className="h-10 rounded-xl px-5">
          Selecionar
        </Button>
      </div>
    </article>
  )
}

export function FluxoVoo() {
  const [etapa, setEtapa] = useState(0)
  const [ordem, setOrdem] = useState<Ordem>("recomendado")
  const [diretos, setDiretos] = useState(true)
  const [comParada, setComParada] = useState(true)
  const [voo, setVoo] = useState<Voo>(VOOS[0])
  const [tarifaId, setTarifaId] = useState("classica")
  const [marcados, setMarcados] = useState(PASSAGEIROS.map((p) => p.id))
  const [passaporteFelipe, setPassaporteFelipe] = useState("")

  const lista = useMemo(() => {
    const filtrada = VOOS.filter((v) => (v.paradas ? comParada : diretos))
    if (ordem === "barato") return [...filtrada].sort((a, b) => a.precoPessoa - b.precoPessoa)
    if (ordem === "rapido") return [...filtrada].sort((a, b) => minutos(a.duracao) - minutos(b.duracao))
    return filtrada
  }, [ordem, diretos, comParada])

  const tarifa = TARIFAS.find((t) => t.id === tarifaId)!
  const qtd = marcados.length
  const subtotal = (voo.precoPessoa + tarifa.acrescimo) * qtd
  const taxas = TAXA_EMBARQUE_PESSOA * qtd
  const total = subtotal + taxas
  const faltaDado = marcados.includes("fo") && passaporteFelipe.trim().length < 6

  const resumo = (cta?: React.ReactNode) => (
    <ResumoCompra
      icone={<SiglaCompanhia sigla={voo.sigla} tamanho="h-10 w-10" />}
      titulo={`GRU ⇄ LIS · ${voo.companhia.split(" ")[0]}`}
      sub={`12 a 18 jun · ${qtd} ${qtd === 1 ? "adulto" : "adultos"} · ${tarifa.nome}`}
      linhas={[
        [`${qtd} × tarifa ${tarifa.nome}`, reais(subtotal)],
        ["Taxas de embarque", reais(taxas)],
      ]}
      total={total}
      parcelas={10}
    >
      {cta}
    </ResumoCompra>
  )

  if (etapa === 4) {
    return (
      <Confirmacao
        titulo="Passagens compradas."
        sub={`São Paulo ⇄ Lisboa · ${voo.companhia} · 12 a 18 de junho · ${qtd} passageiros.`}
        codigos={[
          ["Localizador", "TP7K2M"],
          ["Pedido Avori", "AV-20931"],
        ]}
        feitos={[
          ["Os voos entram nas reservas da viagem", "Ida e volta, com horários e localizador."],
          [`A despesa de ${reais(total)} é dividida`, `${reais(Math.round((total / PESSOAS) * 100) / 100)} para cada pessoa do grupo.`],
          ["Os bilhetes chegam por e-mail", "Para você e para cada passageiro."],
        ]}
        proximo={
          <Link href="/dashboard/reservar/hoteis" className="flex items-center gap-3 rounded-2xl bg-citrico p-4 text-grafite hover:bg-citrico/90">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-primary text-citrico">
              <BedDouble className="h-5 w-5" aria-hidden />
            </span>
            <span className="flex-1 text-sm">
              <strong className="font-semibold">Falta a hospedagem.</strong>
              <br />
              Lisboa, de 12 a 18 de junho, para {PESSOAS} pessoas.
            </span>
            <ChevronRight className="h-5 w-5" aria-hidden />
          </Link>
        }
      />
    )
  }

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
          <h1 className="text-3xl font-semibold tracking-tight">Voos para Lisboa</h1>
        </div>
        <SeloPrevia />
      </div>
      <Passos atual={etapa} itens={ETAPAS} />

      {etapa === 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
            <Search className="h-5 w-5 text-muted-foreground" aria-hidden />
            <span className="flex-1 text-[15px] font-medium">São Paulo (GRU) → Lisboa (LIS) · 12 a 18 jun · {PESSOAS} adultos · Econômica</span>
            <Button asChild variant="outline" className="h-10 rounded-xl">
              <Link href="/dashboard/bookings">Alterar busca</Link>
            </Button>
          </div>
          <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
            <aside aria-label="Filtros" className="h-fit space-y-4 rounded-2xl border border-border bg-card p-4">
              <h2 className="font-semibold">Filtros</h2>
              <fieldset className="space-y-2.5 border-t border-border pt-3">
                <legend className="mb-2 text-sm font-semibold">Paradas</legend>
                <Filtro rotulo="Direto" detalhe="R$ 4.960" marcado={diretos} onChange={setDiretos} />
                <Filtro rotulo="1 parada" detalhe="R$ 4.190" marcado={comParada} onChange={setComParada} />
              </fieldset>
            </aside>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">{lista.length} voos · ordenar por</span>
                {(
                  [
                    ["recomendado", "Recomendado"],
                    ["barato", "Mais barato"],
                    ["rapido", "Mais rápido"],
                  ] as const
                ).map(([v, r]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={ordem === v}
                    onClick={() => setOrdem(v)}
                    className={cn(
                      "h-9 rounded-full px-4 text-sm font-medium",
                      ordem === v ? "bg-primary text-primary-foreground" : "border border-input hover:bg-muted",
                    )}
                  >
                    {r}
                  </button>
                ))}
              </div>
              {lista.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-input p-8 text-center text-muted-foreground">
                  Nenhum voo com esses filtros. Marque pelo menos um tipo de parada.
                </p>
              ) : (
                lista.map((v) => (
                  <CartaoVoo
                    key={v.id}
                    voo={v}
                    onEscolher={() => {
                      setVoo(v)
                      setEtapa(1)
                    }}
                  />
                ))
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            {etapa === 1 ? (
              <>
                <section className="rounded-2xl border border-border bg-card px-5 py-2">
                  <div className="flex items-center gap-3 py-3">
                    <SiglaCompanhia sigla={voo.sigla} tamanho="h-10 w-10" />
                    <div className="flex-1">
                      <h2 className="font-semibold">
                        {voo.companhia} · {voo.paradas ? `1 parada em ${voo.escala}` : "voos diretos"}
                      </h2>
                      <div className="text-sm text-muted-foreground">Econômica</div>
                    </div>
                    <button type="button" onClick={() => setEtapa(0)} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
                      Trocar voo
                    </button>
                  </div>
                  {[
                    ["Ida", "sex, 12 jun", `${voo.saida} → ${voo.chegada}${voo.diaSeguinte ? " (+1)" : ""}`, voo.voos[0]],
                    ["Volta", "qui, 18 jun", "13:15 → 20:25", voo.voos[1]],
                  ].map(([r, d, h, n]) => (
                    <div key={r} className="flex gap-4 border-t border-border py-3 text-sm">
                      <span className="w-20 font-semibold">
                        {r}
                        <span className="block font-medium text-muted-foreground">{d}</span>
                      </span>
                      <span className="flex-1">
                        <strong className="font-semibold tabular-nums">{h}</strong>
                        <span className="block text-muted-foreground">
                          {voo.duracao} · {n}
                        </span>
                      </span>
                    </div>
                  ))}
                </section>
                <h2 className="text-xl font-semibold">Escolha a tarifa</h2>
                <div role="radiogroup" aria-label="Tarifa" className="grid gap-4 md:grid-cols-3">
                  {TARIFAS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={tarifaId === t.id}
                      onClick={() => setTarifaId(t.id)}
                      className={cn(
                        "flex flex-col gap-3 rounded-2xl bg-card p-4 text-left",
                        tarifaId === t.id ? "border-2 border-primary" : "border border-border hover:border-input",
                      )}
                    >
                      <span className="text-lg font-semibold">{t.nome}</span>
                      <span>
                        <span className="text-2xl font-semibold tabular-nums">{reais(voo.precoPessoa + t.acrescimo)}</span>{" "}
                        <span className="text-xs font-medium text-muted-foreground">por pessoa</span>
                      </span>
                      <ul className="space-y-1.5">
                        {t.itens.map(([ok, l]) => (
                          <li key={l} className={cn("flex gap-2 text-sm", !ok && "text-muted-foreground")}>
                            {ok ? <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden /> : <X className="h-4 w-4 shrink-0" aria-hidden />}
                            {l}
                          </li>
                        ))}
                      </ul>
                    </button>
                  ))}
                </div>
              </>
            ) : null}

            {etapa === 2 ? (
              <div className="grid gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
                <section className="h-fit space-y-2 rounded-2xl border border-border bg-card p-4">
                  <h2 className="font-semibold">Quem vai voar</h2>
                  <p className="text-sm text-muted-foreground">Puxamos do grupo da viagem. Desmarque quem compra por conta própria.</p>
                  <ul className="space-y-1">
                    {PASSAGEIROS.map((p) => {
                      const ok = p.id === "fo" ? !faltaDado : p.completo
                      return (
                        <li key={p.id}>
                          <label className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-muted">
                            <input
                              type="checkbox"
                              checked={marcados.includes(p.id)}
                              onChange={(e) => setMarcados((m) => (e.target.checked ? [...m, p.id] : m.filter((x) => x !== p.id)))}
                              className="h-5 w-5 accent-primary"
                            />
                            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground" aria-hidden>
                              {p.iniciais}
                            </span>
                            <span className="flex-1 leading-tight">
                              <span className="block text-sm font-semibold">{p.nome}</span>
                              <span className={cn("text-xs font-medium", ok ? "text-primary" : "text-destructive")}>
                                {ok ? "Dados completos" : "Falta o passaporte"}
                              </span>
                            </span>
                          </label>
                        </li>
                      )
                    })}
                  </ul>
                </section>
                <section className="h-fit space-y-4 rounded-2xl border border-border bg-card p-5">
                  <h2 className="font-semibold">Felipe Ortiz · passaporte</h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="passaporte">Número do passaporte</Label>
                      <Input id="passaporte" value={passaporteFelipe} onChange={(e) => setPassaporteFelipe(e.target.value)} placeholder="FX123456" className="h-12 rounded-xl" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="validade-passaporte">Validade</Label>
                      <Input id="validade-passaporte" placeholder="MM/AAAA" className="h-12 rounded-xl" />
                    </div>
                  </div>
                  <p className="flex gap-2 rounded-xl bg-muted px-3.5 py-3 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                    Para Portugal, o passaporte precisa valer pelo menos 3 meses depois da volta.
                  </p>
                </section>
              </div>
            ) : null}

            {etapa === 3 ? <FormaPagamento total={total} onPago={() => setEtapa(4)} /> : null}
          </div>

          {resumo(
            etapa === 1 ? (
              <Button className="h-13 w-full rounded-xl text-base" onClick={() => setEtapa(2)}>
                Continuar para passageiros
              </Button>
            ) : etapa === 2 ? (
              <div className="space-y-2">
                <Button className="h-13 w-full rounded-xl text-base" disabled={faltaDado || qtd === 0} onClick={() => setEtapa(3)}>
                  Continuar para pagamento
                </Button>
                {faltaDado ? <p className="text-xs font-medium text-destructive">Complete o passaporte do Felipe para continuar.</p> : null}
              </div>
            ) : undefined,
          )}
        </div>
      )}
    </div>
  )
}
