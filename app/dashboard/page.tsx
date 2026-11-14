"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
  Plus,
  Calendar,
  MapPin,
  DollarSign,
  Plane,
  Trash2,
} from "lucide-react";
import { TripInvitations } from "@/components/trip-invitations";
import { CapaViagem } from "@/components/brand/capa-viagem";
import { useAuth } from "@/context/auth-context";
import ConfirmModal from "@/components/ui/confirm-modal";

export default function DashboardPage() {
  const { profile, trips, invitations, deleteTrip } = useAuth();
  const [openModal, setModal] = useState(false);
  const [tripSelect, setTripSelect] = useState("");

  function parseLocalDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day); // <-- interpreta como data local
}

  const upcomingTrips =
    trips?.filter((trip) => new Date(trip.start_date) >= new Date()) || [];
  const proxima = [...upcomingTrips].sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  function diasAte(data: string) {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return Math.max(0, Math.round((parseLocalDate(data).getTime() - hoje.getTime()) / 86_400_000));
  }
  const pastTrips =
    trips?.filter((trip) => new Date(trip.start_date) < new Date()) || [];

  return (
    <div className="space-y-8">
      {/* Header */}
      {openModal && (
        <ConfirmModal
          open={openModal}
          title="Deseja excluir mesmo essa viagem?"
          description="Essa ação é irreversível."
          onConfirm={() => deleteTrip(tripSelect)}
          onOpenChange={() => {
            setModal(false);
            setTripSelect("");
          }}
        />
      )}
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Olá, {profile?.full_name?.split(" ")[0] || "Viajante"}.
        </h1>
        <p className="mt-1 text-muted-foreground">
          {proxima ? "Sua próxima viagem está logo abaixo." : "Que tal planejar a próxima viagem?"}
        </p>
      </div>

      {proxima ? (
        <Link
          href={`/dashboard/trips/${proxima.id}`}
          className="flex min-h-72 flex-col overflow-hidden rounded-3xl bg-primary text-primary-foreground md:flex-row"
        >
          <div className="flex flex-1 flex-col justify-end gap-3 p-6 md:p-8">
            <span className="self-start rounded-full bg-citrico px-3 py-1 text-xs font-medium text-grafite">
              {diasAte(proxima.start_date) === 0
                ? "Começa hoje"
                : `Faltam ${diasAte(proxima.start_date)} dias`}
            </span>
            <h2 className="text-4xl font-semibold leading-none tracking-tight md:text-5xl">{proxima.title}</h2>
            <p className="font-medium">
              {proxima.destination} · {parseLocalDate(proxima.start_date).toLocaleDateString("pt-BR")} –{" "}
              {parseLocalDate(proxima.end_date).toLocaleDateString("pt-BR")}
            </p>
            <span className="mt-2 inline-flex items-center gap-1 self-start rounded-full bg-primary-foreground px-4 py-2 text-sm font-medium text-foreground">
              Abrir viagem
            </span>
          </div>
          <CapaViagem semente={proxima.id} className="h-48 md:h-auto md:w-[45%]" />
        </Link>
      ) : null}

      {invitations && invitations.length > 0 && (
        <TripInvitations invitations={invitations} />
      )}

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Viagens futuras
            </CardTitle>
            <Plane className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{upcomingTrips.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Viagens realizadas
            </CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{pastTrips.length}</div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total de viagens
            </CardTitle>
            <MapPin className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{trips?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Trips */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-semibold">
            Próximas viagens
          </h2>
          <Button asChild className="bg-primary hover:bg-primary/90">
            <Link href="/dashboard/trips/criar">
              <Plus className="mr-2 h-4 w-4" />
              Nova viagem
            </Link>
          </Button>
        </div>

        {upcomingTrips.length === 0 ? (
          <Card className="rounded-2xl">
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Plane className="mb-4 h-12 w-12 text-gray-300" />
              <h3 className="mb-2 text-lg font-semibold text-foreground">
                Nenhuma viagem planejada
              </h3>
              <p className="mb-4 text-center text-muted-foreground">
                Comece a planejar sua próxima aventura agora!
              </p>
              <Button
                asChild
                className="bg-primary hover:bg-primary/90"
              >
                <Link href="/dashboard/trips/criar">
                  <Plus className="mr-2 h-4 w-4" />
                  Criar a primeira viagem
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {upcomingTrips.map((trip) => (
              <Card
                key={trip.id}
                className="group relative rounded-2xl transition-all hover:shadow-lg"
              >
                <Button
                  onClick={() => {
                    setModal(true);
                    setTripSelect(trip.id);
                  }}
                  size="sm"
                  variant="ghost"
                  aria-label={`Excluir viagem ${trip.title}`}
                  className="absolute right-2 bottom-2 z-10 hover:bg-destructive cursor-pointer hover:text-primary-foreground transition-colors duration-200"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Link href={`/dashboard/trips/${trip.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="line-clamp-1">
                          {trip.title}
                        </CardTitle>
                        <CardDescription className="mt-1 flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {trip.destination}
                        </CardDescription>
                      </div>
                      <Badge
                        variant={
                          trip.status === "confirmed" ? "default" : "secondary"
                        }
                      >
                        {trip.status === "planning" && "Planejando"}
                        {trip.status === "confirmed" && "Confirmada"}
                        {trip.status === "ongoing" && "Em andamento"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {parseLocalDate(trip.start_date).toLocaleDateString(
                            "pt-BR"
                          )}{" "}
                          -{" "}
                          {parseLocalDate(trip.end_date).toLocaleDateString(
                            "pt-BR"
                          )}
                        </span>
                      </div>
                      {trip.budget && (
                        <div className="flex items-center gap-2 text-muted-foreground">
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
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>

      {pastTrips.length > 0 && (
        <div>
          <h2 className="mb-4 text-2xl font-semibold">
            Viagens anteriores
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pastTrips.map((trip) => (
              <Card
                key={trip.id}
                className="group relative border-dashed transition-all hover:shadow-lg"
              >
                <Button
                  onClick={() => {
                    setModal(true);
                    setTripSelect(trip.id);
                  }}
                  size="sm"
                  variant="ghost"
                  aria-label={`Excluir viagem ${trip.title}`}
                  className="absolute right-2 bottom-2 z-10 hover:bg-destructive cursor-pointer hover:text-primary-foreground transition-colors duration-200"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
                <Link href={`/dashboard/trips/${trip.id}`}>
                  <CardHeader>
                    <CardTitle className="line-clamp-1">{trip.title}</CardTitle>
                    <CardDescription className="mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {trip.destination}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {parseLocalDate(trip.start_date).toLocaleDateString(
                            "pt-BR"
                          )}{" "}
                          -{" "}
                          {parseLocalDate(trip.end_date).toLocaleDateString(
                            "pt-BR"
                          )}
                      </span>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
