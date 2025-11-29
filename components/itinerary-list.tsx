"use client"

import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, MapPin } from "lucide-react"

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

export function ItineraryList({ items, tripId }: ItineraryListProps) {
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

  return (
    <div className="space-y-8">
      {Object.entries(groupedItems).map(([date, dayItems]) => (
        <div key={date}>
          <div className="mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-sky-600" />
            <h3 className="text-lg font-semibold text-slate-900">
              {new Date(date).toLocaleDateString("pt-BR", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </h3>
          </div>

          <div className="space-y-4">
            {dayItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-slate-200 p-4 transition-all hover:shadow-md">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-slate-900">{item.title}</h4>
                      {item.category && (
                        <Badge className={categoryColors[item.category] || categoryColors.other}>
                          {categoryLabels[item.category] || item.category}
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
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
