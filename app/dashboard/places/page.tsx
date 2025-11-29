import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { MapPin, Star } from "lucide-react"

export default async function PlacesPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    redirect("/auth/login")
  }

  const { data: places } = await supabase
    .from("places")
    .select("*, trips(title, destination)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Lugares Salvos</h1>
        <p className="mt-2 text-slate-600">Todos os lugares que você salvou para suas viagens</p>
      </div>

      {!places || places.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <MapPin className="mb-4 h-12 w-12 text-slate-300" />
            <h3 className="mb-2 text-lg font-semibold text-slate-900">Nenhum lugar salvo</h3>
            <p className="text-center text-slate-600">Adicione lugares às suas viagens para vê-los aqui</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {places.map((place) => (
            <Card key={place.id} className="transition-all hover:shadow-lg">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="line-clamp-1">{place.name}</CardTitle>
                    <CardDescription className="mt-1">{place.trips?.destination}</CardDescription>
                  </div>
                  {place.rating && (
                    <div className="flex items-center gap-1 text-sm font-medium text-amber-600">
                      <Star className="h-4 w-4 fill-current" />
                      <span>{place.rating}</span>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {place.address && (
                    <div className="flex items-start gap-2 text-sm text-slate-600">
                      <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0" />
                      <span className="line-clamp-2">{place.address}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {place.category && <Badge variant="secondary">{place.category}</Badge>}
                    {place.visited && <Badge className="bg-emerald-100 text-emerald-800">Visitado</Badge>}
                  </div>
                  {place.notes && <p className="text-sm text-slate-600 line-clamp-2">{place.notes}</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
