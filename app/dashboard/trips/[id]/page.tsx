import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { ArrowLeft, Calendar, MapPin, DollarSign, Plus, Clock, MapPinned } from "lucide-react"
import { ItineraryList } from "@/components/itinerary-list"
import { TripMembers } from "@/components/trip-members"

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  if (id === "new") {
    redirect("/dashboard/trips/new")
  }

  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    redirect("/auth/login")
  }

  const { data: trip, error } = await supabase
    .from("trips")
    .select(`
      *,
      trip_members!inner(user_id, role)
    `)
    .eq("id", id)
    .eq("trip_members.user_id", user.id)
    .single()

  if (error || !trip) {
    redirect("/dashboard/trips")
  }

  const { data: members } = await supabase
    .from("trip_members")
    .select(`
      *,
      profiles(full_name, email)
    `)
    .eq("trip_id", id)

  const isOwner = trip.user_id === user.id

  const { data: itineraryItems } = await supabase
    .from("itinerary_items")
    .select("*")
    .eq("trip_id", id)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })

  const { data: expenses } = await supabase
    .from("expenses")
    .select("*")
    .eq("trip_id", id)
    .order("date", { ascending: false })

  const { data: places } = await supabase
    .from("places")
    .select("*")
    .eq("trip_id", id)
    .order("created_at", { ascending: false })

  const totalExpenses = expenses?.reduce((sum, expense) => sum + Number(expense.amount), 0) || 0

  const statusLabels: Record<string, string> = {
    planning: "Planejando",
    confirmed: "Confirmada",
    ongoing: "Em andamento",
    completed: "Concluída",
    cancelled: "Cancelada",
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" asChild className="mb-4">
          <Link href="/dashboard/trips">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-viaja-navy">{trip.title}</h1>
              <Badge variant={trip.status === "confirmed" ? "default" : "secondary"}>{statusLabels[trip.status]}</Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-gray-600">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{trip.destination}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>
                  {new Date(trip.start_date).toLocaleDateString("pt-BR")} -{" "}
                  {new Date(trip.end_date).toLocaleDateString("pt-BR")}
                </span>
              </div>
              {trip.budget && (
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  <span>
                    Orçamento:{" "}
                    {new Intl.NumberFormat("pt-BR", {
                      style: "currency",
                      currency: trip.currency || "BRL",
                    }).format(Number(trip.budget))}
                  </span>
                </div>
              )}
            </div>
            {trip.description && <p className="mt-4 text-gray-600">{trip.description}</p>}
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Itinerário</CardTitle>
            <Calendar className="h-4 w-4 text-sky-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{itineraryItems?.length || 0}</div>
            <p className="text-xs text-gray-600">atividades</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gastos</CardTitle>
            <DollarSign className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: trip.currency || "BRL",
              }).format(totalExpenses)}
            </div>
            <p className="text-xs text-gray-600">{expenses?.length || 0} despesas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lugares</CardTitle>
            <MapPinned className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{places?.length || 0}</div>
            <p className="text-xs text-gray-600">salvos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duração</CardTitle>
            <Clock className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.ceil(
                (new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / (1000 * 60 * 60 * 24),
              )}
            </div>
            <p className="text-xs text-gray-600">dias</p>
          </CardContent>
        </Card>
      </div>

      <TripMembers tripId={id} members={members || []} isOwner={isOwner} />

      {/* Tabs */}
      <Tabs defaultValue="itinerary" className="w-full">
        <TabsList>
          <TabsTrigger value="itinerary">Itinerário</TabsTrigger>
          <TabsTrigger value="expenses">Despesas</TabsTrigger>
          <TabsTrigger value="places">Lugares</TabsTrigger>
        </TabsList>

        <TabsContent value="itinerary" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Itinerário</CardTitle>
                  <CardDescription>Organize suas atividades dia a dia</CardDescription>
                </div>
                <Button asChild className="bg-viaja-orange hover:bg-viaja-orange/90">
                  <Link href={`/dashboard/trips/${id}/itinerary/new`}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Atividade
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ItineraryList items={itineraryItems || []} tripId={id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Despesas</CardTitle>
                  <CardDescription>Controle seus gastos durante a viagem</CardDescription>
                </div>
                <Button asChild className="bg-viaja-orange hover:bg-viaja-orange/90">
                  <Link href={`/dashboard/trips/${id}/expenses/new`}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Despesa
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!expenses || expenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <DollarSign className="mb-4 h-12 w-12 text-gray-300" />
                  <h3 className="mb-2 text-lg font-semibold text-viaja-navy">Nenhuma despesa registrada</h3>
                  <p className="text-center text-gray-600">Comece a registrar seus gastos</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {expenses.map((expense) => (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between border-b border-gray-200 pb-4 last:border-0"
                    >
                      <div>
                        <h4 className="font-medium text-viaja-navy">{expense.title}</h4>
                        <p className="text-sm text-gray-600">
                          {expense.category} • {new Date(expense.date).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-viaja-navy">
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: expense.currency || "BRL",
                          }).format(Number(expense.amount))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="places" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Lugares Salvos</CardTitle>
                  <CardDescription>Pontos turísticos e locais de interesse</CardDescription>
                </div>
                <Button asChild className="bg-viaja-orange hover:bg-viaja-orange/90">
                  <Link href={`/dashboard/trips/${id}/places`}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Lugar
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!places || places.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <MapPinned className="mb-4 h-12 w-12 text-gray-300" />
                  <h3 className="mb-2 text-lg font-semibold text-viaja-navy">Nenhum lugar salvo</h3>
                  <p className="text-center text-gray-600">Adicione lugares que deseja visitar</p>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {places.map((place) => (
                    <div key={place.id} className="rounded-lg border border-gray-200 p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium text-viaja-navy">{place.name}</h4>
                          {place.address && <p className="mt-1 text-sm text-gray-600">{place.address}</p>}
                          {place.category && (
                            <Badge variant="secondary" className="mt-2">
                              {place.category}
                            </Badge>
                          )}
                        </div>
                        {place.rating && (
                          <div className="flex items-center gap-1 text-sm font-medium text-amber-600">
                            <span>⭐</span>
                            <span>{place.rating}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
