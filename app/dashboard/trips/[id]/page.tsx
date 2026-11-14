import { notFound, redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import Link from "next/link"
import { ArrowLeft, Calendar, MapPin, DollarSign, Plus, Clock, MapPinned, Pencil } from "lucide-react"
import { ItineraryList } from "@/components/itinerary-list"
import { BookingList } from "@/components/booking-list"
import { PlaceList } from "@/components/place-list"
import { ExpenseList } from "@/components/expense-list"
import { TripMembers } from "@/components/trip-members"
import { nomesDosPerfis } from "@/lib/social/perfis"
import { CapaViagem } from "@/components/brand/capa-viagem"
import { BotaoPublicar } from "@/components/prototipo/botao-publicar"

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day); // <-- interpreta como data local
}

const ABAS = ["itinerary", "expenses", "places", "bookings"] as const

// `?aba=reservas` abre direto na aba de reservas: é para onde voltam as telas de
// criar e editar reserva, senão a pessoa cairia no itinerário sem ver o que salvou.
const ABA_POR_PARAMETRO: Record<string, (typeof ABAS)[number]> = {
  itinerario: "itinerary",
  despesas: "expenses",
  lugares: "places",
  reservas: "bookings",
}

export default async function TripDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aba?: string }>
}) {
  const { id } = await params
  const { aba } = await searchParams
  const abaInicial = (aba && ABA_POR_PARAMETRO[aba]) || "itinerary"

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

  // PGRST116 é o `.single()` sem linha: a viagem não existe ou a sessão não
  // participa dela — as duas respondem o mesmo 404, para não revelar que a
  // viagem existe. Qualquer outro erro é falha de verdade e vai para o
  // error.tsx do dashboard. Antes os dois casos mandavam de volta para a
  // lista, sem explicar nada (S07-F).
  if (error && error.code !== "PGRST116") {
    throw new Error("Não foi possível carregar a viagem")
  }
  if (!trip) notFound()

  // O nome vem numa segunda consulta: o embed `profiles(...)` direto daqui
  // falhava com PGRST200 e a lista chegava vazia, sem nem a dona.
  const { data: participantes } = await supabase
    .from("trip_members")
    .select("id, user_id, role")
    .eq("trip_id", id)
    .order("joined_at", { ascending: true })

  const nomes = await nomesDosPerfis(supabase, (participantes ?? []).map((p) => p.user_id))
  const members = (participantes ?? []).map((p) => ({
    ...p,
    profiles: { full_name: nomes.get(p.user_id) ?? null },
  }))

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

  const { data: bookings } = await supabase
    .from("bookings")
    .select("*")
    .eq("trip_id", id)
    .order("start_date", { ascending: true })

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
      <div className="space-y-4">
        <Link
          href="/dashboard/trips"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Viagens
        </Link>

        <div className="flex flex-col overflow-hidden rounded-3xl bg-primary text-primary-foreground md:flex-row">
          <div className="flex min-w-0 flex-1 flex-col justify-end gap-3 p-6 md:p-8">
            <span className="self-start rounded-full bg-citrico px-3 py-1 text-xs font-medium text-grafite">
              {statusLabels[trip.status]}
            </span>
            <h1 className="break-words text-4xl font-semibold leading-none tracking-tight md:text-5xl">{trip.title}</h1>
            <div className="flex flex-wrap gap-x-5 gap-y-1 font-medium">
              <span className="flex items-center gap-2">
                <MapPin className="h-4 w-4" aria-hidden />
                {trip.destination}
              </span>
              <span className="flex items-center gap-2">
                <Calendar className="h-4 w-4" aria-hidden />
                <span>
                  {parseLocalDate(trip.start_date).toLocaleDateString("pt-BR")} -{" "}
                  {parseLocalDate(trip.end_date).toLocaleDateString("pt-BR")}
                </span>
              </span>
              {Number(trip.budget) > 0 && (
                <span className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" aria-hidden />
                  Orçamento:{" "}
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: trip.currency || "BRL",
                  }).format(Number(trip.budget))}
                </span>
              )}
            </div>
            {trip.description && <p className="max-w-2xl">{trip.description}</p>}
            <div className="mt-2 flex flex-wrap gap-2">
              {isOwner && (
                <Button asChild variant="outline" className="h-10 rounded-xl border-0 bg-primary-foreground text-foreground">
                  <Link href={`/dashboard/trips/${id}/edit`}>
                    <Pencil className="h-4 w-4" aria-hidden />
                    Editar
                  </Link>
                </Button>
              )}
              <BotaoPublicar
                viagemId={id}
                titulo={trip.title}
                datas={`${parseLocalDate(trip.start_date).toLocaleDateString("pt-BR")} – ${parseLocalDate(trip.end_date).toLocaleDateString("pt-BR")}`}
              />
            </div>
          </div>
          <CapaViagem src={trip.cover_image} semente={trip.id} className="h-44 md:h-auto md:w-[40%]" />
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Itinerário</CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{itineraryItems?.length || 0}</div>
            <p className="text-xs text-muted-foreground">atividades</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Gastos</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: trip.currency || "BRL",
              }).format(totalExpenses)}
            </div>
            <p className="text-xs text-muted-foreground">{expenses?.length || 0} despesas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Lugares</CardTitle>
            <MapPinned className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{places?.length || 0}</div>
            <p className="text-xs text-muted-foreground">salvos</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Duração</CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.ceil(
                (new Date(parseLocalDate(trip.end_date)).getTime() - new Date(parseLocalDate(trip.start_date)).getTime()) / (1000 * 60 * 60 * 24),
              )}
            </div>
            <p className="text-xs text-muted-foreground">dias</p>
          </CardContent>
        </Card>
      </div>

      <TripMembers tripId={id} members={members || []} isOwner={isOwner} />

      {/* Tabs */}
      <Tabs defaultValue={abaInicial} className="w-full">
        {/* Quatro abas não cabem numa linha no celular: a lista quebra em vez de estourar. */}
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="itinerary">Itinerário</TabsTrigger>
          <TabsTrigger value="expenses">Despesas</TabsTrigger>
          <TabsTrigger value="places">Lugares</TabsTrigger>
          <TabsTrigger value="bookings">Reservas</TabsTrigger>
        </TabsList>

        <TabsContent value="itinerary" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle>Itinerário</CardTitle>
                  <CardDescription>Organize suas atividades dia a dia</CardDescription>
                </div>
                <Button asChild className="bg-primary hover:bg-primary/90">
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
                <div className="flex flex-wrap justify-end gap-2">
                  <Button asChild variant="outline">
                    <Link href={`/dashboard/trips/${id}/acerto`}>Acerto de contas</Link>
                  </Button>
                  <Button asChild className="bg-primary hover:bg-primary/90">
                    <Link href={`/dashboard/trips/${id}/expenses/new`}>
                      <Plus className="mr-2 h-4 w-4" />
                      Adicionar Despesa
                    </Link>
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ExpenseList expenses={expenses || []} tripId={id} currentUserId={user.id} isOwner={isOwner} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="places" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle>Lugares Salvos</CardTitle>
                  <CardDescription>Pontos turísticos e locais de interesse</CardDescription>
                </div>
                <Button asChild className="bg-primary hover:bg-primary/90">
                  <Link href={`/dashboard/trips/${id}/places`}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Lugar
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <PlaceList places={places || []} tripId={id} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="bookings" className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle>Reservas</CardTitle>
                  <CardDescription>Voos, hospedagens e demais reservas da viagem</CardDescription>
                </div>
                <Button asChild className="bg-primary hover:bg-primary/90">
                  <Link href={`/dashboard/trips/${id}/bookings/new`}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar Reserva
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <BookingList bookings={bookings || []} tripId={id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
