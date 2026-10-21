"use client"

import type React from "react"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import ConfirmModal from "@/components/ui/confirm-modal"
import { useToast } from "@/hooks/use-toast"
import { Users, Mail, UserPlus, X, Loader2 } from "lucide-react"
import { useRouter } from "next/navigation"

interface Member {
  id: string
  user_id: string
  role: string
  // Sem e-mail: `profiles` não guarda e-mail, e o de `auth.users` não é
  // exposto a outros membros.
  profiles: {
    full_name: string | null
  }
}

interface TripMembersProps {
  tripId: string
  members: Member[]
  isOwner: boolean
}

/**
 * O que dizer depois do convite, conforme o `envio` devolvido por
 * `POST /api/invitations`. O convite já está gravado nos três casos; muda só
 * se o e-mail saiu.
 */
const AVISO_DO_ENVIO: Record<string, string> = {
  enviado: "Enviamos um e-mail com o convite.",
  "ja-cadastrado": "A pessoa já tem conta e vai ver o convite ao entrar no ViajaMais.",
  falhou: "O e-mail não pôde ser enviado, mas o convite aparece para a pessoa ao entrar no ViajaMais.",
}

/**
 * Membros da viagem, com o convite por e-mail (só para o dono) e a remoção de
 * membro. Toda escrita passa por rota: `/api/invitations` e
 * `/api/trips/[tripId]/members`.
 *
 * @RF04.1 o dono convida pessoas por e-mail · @RF04.7 o dono remove membros
 */
export function TripMembers({ tripId, members, isOwner }: TripMembersProps) {
  const [email, setEmail] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [paraRemover, setParaRemover] = useState<Member | null>(null)
  const [removendo, setRemovendo] = useState<string | null>(null)
  const router = useRouter()
  const { toast } = useToast()

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    try {
      const res = await fetch("/api/invitations/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        // `inviterId` não vai mais: quem convida sai da sessão no servidor.
        body: JSON.stringify({ email, tripId }),
      })

      const corpo: { error?: string; envio?: string } = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(corpo.error || "Erro ao enviar convite")
      }

      toast({ title: "Convite enviado", description: AVISO_DO_ENVIO[corpo.envio ?? ""] })
      setEmail("")
    } catch (err) {
      // Sem rede o `fetch` rejeita com um TypeError em inglês, que não diz nada ao usuário.
      const mensagem =
        err instanceof Error && !(err instanceof TypeError) ? err.message : "Não foi possível enviar o convite"
      toast({ title: "Erro", description: mensagem, variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  // Passa pela rota, e não por `supabase.from(...).delete()` daqui: escrita no
  // banco a partir do navegador se apoia só na RLS, sem checagem explícita de
  // autorização no servidor. Ver regra 1 do CLAUDE.md.
  const handleRemoveMember = async (member: Member) => {
    setParaRemover(null)
    setRemovendo(member.user_id)
    try {
      const res = await fetch(`/api/trips/${tripId}/members?userId=${encodeURIComponent(member.user_id)}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const corpo: { error?: string } = await res.json().catch(() => ({}))
        throw new Error(corpo.error ?? "Erro ao remover membro")
      }

      toast({ title: "Membro removido" })
      router.refresh()
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Erro ao remover membro"
      toast({ title: "Erro", description: mensagem, variant: "destructive" })
    } finally {
      setRemovendo(null)
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
        <ConfirmModal
          open={paraRemover !== null}
          onOpenChange={(aberto) => {
            if (!aberto) setParaRemover(null)
          }}
          title="Remover membro?"
          description={`${paraRemover?.profiles?.full_name || "Esta pessoa"} deixará de ver a viagem e seus dados.`}
          confirmText="Remover"
          variant="destructive"
          onConfirm={() => paraRemover && handleRemoveMember(paraRemover)}
        />

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
              <div key={member.id} className="flex items-center justify-between gap-2 rounded-lg border p-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar>
                    <AvatarFallback className="bg-viaja-green text-white">{initials}</AvatarFallback>
                  </Avatar>
                  <p className="min-w-0 truncate font-medium text-viaja-navy">
                    {member.profiles?.full_name || "Usuário"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                    {member.role === "owner" ? "Dono" : "Membro"}
                  </Badge>
                  {isOwner && member.role !== "owner" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Remover ${member.profiles?.full_name || "membro"}`}
                      disabled={removendo === member.user_id}
                      onClick={() => setParaRemover(member)}
                    >
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
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <Input
                    type="email"
                    aria-label="E-mail de quem convidar"
                    placeholder="email@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
                <Button type="submit" disabled={isLoading} className="bg-viaja-orange hover:bg-viaja-orange/90">
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    "Enviar Convite"
                  )}
                </Button>
              </div>
            </form>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
