"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bell, Check, X, MapPin, Calendar } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

interface Invitation {
  id: string
  trip_id: string
  status: string
  created_at: string
  trips: {
    id: string
    title: string
    destination: string
    start_date: string
    end_date: string
  }
  profiles: {
    full_name: string
  }
}

interface TripInvitationsProps {
  invitations: Invitation[]
}

export function TripInvitations({ invitations }: TripInvitationsProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleAccept = async (invitationId: string, tripId: string) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Não autenticado")

      // Update invitation status
      const { error: updateError } = await supabase
        .from("trip_invitations")
        .update({ status: "accepted" })
        .eq("id", invitationId)

      if (updateError) throw updateError

      // Add user as member
      const { error: memberError } = await supabase.from("trip_members").insert({
        trip_id: tripId,
        user_id: user.id,
        role: "member",
      })

      if (memberError) throw memberError

      router.refresh()
    } catch (err: any) {
      alert("Erro ao aceitar convite: " + err.message)
    }
  }

  const handleDecline = async (invitationId: string) => {
    try {
      const { error } = await supabase.from("trip_invitations").update({ status: "declined" }).eq("id", invitationId)

      if (error) throw error
      router.refresh()
    } catch (err: any) {
      alert("Erro ao recusar convite: " + err.message)
    }
  }

  if (invitations.length === 0) return null

  return (
    <Card className="border-viaja-orange/20 bg-orange-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-viaja-orange">
          <Bell className="h-5 w-5" />
          Convites Pendentes
        </CardTitle>
        <CardDescription>
          Você tem {invitations.length} {invitations.length === 1 ? "convite" : "convites"} para viagens
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {invitations.map((invitation) => (
          <div key={invitation.id} className="rounded-lg border border-viaja-orange/20 bg-white p-4">
            <div className="mb-3">
              <h4 className="font-semibold text-viaja-navy">{invitation.trips.title}</h4>
              <p className="text-sm text-gray-600">Convite de {invitation.profiles.full_name}</p>
            </div>
            <div className="mb-4 space-y-1 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                <span>{invitation.trips.destination}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span>
                  {new Date(invitation.trips.start_date).toLocaleDateString("pt-BR")} -{" "}
                  {new Date(invitation.trips.end_date).toLocaleDateString("pt-BR")}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => handleAccept(invitation.id, invitation.trip_id)}
                className="flex-1 bg-viaja-green hover:bg-viaja-green/90"
              >
                <Check className="mr-2 h-4 w-4" />
                Aceitar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleDecline(invitation.id)}
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
  )
}
