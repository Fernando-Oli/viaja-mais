"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, Copy, CreditCard, Lock, QrCode, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { SeloPrevia } from "@/components/prototipo/selo-previa"
import { cn } from "@/lib/utils"
import { PESSOAS, reais } from "./dados"

/** Peças compartilhadas pelos fluxos de voo e de hotel (PRÉVIA VISUAL). */

export function Passos({ atual, itens }: { atual: number; itens: string[] }) {
  return (
    <ol aria-label="Etapas da compra" className="flex flex-wrap items-center gap-2">
      {itens.map((t, i) => (
        <li key={t} aria-current={i === atual ? "step" : undefined} className="flex items-center gap-2 text-sm">
          <span
            className={cn(
              "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
              i < atual && "bg-primary text-primary-foreground",
              i === atual && "bg-citrico text-grafite",
              i > atual && "border border-input text-muted-foreground",
            )}
          >
            {i < atual ? <Check className="h-3.5 w-3.5" aria-hidden /> : i + 1}
          </span>
          <span className={cn(i === atual ? "font-semibold" : "font-medium", i > atual && "text-muted-foreground")}>{t}</span>
          {i < itens.length - 1 ? <span aria-hidden className="mx-1 hidden h-px w-7 bg-border sm:block" /> : null}
        </li>
      ))}
    </ol>
  )
}

export function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3 text-sm", forte && "border-t border-border pt-2.5 text-base font-semibold")}>
      <span className={forte ? undefined : "text-muted-foreground"}>{rotulo}</span>
      <span className="tabular-nums">{valor}</span>
    </div>
  )
}

/** Resumo lateral com o total e a opção de dividir com o grupo. */
export function ResumoCompra({
  icone,
  titulo,
  sub,
  linhas,
  total,
  parcelas,
  children,
}: {
  icone: React.ReactNode
  titulo: string
  sub: string
  linhas: [string, string][]
  total: number
  parcelas: number
  children?: React.ReactNode
}) {
  const [dividir, setDividir] = useState(true)
  return (
    <aside aria-label="Resumo da compra" className="space-y-4 lg:sticky lg:top-24">
      <section className="space-y-2.5 rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          {icone}
          <div className="leading-tight">
            <div className="font-semibold">{titulo}</div>
            <div className="text-sm text-muted-foreground">{sub}</div>
          </div>
        </div>
        {linhas.map(([a, b]) => (
          <Linha key={a} rotulo={a} valor={b} />
        ))}
        <Linha rotulo="Total" valor={reais(total)} forte />
        <div className="text-xs font-medium text-muted-foreground">
          ou {parcelas}× de {reais(Math.round((total / parcelas) * 100) / 100)} sem juros
        </div>
      </section>
      <section className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <Label htmlFor="dividir" className="text-[15px] font-semibold">
              Dividir com o grupo
            </Label>
            <p className="text-sm text-muted-foreground">Vira uma despesa da viagem, dividida igual entre {PESSOAS}.</p>
          </div>
          <Switch id="dividir" checked={dividir} onCheckedChange={setDividir} />
        </div>
        {dividir ? (
          <div className="flex justify-between rounded-lg bg-muted px-3 py-2.5 text-sm">
            <span>Cada pessoa</span>
            <strong className="font-semibold tabular-nums">{reais(Math.round((total / PESSOAS) * 100) / 100)}</strong>
          </div>
        ) : null}
      </section>
      {children}
    </aside>
  )
}

export function AvisoParceiro() {
  return (
    <p className="flex gap-2 text-xs font-medium text-muted-foreground">
      <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden />
      Pagamento processado por parceiro certificado PCI. A Avori não guarda o número do seu cartão.
    </p>
  )
}

/**
 * Forma de pagamento. Prévia: nada é cobrado. Um cartão terminado em 0000
 * mostra o aviso de pagamento recusado, para demonstrar o estado de erro.
 */
