import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Calendar, Clock, MapPin } from "lucide-react"
import Link from "next/link"

export default async function ItineraryPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    redirect("/auth/login")
  }

  const { data: itineraryItems } = await supabase
    .from("itinerary_items")
    .select("*, trips(title, destination)")
    .eq("trips.user_id", user.id)
    .gte("date", new Date().toISOString().split("T")[0])
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(20)

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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Próximas Atividades</h1>
        <p className="mt-2 text-slate-600">Seu itinerário consolidado de todas as viagens</p>
      </div>

      {!itineraryItems || itineraryItems.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="mb-4 h-12 w-12 text-slate-300" />
            <h3 className="mb-2 text-lg font-semibold text-slate-900">Nenhuma atividade futura</h3>
            <p className="text-center text-slate-600">Adicione atividades aos seus itinerários de viagem</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
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
                    {item.description && <p className="text-sm text-slate-600">{item.description}</p>}

                    <div className="flex flex-wrap gap-4 text-sm text-slate-600">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {new Date(item.date).toLocaleDateString("pt-BR", {
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
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
