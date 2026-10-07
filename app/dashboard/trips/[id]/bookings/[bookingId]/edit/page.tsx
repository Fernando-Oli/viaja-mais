"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { use, useEffect, useState } from "react"

// O banco devolve timestamptz completo; o <input type="datetime-local"> quer AAAA-MM-DDTHH:MM.
const paraCampoDataHora = (valor: string | null) => (valor ? valor.slice(0, 16) : "")

export default function EditBookingPage({ params }: { params: Promise<{ id: string; bookingId: string }> }) {
  const { id, bookingId } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)

  const [formData, setFormData] = useState({
    type: "flight",
    title: "",
    confirmation_number: "",
    provider: "",
    start_date: "",
    end_date: "",
    location: "",
    price: "",
    currency: "BRL",
    status: "confirmed",
    notes: "",
  })

  useEffect(() => {
    async function carregar() {
      const resposta = await fetch(`/api/trips/${id}/bookings/${bookingId}`)
      if (!resposta.ok) {
        toast({ title: "Erro", description: "Não foi possível carregar a reserva", variant: "destructive" })
        router.push("/dashboard/trips")
        return
      }
      const { booking } = await resposta.json()
      setFormData({
        type: booking.type,
        title: booking.title,
        confirmation_number: booking.confirmation_number ?? "",
        provider: booking.provider ?? "",
        start_date: paraCampoDataHora(booking.start_date),
        end_date: paraCampoDataHora(booking.end_date),
        location: booking.location ?? "",
        price: booking.price === null ? "" : String(booking.price),
        currency: booking.currency ?? "BRL",
        status: booking.status ?? "confirmed",
        notes: booking.notes ?? "",
      })
      setIsFetching(false)
    }
    carregar()
  }, [id, bookingId, router, toast])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const resposta = await fetch(`/api/trips/${id}/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: formData.type,
          title: formData.title,
          confirmation_number: formData.confirmation_number || null,
          provider: formData.provider || null,
          start_date: formData.start_date,
          end_date: formData.end_date || null,
          location: formData.location || null,
          price: formData.price ? Number.parseFloat(formData.price) : null,
          currency: formData.currency,
          status: formData.status,
          notes: formData.notes || null,
        }),
      })

      type RespostaErro = {
        error?: string
        detalhes?: { fieldErrors?: Record<string, string[] | undefined> }
      }
      const dados: RespostaErro = await resposta.json().catch(() => ({}))
      if (!resposta.ok) {
        const especifico = Object.values(dados.detalhes?.fieldErrors ?? {}).find(
          (m) => m && m.length > 0,
        )?.[0]
        throw new Error(especifico || dados.error || "Erro ao editar reserva")
      }

      toast({ title: "Reserva atualizada", description: "As alterações foram salvas." })
      router.push(`/dashboard/trips/${id}?aba=reservas`)
      router.refresh()
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Erro ao editar reserva"
      toast({ title: "Erro", description: mensagem, variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  if (isFetching) {
    return <p className="text-gray-600">Carregando...</p>
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" asChild className="mb-4">
          <Link href={`/dashboard/trips/${id}?aba=reservas`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <h1 className="text-3xl font-bold text-slate-900">Editar Reserva</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalhes da Reserva</CardTitle>
          <CardDescription>Atualize as informações da reserva</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo *</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, type: value }))}
                >
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flight">Voo</SelectItem>
                    <SelectItem value="hotel">Hotel</SelectItem>
                    <SelectItem value="car">Carro</SelectItem>
                    <SelectItem value="activity">Atividade</SelectItem>
                    <SelectItem value="other">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
                >
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pendente</SelectItem>
                    <SelectItem value="confirmed">Confirmado</SelectItem>
                    <SelectItem value="cancelled">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input id="title" name="title" required value={formData.title} onChange={handleInputChange} />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="provider">Provedor</Label>
                <Input id="provider" name="provider" value={formData.provider} onChange={handleInputChange} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmation_number">Número de Confirmação</Label>
                <Input
                  id="confirmation_number"
                  name="confirmation_number"
                  value={formData.confirmation_number}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start_date">Data de Início *</Label>
                <Input
                  id="start_date"
                  name="start_date"
                  type="datetime-local"
                  required
                  value={formData.start_date}
                  onChange={handleInputChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date">Data de Término</Label>
                <Input
                  id="end_date"
                  name="end_date"
                  type="datetime-local"
                  value={formData.end_date}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Local</Label>
              <Input id="location" name="location" value={formData.location} onChange={handleInputChange} />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price">Preço</Label>
                <Input
                  id="price"
                  name="price"
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.price}
                  onChange={handleInputChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Moeda</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, currency: value }))}
                >
                  <SelectTrigger id="currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BRL">BRL - Real Brasileiro</SelectItem>
                    <SelectItem value="USD">USD - Dólar Americano</SelectItem>
                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                    <SelectItem value="GBP">GBP - Libra Esterlina</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea id="notes" name="notes" rows={3} value={formData.notes} onChange={handleInputChange} />
            </div>

            <div className="flex flex-wrap gap-4">
              <Button type="submit" disabled={isLoading} className="bg-viaja-orange">
                {isLoading ? "Salvando..." : "Salvar alterações"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/dashboard/trips/${id}?aba=reservas`}>Cancelar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
