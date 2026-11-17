import { lerDaApi } from "@/lib/api-servidor"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, MapPin } from "lucide-react"
import Link from "next/link"

/** Formato de `GET /api/...` com a viagem junto, em `trips`. */
type ItemDaAgenda = {
  id: string
  trip_id: string
  title: string
  description: string | null
  date: string
  start_time: string | null
  end_time: string | null
  location: string | null
  category: string | null
  trips: { title: string; destination: string }
}

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day); // <-- interpreta como data local
}

export default async function ItineraryPage() {
  // Próximas 20 atividades de todas as viagens de que a pessoa participa. A
  // API filtra pela participação e devolve a viagem junto, em `trips`.
  const { itinerary: itineraryItems } = await lerDaApi<{ itinerary: ItemDaAgenda[] }>(
    `/api/itinerary?desde=${new Date().toISOString().split("T")[0]}&limite=20`,
  )

  const categoryColors: Record<string, string> = {
    accommodation: "bg-muted text-foreground",
    transport: "bg-muted text-foreground",
    activity: "bg-muted text-foreground",
    restaurant: "bg-muted text-foreground",
    attraction: "bg-muted text-foreground",
    other: "bg-muted text-foreground",
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Próximas Atividades</h1>
        <p className="mt-2 text-muted-foreground">Seu itinerário consolidado de todas as viagens</p>
      </div>

      {!itineraryItems || itineraryItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="mb-2 text-lg font-semibold text-foreground">Nenhuma atividade futura</h3>
            <p className="text-center text-muted-foreground">Adicione atividades aos seus itinerários de viagem</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6 flex flex-col">
          {itineraryItems.map((item) => (
            <Link key={item.id} href={`/dashboard/trips/${item.trip_id}`}>
              <Card className="transition-all hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="text-lg">{item.title}</CardTitle>
                        {item.category && (
                          <Badge className={categoryColors[item.category] || categoryColors.other}>
                            {categoryLabels[item.category] || item.category}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="mt-1">{item.trips?.destination}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}

                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {new Date(parseLocalDate(item.date)).toLocaleDateString("pt-BR", {
                            weekday: "long",
                            year: "numeric",
                            month: "long",
                            day: "numeric",
                          })}
                        </span>
                      </div>
                      {item.start_time && (
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span>
                            {item.start_time}
                            {item.end_time && ` - ${item.end_time.slice(0, 5)}`}
                            {/* {parseLocalDate(item.start_time).toLocaleDateString(
                            "pt-BR"
                          )}{" "}
                          -{" "}
                          {parseLocalDate(item.end_time).toLocaleDateString(
                            "pt-BR"
                          )} */}
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
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
