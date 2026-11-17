import type { ComponentProps } from "react"
import { redirect } from "next/navigation"
import { lerDaApi, lerDaApiOpcional, usuarioDaSessao } from "@/lib/api-servidor"
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
import { CapaViagem } from "@/components/brand/capa-viagem"
import { BotaoPublicar } from "@/components/prototipo/botao-publicar"

type ItemItinerario = ComponentProps<typeof ItineraryList>["items"][number]
type Lugar = ComponentProps<typeof PlaceList>["places"][number]
type Reserva = ComponentProps<typeof BookingList>["bookings"][number]
type Despesa = ComponentProps<typeof ExpenseList>["expenses"][number]

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number)
  return new Date(year, month - 1, day) // <-- interpreta como data local
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

  // Tudo vem da API, com o cookie da sessão: ela decide sessão, participação e
  // RLS. Viagem que não existe e viagem de que a pessoa não participa dão o
  // mesmo 404 (`lerDaApi` trata 403 e 404 igual), para não revelar que existe.
  const user = await usuarioDaSessao()

  const [{ trip }, { members }, { itinerary: itineraryItems }, { places }, { bookings }, despesas] = await Promise.all([
    lerDaApi<{ trip: Trip & { description?: string | null; cover_image?: string | null } }>(`/api/trips/${id}`),
    lerDaApi<{ members: { id: string; user_id: string; role: string; profiles: { full_name: string | null } }[] }>(
      `/api/trips/${id}/members`,
    ),
    lerDaApi<{ itinerary: ItemItinerario[] }>(`/api/trips/${id}/itinerary`),
    lerDaApi<{ places: Lugar[] }>(`/api/trips/${id}/places`),
    lerDaApi<{ bookings: Reserva[] }>(`/api/trips/${id}/bookings`),
    // Despesas ainda não foram portadas para a API (financeiro, etapa 2): até
    // lá a aba fica vazia em vez de derrubar a página.
    lerDaApiOpcional<{ expenses: Despesa[] }>(`/api/trips/${id}/expenses`),
  ])
  const expenses = despesas?.expenses ?? []

  const isOwner = trip.user_id === user.id

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
                <Button
                  asChild
                  variant="outline"
                  className="h-10 rounded-xl border-0 bg-primary-foreground text-foreground"
                >
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

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <aside aria-label="Resumo da viagem" className="order-last space-y-4 lg:order-none lg:col-start-2 lg:row-start-1">
          <section className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4 lg:grid-cols-2">
            <div className="bg-card p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Calendar className="h-4 w-4 text-primary" aria-hidden />
                Itinerário
              </div>
              <div className="text-2xl font-semibold tabular-nums">{itineraryItems?.length || 0}</div>
              <p className="text-xs text-muted-foreground">atividades</p>
            </div>

            <div className="bg-card p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <DollarSign className="h-4 w-4 text-primary" aria-hidden />
                Gastos
              </div>
              <div className="truncate text-2xl font-semibold tabular-nums">
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: trip.currency || "BRL",
                }).format(totalExpenses)}
              </div>
              <p className="text-xs text-muted-foreground">{expenses?.length || 0} despesas</p>
            </div>

            <div className="bg-card p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MapPinned className="h-4 w-4 text-primary" aria-hidden />
                Lugares
              </div>
              <div className="text-2xl font-semibold tabular-nums">{places?.length || 0}</div>
              <p className="text-xs text-muted-foreground">salvos</p>
            </div>

            <div className="bg-card p-4">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Clock className="h-4 w-4 text-primary" aria-hidden />
                Duração
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {Math.ceil(
                  (new Date(parseLocalDate(trip.end_date)).getTime() -
                    new Date(parseLocalDate(trip.start_date)).getTime()) /
                    (1000 * 60 * 60 * 24),
                )}
              </div>
              <p className="text-xs text-muted-foreground">dias</p>
            </div>
          </section>

          <TripMembers tripId={id} members={members || []} isOwner={isOwner} />
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          {/* Tabs */}
          <Tabs defaultValue={abaInicial} className="w-full">
            {/* Quatro abas não cabem numa linha no celular: a lista quebra em vez de estourar. */}
            <TabsList className="h-auto">
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
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="outline">
                        <Link href={`/dashboard/trips/${id}/bookings/new`}>
                          <Plus className="mr-2 h-4 w-4" />
                          Adicionar Reserva
                        </Link>
                      </Button>
                      <Button asChild className="bg-citrico text-grafite hover:bg-citrico/90">
                        <Link href="/dashboard/reservar/voos">Buscar voos e hotéis</Link>
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <BookingList bookings={bookings || []} tripId={id} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
