"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import ConfirmModal from "@/components/ui/confirm-modal"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  BedDouble,
  Bus,
  Calendar,
  Check,
  Clock,
  Landmark,
  MapPin,
  Pencil,
  RotateCcw,
  Ticket,
  Trash2,
  Utensils,
} from "lucide-react"

interface ItineraryItem {
  id: string
  title: string
  description: string | null
  date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  category: string | null
  status: string
}

interface ItineraryListProps {
  items: ItineraryItem[]
  tripId: string
}

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number)
  return new Date(year, month - 1, day) // <-- interpreta como data local
}

/**
 * Lista do itinerário com as ações de cada item. Toda escrita passa pela rota
 * `/api/trips/[tripId]/itinerary/[itemId]`, que confere a participação na viagem.
 *
 * @RF05.2 editar/concluir atividade · @RF05.3 excluir atividade
 */
export function ItineraryList({ items, tripId }: ItineraryListProps) {
  const router = useRouter()
  const { toast } = useToast()
  // Id do item com requisição em andamento: trava os botões dele contra clique duplo.
  const [pendente, setPendente] = useState<string | null>(null)
  const [paraExcluir, setParaExcluir] = useState<ItineraryItem | null>(null)

  async function enviar(itemId: string, init: RequestInit, sucesso: string, falha: string) {
    setPendente(itemId)
    try {
      const resposta = await fetch(`/api/trips/${tripId}/itinerary/${itemId}`, init)
      if (!resposta.ok) {
        const dados: { error?: string } = await resposta.json().catch(() => ({}))
        throw new Error(dados.error || falha)
      }
      toast({ title: sucesso })
      router.refresh()
    } catch (err) {
      toast({ title: "Erro", description: err instanceof Error ? err.message : falha, variant: "destructive" })
    } finally {
      setPendente(null)
    }
  }

  function alternarConclusao(item: ItineraryItem) {
    const concluir = item.status !== "completed"
    return enviar(
      item.id,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: concluir ? "completed" : "planned" }),
      },
      concluir ? "Atividade concluída" : "Atividade reaberta",
      "Erro ao atualizar atividade",
    )
  }

  function excluir(item: ItineraryItem) {
    setParaExcluir(null)
    return enviar(item.id, { method: "DELETE" }, "Atividade excluída", "Erro ao excluir atividade")
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Calendar className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <h3 className="mb-2 text-lg font-semibold text-foreground">Nenhuma atividade planejada</h3>
        <p className="text-center text-muted-foreground">Adicione atividades ao seu itinerário</p>
      </div>
    )
  }

  // Group items by date
  const groupedItems = items.reduce(
    (acc, item) => {
      const date = item.date
      if (!acc[date]) {
        acc[date] = []
      }
      acc[date].push(item)
      return acc
    },
    {} as Record<string, ItineraryItem[]>,
  )

  return (
    <div className="space-y-4">
      <ConfirmModal
        open={paraExcluir !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setParaExcluir(null)
        }}
        title="Excluir atividade?"
        description={`"${paraExcluir?.title ?? ""}" será removida do itinerário. Essa ação é irreversível.`}
        confirmText="Excluir"
        variant="destructive"
        onConfirm={() => paraExcluir && excluir(paraExcluir)}
      />

      {Object.entries(groupedItems).map(([date, dayItems], indice) => (
        <section key={date} className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-medium text-primary-foreground">
              Dia {indice + 1}
            </span>
            <h3 className="flex-1 text-base font-semibold text-foreground first-letter:uppercase">
              {new Date(parseLocalDate(date)).toLocaleDateString("pt-BR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </h3>
            <span className="text-xs font-medium text-muted-foreground">
              {dayItems.length} {dayItems.length === 1 ? "atividade" : "atividades"}
            </span>
          </div>
          <div className="divide-y divide-border border-t border-border">
            {dayItems.map((item) => (
              <ItineraryItemCard
                key={item.id}
                item={item}
                tripId={tripId}
                ocupado={pendente === item.id}
                onAlternarConclusao={() => alternarConclusao(item)}
                onExcluir={() => setParaExcluir(item)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

const categoryIcons: Record<string, typeof MapPin> = {
  accommodation: BedDouble,
  transport: Bus,
  activity: Ticket,
  restaurant: Utensils,
  attraction: Landmark,
  other: MapPin,
}

const categoryLabels: Record<string, string> = {
  accommodation: "Hospedagem",
  transport: "Transporte",
  activity: "Atividade",
  restaurant: "Restaurante",
  attraction: "Atração",
  other: "Outro",
}

interface ItineraryItemCardProps {
  item: ItineraryItem
  tripId: string
  ocupado: boolean
  onAlternarConclusao: () => void
  onExcluir: () => void
}

function ItineraryItemCard({ item, tripId, ocupado, onAlternarConclusao, onExcluir }: ItineraryItemCardProps) {
  const concluida = item.status === "completed"
  const Icone = categoryIcons[item.category ?? "other"] ?? MapPin

  return (
    <div data-status={item.status} className={cn("px-4 py-3.5", concluida && "bg-muted/60")}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 gap-3">
          <span className="w-12 shrink-0 pt-2 text-sm font-semibold tabular-nums">
            {item.start_time ? item.start_time.slice(0, 5) : "—"}
          </span>
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
            <Icone className="h-[18px] w-[18px]" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h4 className={cn("font-medium text-foreground", concluida && "text-muted-foreground line-through")}>
                {item.title}
              </h4>
              {item.category && <Badge variant="secondary">{categoryLabels[item.category] || item.category}</Badge>}
              {concluida && (
                <Badge className="bg-primary text-primary-foreground">
                  <Check className="mr-1 h-3 w-3" />
                  Concluída
                </Badge>
              )}
            </div>

            {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
            <div className="mt-1 flex flex-wrap gap-4 text-sm text-muted-foreground">
              {item.start_time && (
                <div className="flex items-center gap-1">
                  <Clock className="h-4 w-4" />
                  <span>
                    {item.start_time.slice(0, 5)}
                    {item.end_time && ` - ${item.end_time.slice(0, 5)}`}
                  </span>
                </div>
              )}
              {item.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  <span>{item.location}</span>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          <Button size="sm" variant="outline" disabled={ocupado} onClick={onAlternarConclusao}>
            {concluida ? <RotateCcw className="mr-1 h-4 w-4" /> : <Check className="mr-1 h-4 w-4" />}
            {concluida ? "Reabrir" : "Concluir"}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <Link href={`/dashboard/trips/${tripId}/itinerary/${item.id}/edit`}>
              <Pencil className="mr-1 h-4 w-4" />
              Editar
            </Link>
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={ocupado}
            onClick={onExcluir}
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Excluir
          </Button>
        </div>
      </div>
    </div>
  )
}
