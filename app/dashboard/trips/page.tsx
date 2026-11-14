"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { Plus, Calendar, MapPin, PenLine, Sparkles } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { CapaViagem } from "@/components/brand/capa-viagem";

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day); // <-- interpreta como data local
}

function Vazio({ titulo, texto, comBotoes }: { titulo: string; texto: string; comBotoes?: boolean }) {
  return (
    <Card className="rounded-3xl">
      <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Calendar className="mb-2 h-12 w-12 text-muted-foreground" aria-hidden />
        <h3 className="text-lg font-semibold">{titulo}</h3>
        <p className="max-w-md text-muted-foreground">{texto}</p>
        {comBotoes ? (
          <div className="mt-3 flex flex-wrap justify-center gap-3">
            <Link
              href="/dashboard/trips/criar/ia"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-citrico px-5 text-sm font-medium text-grafite hover:bg-citrico/90"
            >
              <Sparkles className="h-4 w-4" aria-hidden />
              Montar com a Avori
            </Link>
            <Button asChild className="h-11 rounded-xl px-5">
              <Link href="/dashboard/trips/new">
                <PenLine className="h-4 w-4" aria-hidden />
                Criar do meu jeito
              </Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function TripsPage() {
  const { trips, user } = useAuth();

  const upcomingTrips =
    trips?.filter((trip) => new Date(trip.end_date) >= new Date()) || [];
  const pastTrips =
    trips?.filter((trip) => new Date(trip.end_date) < new Date()) || [];

  const grade = (lista: NonNullable<typeof trips>, comNova?: boolean) => (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {lista.map((trip) => (
        <TripCard key={trip.id} trip={trip} userId={user?.id || ""} />
      ))}
      {comNova ? (
        <Link
          href="/dashboard/trips/criar"
          className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-input p-6 text-center transition-colors hover:bg-card"
        >
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-citrico text-grafite">
            <Plus className="h-6 w-6" aria-hidden />
          </span>
          <span className="text-lg font-semibold">Nova viagem</span>
          <span className="max-w-60 text-sm text-muted-foreground">Monte com a ajuda da Avori ou preencha do seu jeito.</span>
        </Link>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Viagens</h1>
          <p className="mt-1 text-muted-foreground">Todas as suas viagens, as suas e as do grupo.</p>
        </div>
        <Button asChild className="h-11 rounded-xl px-5">
          <Link href="/dashboard/trips/criar">
            <Plus className="h-4 w-4" />
            Nova viagem
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="upcoming" className="w-full">
        <TabsList>
          <TabsTrigger value="upcoming">
            Futuras ({upcomingTrips.length})
          </TabsTrigger>
          <TabsTrigger value="past">
            Anteriores ({pastTrips.length})
          </TabsTrigger>
          <TabsTrigger value="all">Todas ({trips?.length || 0})</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming" className="mt-6">
          {upcomingTrips.length === 0 ? (
            <Vazio
              titulo="Nenhuma viagem futura"
              texto="Crie a próxima e convide quem vai com você. Se alguém já convidou, o convite aparece aqui."
              comBotoes
            />
          ) : (
            grade(upcomingTrips, true)
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-6">
          {pastTrips.length === 0 ? (
            <Vazio titulo="Nenhuma viagem anterior" texto="Suas viagens passadas aparecerão aqui." />
          ) : (
            grade(pastTrips)
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-6">
          {!trips || trips.length === 0 ? (
            <Vazio titulo="Nenhuma viagem cadastrada" texto="Crie a sua primeira viagem agora." comBotoes />
          ) : (
            grade(trips, true)
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- o contexto ainda expõe a viagem sem tipo
function TripCard({ trip, userId }: { trip: any; userId: string }) {
  const statusLabels: Record<string, string> = {
    planning: "Planejando",
    confirmed: "Confirmada",
    ongoing: "Em andamento",
    completed: "Concluída",
    cancelled: "Cancelada",
  };

  const isOwner = trip.user_id === userId;

  return (
    <Link
      href={`/dashboard/trips/${trip.id}`}
      className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-shadow hover:shadow-lg"
    >
      <CapaViagem src={trip.cover_image} semente={trip.id} className="h-40">
        {!isOwner ? (
          <span className="absolute left-3 top-3 rounded-full bg-citrico px-2.5 py-0.5 text-xs font-medium text-grafite">
            Você é membro
          </span>
        ) : null}
      </CapaViagem>
      <div className="flex flex-col gap-2 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="line-clamp-1 text-xl font-semibold">{trip.title}</h2>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">{statusLabels[trip.status]}</span>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" aria-hidden />
          <span className="line-clamp-1">{trip.destination}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Calendar className="h-4 w-4" aria-hidden />
            {parseLocalDate(trip.start_date).toLocaleDateString("pt-BR")} –{" "}
            {parseLocalDate(trip.end_date).toLocaleDateString("pt-BR")}
          </span>
          {trip.budget ? (
            <span className="font-medium tabular-nums text-foreground">
              {new Intl.NumberFormat("pt-BR", {
                style: "currency",
                currency: trip.currency || "BRL",
              }).format(Number(trip.budget))}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
