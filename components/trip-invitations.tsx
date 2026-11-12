"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bell, Check, X, MapPin, Calendar, Loader2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";

interface Invitation {
  id: string;
  trip_id: string;
  status: string;
  created_at: string;
  // `null` enquanto a pessoa não aceita: `GET /api/invitations` lê a viagem
  // sob a RLS de `trips`, que só libera dono e membro. O cartão precisa
  // continuar de pé — é por ele que se entra na viagem.
  trip: {
    id: string;
    title: string;
    destination: string;
    start_date: string;
    end_date: string;
  } | null;
}

interface TripInvitationsProps {
  invitations: Invitation[];
}

/**
 * `start_date` chega como "2026-12-01". `new Date()` lê esse formato como
 * meia-noite UTC, que em Brasília ainda é o dia anterior — o convite mostrava
 * a viagem começando um dia antes.
 */
function formatarData(valor: string) {
  const [ano, mes, dia] = valor.split("T")[0].split("-");
  return `${dia}/${mes}/${ano}`;
}

/**
 * Convites pendentes de quem está logado, no dashboard.
 *
 * @RF04.3 o convidado aceita ou recusa o convite
 */
export function TripInvitations({ invitations }: TripInvitationsProps) {
  const { setTripsLoading, refreshTrips, refreshInvitations } = useAuth();
  const router = useRouter();
  const { toast } = useToast();
  const [pendente, setPendente] = useState<string | null>(null);

  const responder = async (invitationId: string, acao: "accept" | "decline") => {
    setPendente(invitationId);
    try {
      setTripsLoading(true);

      const response = await fetch(`/api/invitations/${invitationId}/${acao}`, {
        method: "POST",
      });

      const { error }: { error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(error || "Não foi possível responder ao convite");
      }

      // O estado das viagens e dos convites vive no contexto, não no cache do
      // servidor. Sem estes dois refreshes a viagem aceita só aparecia depois de
      // um reload manual; `router.refresh()` sozinho não recarrega o contexto.
      if (acao === "accept") {
        await Promise.all([refreshTrips(), refreshInvitations()]);
        toast({ title: "Convite aceito", description: "A viagem já aparece no seu painel."});
      } else {
        await refreshInvitations();
        toast({ title: "Convite recusado" });
      }
      router.refresh();
    } catch (err) {
      const mensagem =
        err instanceof Error && !(err instanceof TypeError)
          ? err.message
          : "Não foi possível responder ao convite";
      toast({ title: "Erro", description: mensagem, variant: "destructive" });
    } finally {
      setTripsLoading(false);
      setPendente(null);
    }
  };

  if (invitations.length === 0) return null;

  return (
    <Card className="border-viaja-orange/20 bg-orange-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-viaja-orange">
          <Bell className="h-5 w-5" />
          Convites Pendentes
        </CardTitle>
        <CardDescription>
          Você tem {invitations.length}{" "}
          {invitations.length === 1 ? "convite" : "convites"} para viagens
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {invitations.map((invitation) => (
          <div
            key={invitation.id}
            className="rounded-lg border border-viaja-orange/20 bg-white p-4"
          >
            <div className="mb-3">
              <h4 className="font-semibold text-viaja-navy">
                {invitation.trip?.title ?? "Viagem em grupo"}
              </h4>
            </div>
            {invitation.trip ? (
              <div className="mb-4 space-y-1 text-sm text-gray-600">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>{invitation.trip.destination}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {formatarData(invitation.trip.start_date)} -{" "}
                    {formatarData(invitation.trip.end_date)}
                  </span>
                </div>
              </div>
            ) : (
              <p className="mb-4 text-sm text-gray-600">
                Os detalhes da viagem aparecem depois que você aceitar.
              </p>
            )}
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={pendente !== null}
                onClick={() => responder(invitation.id, "accept")}
                className="flex-1 bg-viaja-green hover:bg-viaja-green/90"
              >
                {pendente === invitation.id ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Aceitar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pendente !== null}
                onClick={() => responder(invitation.id, "decline")}
                className="flex-1 border-red-200 text-red-600 hover:bg-red-50"
              >
                <X className="mr-2 h-4 w-4" />
                Recusar
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
