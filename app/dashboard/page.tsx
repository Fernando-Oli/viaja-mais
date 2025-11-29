"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
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
import { useAuth } from "@/context/auth-context";
import ConfirmModal from "@/components/ui/confirm-modal";

export default function DashboardPage() {
  const { profile, trips, invitations, deleteTrip } = useAuth();
  const [openModal, setModal] = useState(false);
  const [tripSelect, setTripSelect] = useState("");

  const upcomingTrips =
    trips?.filter((trip) => new Date(trip.start_date) >= new Date()) || [];
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
        <h1 className="text-3xl font-bold text-viaja-navy">
          Olá, {profile?.full_name || "Viajante"}!
        </h1>
        <p className="mt-2 text-gray-600">
          Gerencie suas viagens e planeje novas aventuras
        </p>
      </div>

      {invitations && invitations.length > 0 && (
        <TripInvitations invitations={invitations} />
      )}

      {/* Quick Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Viagens Futuras
            </CardTitle>
            <Plane className="h-4 w-4 text-sky-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{upcomingTrips.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Viagens Realizadas
            </CardTitle>
            <Calendar className="h-4 w-4 text-amber-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pastTrips.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total de Viagens
            </CardTitle>
            <MapPin className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{trips?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Trips */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-viaja-navy">
            Próximas Viagens
          </h2>
          <Button asChild className="bg-viaja-orange hover:bg-viaja-orange/90">
            <Link href="/dashboard/trips/new">
              <Plus className="mr-2 h-4 w-4" />
              Nova Viagem
            </Link>
          </Button>
        </div>

        {upcomingTrips.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Plane className="mb-4 h-12 w-12 text-gray-300" />
              <h3 className="mb-2 text-lg font-semibold text-viaja-navy">
                Nenhuma viagem planejada
              </h3>
              <p className="mb-4 text-center text-gray-600">
                Comece a planejar sua próxima aventura agora!
              </p>
              <Button
                asChild
                className="bg-viaja-orange hover:bg-viaja-orange/90"
              >
                <Link href="/dashboard/trips/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Criar Primeira Viagem
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {upcomingTrips.map((trip) => (
              <Card
                key={trip.id}
                className="group relative transition-all hover:shadow-lg"
              >
                <Button
                  onClick={() => {
                    setModal(true);
                    setTripSelect(trip.id);
                  }}
                  size="sm"
                  variant="ghost"
                  className="absolute right-2 top-2 z-10 hover:bg-red-600"
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
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar className="h-4 w-4" />
                        <span>
                          {new Date(trip.start_date).toLocaleDateString(
                            "pt-BR"
                          )}{" "}
                          -{" "}
                          {new Date(trip.end_date).toLocaleDateString("pt-BR")}
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
                </Link>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Past Trips */}
      {pastTrips.length > 0 && (
        <div>
          <h2 className="mb-4 text-2xl font-bold text-viaja-navy">
            Viagens Anteriores
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {pastTrips.map((trip) => (
              <Card
                key={trip.id}
                className="group relative opacity-75 transition-all hover:opacity-100 hover:shadow-lg"
              >
                <Button
                  onClick={() => {
                    setModal(true);
                    setTripSelect(trip.id);
                  }}
                  size="sm"
                  variant="ghost"
                  className="absolute right-2 top-2 z-10 hover:bg-red-600 cursor-pointer hover:text-white transition-colors duration-200"
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
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="h-4 w-4" />
                      <span>
                        {new Date(trip.start_date).toLocaleDateString("pt-BR")}
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
