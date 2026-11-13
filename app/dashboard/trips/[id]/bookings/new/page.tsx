"use client"

import type React from "react"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function NewBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Sem escrita direta do navegador: passa pelo route handler, que valida com
      // zod, confirma a participação na viagem e tira o autor da sessão.
      const resposta = await fetch(`/api/trips/${id}/bookings`, {
        method: "POST",
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
        throw new Error(especifico || dados.error || "Erro ao criar reserva")
      }

      toast({ title: "Reserva adicionada", description: "A reserva foi incluída na viagem." })
      router.push(`/dashboard/trips/${id}?aba=reservas`)
      router.refresh()
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Erro ao criar reserva"
      toast({ title: "Erro", description: mensagem, variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
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
        <h1 className="text-3xl font-bold text-foreground">Nova Reserva</h1>
        <p className="mt-2 text-muted-foreground">Adicione uma reserva à sua viagem</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalhes da Reserva</CardTitle>
          <CardDescription>Preencha as informações sobre a reserva</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="type">Tipo *</Label>
                <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
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
                <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value })}>
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
              <Input
                id="title"
                placeholder="Ex: Voo São Paulo - Paris"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="provider">Provedor</Label>
                <Input
                  id="provider"
                  placeholder="Ex: LATAM, Booking.com"
                  value={formData.provider}
                  onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmation_number">Número de Confirmação</Label>
                <Input
                  id="confirmation_number"
                  placeholder="Ex: ABC123"
                  value={formData.confirmation_number}
                  onChange={(e) => setFormData({ ...formData, confirmation_number: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="start_date">Data de Início *</Label>
                <Input
                  id="start_date"
                  type="datetime-local"
                  required
                  value={formData.start_date}
                  onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date">Data de Término</Label>
                <Input
                  id="end_date"
                  type="datetime-local"
                  value={formData.end_date}
                  onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="location">Local</Label>
              <Input
                id="location"
                placeholder="Ex: Aeroporto de Guarulhos"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="price">Preço</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Moeda</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
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
              <Textarea
                id="notes"
                placeholder="Adicione observações sobre esta reserva..."
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            <div className="flex flex-wrap gap-4">
              <Button type="submit" disabled={isLoading} className="bg-primary">
                {isLoading ? "Salvando..." : "Salvar Reserva"}
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
