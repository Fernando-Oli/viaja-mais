"use client";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Link from "next/link";
import { Plus, Calendar, MapPin, DollarSign } from "lucide-react";
import { useAuth } from "@/context/auth-context";

function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day); // <-- interpreta como data local
}

export default function TripsPage() {
  const { trips, user } = useAuth();

  const upcomingTrips =
    trips?.filter((trip) => new Date(trip.end_date) >= new Date()) || [];
  const pastTrips =
    trips?.filter((trip) => new Date(trip.end_date) < new Date()) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-viaja-navy">Minhas Viagens</h1>
          <p className="mt-2 text-gray-600">
            Gerencie todas as suas viagens em um só lugar
          </p>
        </div>
        <Button asChild className="bg-viaja-orange hover:bg-viaja-orange/90">
          <Link href="/dashboard/trips/new">
            <Plus className="mr-2 h-4 w-4" />
            Nova Viagem
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
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="mb-4 h-12 w-12 text-gray-300" />
                <h3 className="mb-2 text-lg font-semibold text-viaja-navy">
                  Nenhuma viagem futura
                </h3>
                <p className="mb-4 text-center text-gray-600">
                  Comece a planejar sua próxima aventura!
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {upcomingTrips.map((trip) => (
                <TripCard key={trip.id} trip={trip} userId={user?.id || ""} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="past" className="mt-6">
          {pastTrips.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="mb-4 h-12 w-12 text-gray-300" />
                <h3 className="mb-2 text-lg font-semibold text-viaja-navy">
                  Nenhuma viagem anterior
                </h3>
                <p className="text-center text-gray-600">
                  Suas viagens passadas aparecerão aqui
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pastTrips.map((trip) => (
                <TripCard key={trip.id} trip={trip} userId={user?.id || ""} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-6">
          {!trips || trips.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="mb-4 h-12 w-12 text-gray-300" />
                <h3 className="mb-2 text-lg font-semibold text-viaja-navy">
                  Nenhuma viagem cadastrada
                </h3>
                <p className="mb-4 text-center text-gray-600">
                  Crie sua primeira viagem agora!
                </p>
                <Button
                  asChild
                  className="bg-viaja-orange hover:bg-viaja-orange/90"
                >
                  <Link href="/dashboard/trips/new">
                    <Plus className="mr-2 h-4 w-4" />
                    Criar Viagem
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {trips.map((trip) => (
                <TripCard key={trip.id} trip={trip} userId={user?.id || ""} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

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
    <Link href={`/dashboard/trips/${trip.id}`}>
      <Card className="transition-all hover:shadow-lg">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <CardTitle className="line-clamp-1">{trip.title}</CardTitle>
              <CardDescription className="mt-1 flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {trip.destination}
              </CardDescription>
            </div>
            <div className="flex flex-col gap-1 items-end">
              <Badge
                variant={trip.status === "confirmed" ? "default" : "secondary"}
              >
                {statusLabels[trip.status]}
              </Badge>
              {!isOwner && (
                <Badge variant="outline" className="text-xs">
                  Membro
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2 text-gray-600">
              <Calendar className="h-4 w-4" />
              <span>
                {parseLocalDate(trip.start_date).toLocaleDateString("pt-BR")} -{" "}
                {parseLocalDate(trip.end_date).toLocaleDateString("pt-BR")}
              </span>
            </div>
            {trip.budget && (
              <div className="flex items-center gap-2 text-gray-600">
                <DollarSign className="h-4 w-4" />
                <span>
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency: trip.currency || "BRL",
                  }).format(Number(trip.budget))}
                </span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
