import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { selecaoPorViagem, FILTRO_POR_VIAGEM } from "@/lib/trips/escopo"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Plane, Hotel, Car, Calendar, MapPin } from "lucide-react"
import { LIMITE_LISTAGEM } from "@/lib/listagem"
import { BuscaReserva } from "@/components/prototipo/compra/busca-reserva"

export default async function BookingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  if (error || !user) {
    redirect("/auth/login")
  }

  // Participação, não propriedade: quem foi convidado precisa ver as reservas
  // que o grupo fez, não só as que ele mesmo cadastrou.
  const { data: bookings } = await supabase
    .from("bookings")
    .select(selecaoPorViagem("title, destination"))
    .eq(FILTRO_POR_VIAGEM, user.id)
    .order("start_date", { ascending: true })
    .limit(LIMITE_LISTAGEM)

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
    cancelled: "bg-destructive/10 text-destructive",
  }

  const statusLabels: Record<string, string> = {
    pending: "Pendente",
    confirmed: "Confirmado",
    cancelled: "Cancelado",
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Reservas</h1>
        <p className="mt-1 text-muted-foreground">Busque voos e hotéis, e veja tudo o que o grupo já reservou.</p>
      </div>

      <BuscaReserva />

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bookings?.length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Voos</CardTitle>
            <Plane className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bookings?.filter((b) => b.type === "flight").length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hotéis</CardTitle>
            <Hotel className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bookings?.filter((b) => b.type === "hotel").length || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Carros</CardTitle>
            <Car className="h-4 w-4 text-primary" />
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
                <h3 className="mb-2 text-lg font-semibold text-foreground">Nenhuma reserva futura</h3>
                <p className="text-center text-muted-foreground">Suas próximas reservas aparecerão aqui</p>
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
                            <Icon className="h-5 w-5 text-primary" />
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
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Provedor:</span> {booking.provider}
                        </div>
                      )}

                      {booking.confirmation_number && (
                        <div className="text-sm text-muted-foreground">
                          <span className="font-medium">Confirmação:</span> {booking.confirmation_number}
                        </div>
                      )}

                      {booking.location && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4" />
                          <span>{booking.location}</span>
                        </div>
                      )}

                      {booking.price && (
                        <div className="pt-2 text-lg font-semibold text-foreground">
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
                <h3 className="mb-2 text-lg font-semibold text-foreground">Nenhuma reserva anterior</h3>
                <p className="text-center text-muted-foreground">Suas reservas passadas aparecerão aqui</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pastBookings.map((booking) => {
                const Icon = typeIcons[booking.type]
                return (
                  <Card key={booking.id} className="border-dashed transition-all hover:shadow-lg">
                    <CardHeader>
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg bg-muted p-2">
                            <Icon className="h-5 w-5 text-muted-foreground" />
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
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
                <h3 className="mb-2 text-lg font-semibold text-foreground">Nenhuma reserva cadastrada</h3>
                <p className="text-center text-muted-foreground">Adicione reservas às suas viagens</p>
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
                            <Icon className="h-5 w-5 text-primary" />
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
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
