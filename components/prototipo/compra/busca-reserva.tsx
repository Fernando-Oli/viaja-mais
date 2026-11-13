"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { BedDouble, CalendarDays, MapPin, Plane, Users } from "lucide-react"
import { SeloPrevia } from "@/components/prototipo/selo-previa"
import { cn } from "@/lib/utils"

/**
 * Busca de voos e hotéis no topo de Reservas (PRÉVIA VISUAL). Os campos vêm
 * preenchidos com a viagem de exemplo; "Buscar" abre o fluxo com dados de
 * exemplo, sem consultar fornecedor nenhum.
 */
export function BuscaReserva() {
  const router = useRouter()
  const [aba, setAba] = useState<"voos" | "hoteis">("voos")
  const campos =
    aba === "voos"
      ? [
          ["De", "São Paulo (GRU)", MapPin],
          ["Para", "Lisboa (LIS)", MapPin],
          ["Ida", "12/06", CalendarDays],
          ["Volta", "18/06", CalendarDays],
          ["Passageiros", "4 adultos · Econômica", Users],
        ]
      : [
          ["Destino", "Lisboa, Portugal", MapPin],
          ["Entrada", "12/06", CalendarDays],
          ["Saída", "18/06", CalendarDays],
          ["Hóspedes", "4 adultos · 2 quartos", Users],
        ]

  return (
    <section aria-label="Buscar voos e hotéis" className="flex overflow-hidden rounded-3xl bg-primary text-primary-foreground">
      <form
        className="flex min-w-0 flex-1 flex-col gap-4 p-5 md:p-7"
        onSubmit={(e) => {
          e.preventDefault()
          router.push(aba === "voos" ? "/dashboard/reservar/voos" : "/dashboard/reservar/hoteis")
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold leading-tight md:text-[28px]">Reserve voos e hotéis sem sair da Avori.</h2>
          <SeloPrevia className="border-primary-foreground/40 bg-transparent text-primary-foreground">Prévia</SeloPrevia>
        </div>
        <div role="tablist" aria-label="O que reservar" className="flex gap-2">
          {(
            [
              ["voos", "Voos", Plane],
              ["hoteis", "Hotéis", BedDouble],
            ] as const
          ).map(([v, r, Icone]) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={aba === v}
              onClick={() => setAba(v)}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm",
                aba === v ? "bg-primary-foreground font-semibold text-foreground" : "border border-primary-foreground/40 font-medium",
              )}
            >
              <Icone className="h-[18px] w-[18px]" aria-hidden />
              {r}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:flex lg:items-end">
          {campos.map(([rotulo, valor, Icone]) => {
            const I = Icone as typeof MapPin
            const id = `busca-${String(rotulo).toLowerCase()}`
            return (
              <div key={rotulo as string} className="min-w-0 flex-1 space-y-1.5">
                <label htmlFor={id} className="text-xs font-medium">
                  {rotulo as string}
                </label>
                <div className="flex h-13 items-center gap-2 rounded-xl bg-card px-3.5 text-foreground">
                  <I className="h-[18px] w-[18px] shrink-0 text-muted-foreground" aria-hidden />
                  <input id={id} defaultValue={valor as string} className="min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none" />
                </div>
              </div>
            )
          })}
          <button
            type="submit"
            className="inline-flex h-13 items-center justify-center rounded-xl bg-citrico px-6 text-base font-medium text-grafite hover:bg-citrico/90 sm:col-span-2"
          >
            {aba === "voos" ? "Buscar voos" : "Buscar hotéis"}
          </button>
        </div>
      </form>
      {/* eslint-disable-next-line @next/next/no-img-element -- arte estática da marca */}
      <img src="/brand/avori-grafismo-floresta.svg" alt="" className="hidden w-72 shrink-0 object-cover xl:block" />
    </section>
  )
}
