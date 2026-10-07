"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import ConfirmModal from "@/components/ui/confirm-modal"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import { Calendar, Check, Clock, MapPin, Pencil, RotateCcw, Trash2 } from "lucide-react"

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
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day); // <-- interpreta como data local
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
        <Calendar className="mb-4 h-12 w-12 text-slate-300" />
        <h3 className="mb-2 text-lg font-semibold text-slate-900">Nenhuma atividade planejada</h3>
        <p className="text-center text-slate-600">Adicione atividades ao seu itinerário</p>
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
    <div className="space-y-8">
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

      {Object.entries(groupedItems).map(([date, dayItems]) => (
        <div key={date}>
          <div className="mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-sky-600" />
            <h3 className="text-lg font-semibold text-slate-900 capitalize">
              {new Date(parseLocalDate(date)).toLocaleDateString("pt-BR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </h3>
          </div>

          <div className="space-y-4">
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
        </div>
      ))}
    </div>
  )
}

const categoryColors: Record<string, string> = {
  accommodation: "bg-purple-100 text-purple-800",
  transport: "bg-blue-100 text-blue-800",
  activity: "bg-green-100 text-green-800",
  restaurant: "bg-orange-100 text-orange-800",
  attraction: "bg-pink-100 text-pink-800",
  other: "bg-slate-100 text-slate-800",
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

  return (
    <div
      data-status={item.status}
      className={cn(
        "rounded-lg border border-slate-200 p-4 transition-all hover:shadow-md",
        concluida && "border-green-200 bg-green-50/60 opacity-70",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className={cn("font-medium text-slate-900", concluida && "text-slate-500 line-through")}>
              {item.title}
            </h4>
            {item.category && (
              <Badge className={categoryColors[item.category] || categoryColors.other}>
                {categoryLabels[item.category] || item.category}
              </Badge>
            )}
            {concluida && (
              <Badge className="bg-green-600 text-white">
                <Check className="mr-1 h-3 w-3" />
                Concluída
              </Badge>
            )}
          </div>

          {item.description && <p className="mt-2 text-sm text-slate-600">{item.description}</p>}

          <div className="mt-3 flex flex-wrap gap-4 text-sm text-slate-600">
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
            className="text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Excluir
          </Button>
        </div>
      </div>
    </div>
  )
}
