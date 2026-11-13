"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import ConfirmModal from "@/components/ui/confirm-modal"
import { useToast } from "@/hooks/use-toast"
import { Calendar, Car, Hotel, MapPin, Pencil, Plane, Ticket, Trash2, type LucideIcon } from "lucide-react"

interface Booking {
  id: string
  type: string
  title: string
  provider: string | null
  confirmation_number: string | null
  start_date: string
  end_date: string | null
  location: string | null
  price: number | null
  currency: string | null
  status: string | null
}

interface BookingListProps {
  bookings: Booking[]
  tripId: string
}

const typeIcons: Record<string, LucideIcon> = {
  flight: Plane,
  hotel: Hotel,
  car: Car,
  activity: Ticket,
  other: MapPin,
}

const typeLabels: Record<string, string> = {
  flight: "Voo",
  hotel: "Hotel",
  car: "Carro",
  activity: "Atividade",
  other: "Outro",
}

const statusColors: Record<string, string> = {
  pending: "bg-citrico text-grafite",
  confirmed: "bg-primary text-primary-foreground",
  cancelled: "bg-destructive/10 text-destructive",
}

const statusLabels: Record<string, string> = {
  pending: "Pendente",
  confirmed: "Confirmado",
  cancelled: "Cancelado",
}

// Formata a partir do texto gravado, sem `new Date()`: a hora digitada é a hora
// local do voo ou do check-in, e converter pelo fuso do navegador a deslocaria.
function formatarDataHora(valor: string) {
  const [data, hora = ""] = valor.split("T")
  const [ano, mes, dia] = data.split("-")
  const hhmm = hora.slice(0, 5)
  return hhmm ? `${dia}/${mes}/${ano} ${hhmm}` : `${dia}/${mes}/${ano}`
}

/**
 * Reservas de uma viagem, com editar e excluir. Toda escrita passa pela rota
 * `/api/trips/[tripId]/bookings/[bookingId]`, que confere a participação na viagem.
 *
 * @RF07.7 visualizar reservas · @RF07.5 editar reserva · @RF07.6 excluir reserva
 */
export function BookingList({ bookings, tripId }: BookingListProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [pendente, setPendente] = useState<string | null>(null)
  const [paraExcluir, setParaExcluir] = useState<Booking | null>(null)

  async function excluir(booking: Booking) {
    setParaExcluir(null)
    setPendente(booking.id)
    try {
      const resposta = await fetch(`/api/trips/${tripId}/bookings/${booking.id}`, { method: "DELETE" })
      if (!resposta.ok) {
        const dados: { error?: string } = await resposta.json().catch(() => ({}))
        throw new Error(dados.error || "Erro ao excluir reserva")
      }
      toast({ title: "Reserva excluída" })
      router.refresh()
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Erro ao excluir reserva"
      toast({ title: "Erro", description: mensagem, variant: "destructive" })
    } finally {
      setPendente(null)
    }
  }

  if (bookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Plane className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <h3 className="mb-2 text-lg font-semibold text-foreground">Nenhuma reserva cadastrada</h3>
        <p className="text-center text-muted-foreground">Adicione voos, hotéis e outras reservas da viagem</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ConfirmModal
        open={paraExcluir !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setParaExcluir(null)
        }}
        title="Excluir reserva?"
        description={`"${paraExcluir?.title ?? ""}" será removida da viagem. Essa ação é irreversível.`}
        confirmText="Excluir"
        variant="destructive"
        onConfirm={() => paraExcluir && excluir(paraExcluir)}
      />

      {bookings.map((booking) => {
        const Icon = typeIcons[booking.type] ?? MapPin
        const status = booking.status ?? "confirmed"
        const ocupado = pendente === booking.id

        return (
          <div key={booking.id} className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-primary">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="font-semibold text-foreground">{booking.title}</h4>
                  <Badge variant="secondary">{typeLabels[booking.type] ?? booking.type}</Badge>
                  <Badge className={statusColors[status]}>{statusLabels[status] ?? status}</Badge>
                </div>

                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 shrink-0" />
                    <span>
                      {formatarDataHora(booking.start_date)}
                      {booking.end_date && ` - ${formatarDataHora(booking.end_date)}`}
                    </span>
                  </div>
                  {booking.provider && (
                    <p>
                      <span className="font-medium">Provedor:</span> {booking.provider}
                    </p>
                  )}
                  {booking.confirmation_number && (
                    <p className="flex items-center gap-2">
                      <span className="font-medium">Confirmação:</span>
                      <span className="rounded-lg bg-muted px-2 py-0.5 font-semibold tracking-wider text-foreground">
                        {booking.confirmation_number}
                      </span>
                    </p>
                  )}
                  {booking.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 shrink-0" />
                      <span>{booking.location}</span>
                    </div>
                  )}
                  {booking.price !== null && (
                    <p className="pt-1 text-base font-semibold tabular-nums text-foreground">
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: booking.currency || "BRL",
                      }).format(Number(booking.price))}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <Link href={`/dashboard/trips/${tripId}/bookings/${booking.id}/edit`}>
                  <Pencil className="mr-1 h-4 w-4" />
                  Editar
                </Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={ocupado}
                onClick={() => setParaExcluir(booking)}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Excluir
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
