"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Users, Mail, UserPlus, X, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

interface Member {
  id: string
  user_id: string
  role: string
  profiles: {
    full_name: string
    email: string
  }
}

interface TripMembersProps {
  tripId: string
  members: Member[]
  isOwner: boolean
}

export function TripMembers({ tripId, members, isOwner }: TripMembersProps) {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) throw new Error("Não autenticado")

      const isMember = members.some((m) => m.profiles?.email === email)
      if (isMember) {
        setError("Este usuário já é membro da viagem")
        setIsLoading(false)
        return
      }

      // Check if user exists
      const { data: inviteeProfile } = await supabase
        .from("profiles")
        .select("id, email, full_name")
        .eq("email", email)
        .single()

      if (!inviteeProfile) {
        // For users that don't exist, invite them to sign up
        const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
          data: {
            invited_to_trip: tripId,
          },
          redirectTo: `${window.location.origin}/dashboard`,
        })

        if (inviteError) {
          console.error("Invite error:", inviteError)
          // Continue anyway - create invitation record
        }
      }

      // Create invitation record
      const { error: inviteError } = await supabase.from("trip_invitations").insert({
        trip_id: tripId,
        inviter_id: user.id,
        invitee_email: email,
        invitee_id: inviteeProfile?.id || null,
        status: "pending",
      })

      if (inviteError) throw inviteError

      alert(
        inviteeProfile
          ? "Convite enviado! O usuário verá o convite no dashboard."
          : "Convite enviado por email! A pessoa precisará criar uma conta para aceitar.",
      )

      setEmail("")
      router.refresh()
    } catch (err: any) {
      console.error("Error inviting:", err)
      setError(err.message || "Erro ao enviar convite")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!confirm("Tem certeza que deseja remover este membro?")) return

    try {
      const { error } = await supabase.from("trip_members").delete().eq("id", memberId)

      if (error) throw error
      router.refresh()
    } catch (err: any) {
      alert("Erro ao remover membro: " + err.message)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-viaja-orange" />
          Membros da Viagem
        </CardTitle>
        <CardDescription>
          {members.length} {members.length === 1 ? "pessoa" : "pessoas"} nesta viagem
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Members List */}
        <div className="space-y-3">
          {members.map((member) => {
            const initials =
              member.profiles?.full_name
                ?.split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2) || "?"

            return (
              <div key={member.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback className="bg-viaja-green text-white">{initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-viaja-navy">{member.profiles?.full_name || "Usuário"}</p>
                    <p className="text-sm text-gray-600">{member.profiles?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                    {member.role === "owner" ? "Dono" : "Membro"}
                  </Badge>
                  {isOwner && member.role !== "owner" && (
                    <Button variant="ghost" size="sm" onClick={() => handleRemoveMember(member.id)}>
                      <X className="h-4 w-4 text-red-600" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Invite Form */}
        {isOwner && (
          <div className="border-t pt-6">
            <h4 className="mb-3 flex items-center gap-2 font-medium text-viaja-navy">
              <UserPlus className="h-4 w-4" />
              Convidar Pessoas
            </h4>
            <form onSubmit={handleInvite} className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="email"
                    placeholder="email@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
                <Button type="submit" disabled={isLoading} className="bg-viaja-orange hover:bg-viaja-orange/90">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar Convite"}
                </Button>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
