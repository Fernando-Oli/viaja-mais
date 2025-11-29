import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plane, Hotel, Car, Calendar, MapPin } from "lucide-react"

export default async function BookingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    redirect("/auth/login")
  }

  const { data: bookings } = await supabase
    .from("bookings")
    .select("*, trips(title, destination)")
    .eq("user_id", user.id)
    .order("start_date", { ascending: true })

  const upcomingBookings = bookings?.filter((b) => new Date(b.start_date) >= new Date()) || []
  const pastBookings = bookings?.filter((b) => new Date(b.start_date) < new Date()) || []

  const typeIcons: Record<string, any> = {
    flight: Plane,
    hotel: Hotel,
    car: Car,
    activity: Calendar,
    other: MapPin,
  }

  const typeLabels: Record<string, string> = {
    flight: "Voo",
    hotel: "Hotel",
    car: "Carro",
    activity: "Atividade",
    other: "Outro",
  }

  const statusColors: Record<string, string> = {
    pending: "bg-amber-100 text-amber-800",
    confirmed: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-red-100 text-red-800",
  }

  const statusLabels: Record<string, string> = {
    pending: "Pendente",
    confirmed: "Confirmado",
    cancelled: "Cancelado",
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Reservas</h1>
          <p className="mt-2 text-slate-600">Gerencie todas as suas reservas de viagem</p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Calendar className="h-4 w-4 text-sky-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bookings?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Voos</CardTitle>
            <Plane className="h-4 w-4 text-sky-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bookings?.filter((b) => b.type === "flight").length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hotéis</CardTitle>
            <Hotel className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bookings?.filter((b) => b.type === "hotel").length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Carros</CardTitle>
            <Car className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bookings?.filter((b) => b.type === "car").length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList>
          <TabsTrigger value="upcoming">Próximas ({upcomingBookings.length})</TabsTrigger>
          <TabsTrigger value="past">Anteriores ({pastBookings.length})</TabsTrigger>
          <TabsTrigger value="all">Todas ({bookings?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-6">
          {upcomingBookings.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="mb-4 h-12 w-12 text-slate-300" />
                <h3 className="mb-2 text-lg font-semibold text-slate-900">Nenhuma reserva futura</h3>
                <p className="text-center text-slate-600">Suas próximas reservas aparecerão aqui</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {upcomingBookings.map((booking) => {
                const Icon = typeIcons[booking.type]
                return (
                  <Card key={booking.id} className="transition-all hover:shadow-lg">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg bg-sky-100 p-2">
                            <Icon className="h-5 w-5 text-sky-600" />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-lg">{booking.title}</CardTitle>
                            <CardDescription className="mt-1">{booking.trips?.destination}</CardDescription>
                          </div>
                        </div>
                        <Badge className={statusColors[booking.status]}>{statusLabels[booking.status]}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {new Date(booking.start_date).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          {booking.end_date &&
                            ` - ${new Date(booking.end_date).toLocaleDateString("pt-BR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}`}
                        </span>
                      </div>

                      {booking.provider && (
                        <div className="text-sm text-slate-600">
                          <span className="font-medium">Provedor:</span> {booking.provider}
                        </div>
                      )}

                      {booking.confirmation_number && (
                        <div className="text-sm text-slate-600">
                          <span className="font-medium">Confirmação:</span> {booking.confirmation_number}
                        </div>
                      )}

                      {booking.location && (
                        <div className="flex items-center gap-2 text-sm text-slate-600">
                          <MapPin className="h-4 w-4" />
                          <span>{booking.location}</span>
                        </div>
                      )}

                      {booking.price && (
                        <div className="pt-2 text-lg font-semibold text-slate-900">
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: booking.currency || "BRL",
                          }).format(Number(booking.price))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-6">
          {pastBookings.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="mb-4 h-12 w-12 text-slate-300" />
                <h3 className="mb-2 text-lg font-semibold text-slate-900">Nenhuma reserva anterior</h3>
                <p className="text-center text-slate-600">Suas reservas passadas aparecerão aqui</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pastBookings.map((booking) => {
                const Icon = typeIcons[booking.type]
                return (
                  <Card key={booking.id} className="opacity-75 transition-all hover:opacity-100 hover:shadow-lg">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg bg-slate-100 p-2">
                            <Icon className="h-5 w-5 text-slate-600" />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-lg">{booking.title}</CardTitle>
                            <CardDescription className="mt-1">{booking.trips?.destination}</CardDescription>
                          </div>
                        </div>
                        <Badge className={statusColors[booking.status]}>{statusLabels[booking.status]}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {new Date(booking.start_date).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-6">
          {!bookings || bookings.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="mb-4 h-12 w-12 text-slate-300" />
                <h3 className="mb-2 text-lg font-semibold text-slate-900">Nenhuma reserva cadastrada</h3>
                <p className="text-center text-slate-600">Adicione reservas às suas viagens</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {bookings.map((booking) => {
                const Icon = typeIcons[booking.type]
                return (
                  <Card key={booking.id} className="transition-all hover:shadow-lg">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg bg-sky-100 p-2">
                            <Icon className="h-5 w-5 text-sky-600" />
                          </div>
                          <div className="flex-1">
                            <CardTitle className="text-lg">{booking.title}</CardTitle>
                            <CardDescription className="mt-1">{booking.trips?.destination}</CardDescription>
                          </div>
                        </div>
                        <Badge className={statusColors[booking.status]}>{statusLabels[booking.status]}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {new Date(booking.start_date).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