export function FormaPagamento({ total, onPago }: { total: number; onPago: () => void }) {
  const [forma, setForma] = useState<"cartao" | "pix">("cartao")
  const [numero, setNumero] = useState("4242 4242 4242 4242")
  const [recusado, setRecusado] = useState(false)
  const [aceite, setAceite] = useState(true)

  function pagar(e: React.FormEvent) {
    e.preventDefault()
    if (forma === "cartao" && numero.replace(/\D/g, "").endsWith("0000")) {
      setRecusado(true)
      return
    }
    onPago()
  }

  return (
    <form onSubmit={pagar} className="space-y-4 rounded-2xl border border-border bg-card p-5 md:p-6">
      <h2 className="text-xl font-semibold">Forma de pagamento</h2>
      <div role="radiogroup" aria-label="Forma de pagamento" className="flex max-w-sm rounded-xl bg-muted p-1">
        {(
          [
            ["cartao", "Cartão de crédito", CreditCard],
            ["pix", "Pix", QrCode],
          ] as const
        ).map(([v, rotulo, Icone]) => (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={forma === v}
            onClick={() => setForma(v)}
            className={cn(
              "flex h-10 flex-1 items-center justify-center gap-2 rounded-lg text-sm",
              forma === v ? "bg-card font-semibold shadow-sm" : "font-medium text-muted-foreground",
            )}
          >
            <Icone className="h-4 w-4" aria-hidden />
            {rotulo}
          </button>
        ))}
      </div>

      {forma === "cartao" ? (
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cartao">Número do cartão</Label>
            <Input id="cartao" inputMode="numeric" value={numero} onChange={(e) => setNumero(e.target.value)} className="h-12 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="validade">Validade</Label>
            <Input id="validade" defaultValue="08/29" className="h-12 rounded-xl" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cvv">CVV</Label>
            <Input id="cvv" defaultValue="123" type="password" className="h-12 rounded-xl" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="titular">Nome no cartão</Label>
            <Input id="titular" defaultValue="MARINA C SILVA" className="h-12 rounded-xl" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="parcelas">Parcelas</Label>
            <select id="parcelas" className="h-12 w-full rounded-xl border border-input bg-card px-3 text-base">
              {[1, 3, 6, 10].map((n) => (
                <option key={n}>
                  {n}× de {reais(Math.round((total / n) * 100) / 100)}
                  {n > 1 ? " sem juros" : ""}
                </option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-background p-5 text-center">
          <div
            role="img"
            aria-label="QR Code do Pix (exemplo)"
            className="h-40 w-40 rounded-xl border border-border bg-card"
            style={{
              backgroundImage:
                "linear-gradient(90deg, var(--color-grafite) 50%, transparent 50%), linear-gradient(var(--color-grafite) 50%, transparent 50%)",
              backgroundSize: "14px 14px",
              backgroundBlendMode: "difference",
            }}
          />
          <p className="text-sm">
            Pague {reais(total)} em até 30 minutos. A aprovação é na hora.
          </p>
          <Button type="button" variant="outline" className="h-11 rounded-xl">
            <Copy className="h-4 w-4" aria-hidden />
            Copiar código Pix
          </Button>
        </div>
      )}

      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" checked={aceite} onChange={(e) => setAceite(e.target.checked)} className="mt-0.5 h-5 w-5 accent-primary" />
        <span>Li as regras da tarifa e a política de cancelamento.</span>
      </label>
      <AvisoParceiro />
      <Button type="submit" disabled={!aceite} className="h-13 w-full rounded-xl text-base sm:w-auto sm:px-8">
        <Lock className="h-4 w-4" aria-hidden />
        {forma === "pix" ? "Já paguei" : `Pagar ${reais(total)}`}
      </Button>
      <p className="text-xs text-muted-foreground">Dica da prévia: um cartão terminado em 0000 mostra o pagamento recusado.</p>

      <Dialog open={recusado} onOpenChange={setRecusado}>
        <DialogContent role="alertdialog" className="max-w-md rounded-3xl">
          <DialogHeader>
            <span className="mb-2 inline-flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <CreditCard className="h-6 w-6" aria-hidden />
            </span>
            <DialogTitle className="text-2xl">O pagamento não foi aprovado.</DialogTitle>
            <DialogDescription className="text-base text-foreground">
              O banco do cartão final {numero.replace(/\D/g, "").slice(-4)} recusou a compra. Nenhum valor foi cobrado e os
              lugares ficam guardados por mais 15 minutos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="h-11 rounded-xl"
              onClick={() => {
                setRecusado(false)
                setForma("pix")
              }}
            >
              <QrCode className="h-4 w-4" aria-hidden />
              Pagar com Pix
            </Button>
            <Button
              className="h-11 rounded-xl"
              onClick={() => {
                setRecusado(false)
                setNumero("")
              }}
            >
              Tentar outro cartão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  )
}

export function Confirmacao({
  titulo,
  sub,
  codigos,
  feitos,
  proximo,
}: {
  titulo: string
  sub: string
  codigos: [string, string][]
  feitos: [string, string][]
  proximo?: React.ReactNode
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
      <section className="flex flex-col overflow-hidden rounded-3xl bg-primary text-primary-foreground">
        <div className="space-y-3 p-6 md:p-8">
          <span className="inline-flex rounded-full bg-citrico px-3 py-1 text-xs font-medium text-grafite">Compra confirmada</span>
          <h1 className="text-4xl font-semibold leading-none tracking-tight md:text-5xl">{titulo}</h1>
          <p className="text-lg">{sub}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            {codigos.map(([r, c]) => (
              <div key={r} className="rounded-2xl bg-primary-foreground px-4 py-3 text-foreground">
                <div className="text-xs font-medium text-muted-foreground">{r}</div>
                <div className="text-2xl font-semibold tracking-wider">{c}</div>
              </div>
            ))}
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- arte estática da marca */}
        <img src="/brand/avori-grafismo-floresta.svg" alt="" className="h-40 w-full object-cover md:h-56" />
      </section>
      <aside className="space-y-4">
        <section className="rounded-2xl border border-border bg-card px-5 py-2">
          <h2 className="py-3 font-semibold">O que acontece numa compra de verdade</h2>
          <ul>
            {feitos.map(([t, s]) => (
              <li key={t} className="flex gap-3 border-t border-border py-3">
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <Check className="h-4 w-4" aria-hidden />
                </span>
                <span className="leading-snug">
                  <span className="block font-semibold">{t}</span>
                  <span className="text-sm text-muted-foreground">{s}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
        {proximo}
        <SeloPrevia>Prévia: nada foi comprado nem salvo</SeloPrevia>
        <Button asChild variant="outline" className="h-12 w-full rounded-xl">
          <Link href="/dashboard/bookings">Voltar para Reservas</Link>
        </Button>
      </aside>
    </div>
  )
}

export function SiglaCompanhia({ sigla, tamanho = "h-11 w-11" }: { sigla: string; tamanho?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-xl bg-muted text-sm font-semibold text-primary", tamanho)}>
      {sigla}
    </span>
  )
}
