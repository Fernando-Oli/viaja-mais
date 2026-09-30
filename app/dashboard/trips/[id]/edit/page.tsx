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

export default function EditTripPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)

  const [formData, setFormData] = useState({
    title: "",
    destination: "",
    start_date: "",
    end_date: "",
    description: "",
    budget: 0,
    currency: "BRL",
    status: "planning",
  })

  useEffect(() => {
    async function carregar() {
      const resposta = await fetch(`/api/trips/${id}`)
      if (!resposta.ok) {
        toast({ title: "Erro", description: "Não foi possível carregar a viagem", variant: "destructive" })
        router.push("/dashboard/trips")
        return
      }
      const { trip } = await resposta.json()
      setFormData({
        title: trip.title,
        destination: trip.destination,
        start_date: trip.start_date,
        end_date: trip.end_date,
        description: trip.description ?? "",
        budget: trip.budget ?? 0,
        currency: trip.currency ?? "BRL",
        status: trip.status,
      })
      setIsFetching(false)
    }
    carregar()
  }, [id, router, toast])

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      // Sem escrita direta do navegador: passa pelo route handler, que valida
      // com zod e confirma no servidor que este usuário é o dono da viagem.
      const resposta = await fetch(`/api/trips/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
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
        throw new Error(especifico || dados.error || "Erro ao editar viagem")
      }

      toast({ title: "Viagem atualizada", description: "As alterações foram salvas." })
      router.push(`/dashboard/trips/${id}`)
      router.refresh()
    } catch (err: any) {
      toast({ title: "Erro", description: err.message || "Erro ao editar viagem", variant: "destructive" })
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
          <Link href={`/dashboard/trips/${id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <h1 className="text-3xl font-bold text-slate-900">Editar Viagem</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações da Viagem</CardTitle>
          <CardDescription>Atualize os detalhes da sua viagem</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="title">Título da Viagem *</Label>
                <Input id="title" name="title" required value={formData.title} onChange={handleInputChange} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination">Destino *</Label>
                <Input
                  id="destination"
                  name="destination"
                  required
                  value={formData.destination}
                  onChange={handleInputChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="start_date">Data de Início *</Label>
                <Input
                  id="start_date"
                  type="date"
                  name="start_date"
                  required
                  value={formData.start_date}
                  onChange={handleInputChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="end_date">Data de Término *</Label>
                <Input
                  id="end_date"
                  type="date"
                  name="end_date"
                  required
                  value={formData.end_date}
                  onChange={handleInputChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="budget">Orçamento</Label>
                <Input
                  id="budget"
                  type="number"
                  name="budget"
                  value={formData.budget}
                  onChange={handleInputChange}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Moeda</Label>
                <Select
                  value={formData.currency}
                  name="currency"
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, currency: value }))}
                >
                  <SelectTrigger>
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
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                name="description"
                rows={4}
                value={formData.description}
                onChange={handleInputChange}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                name="status"
                value={formData.status}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planejando</SelectItem>
                  <SelectItem value="confirmed">Confirmada</SelectItem>
                  <SelectItem value="ongoing">Em andamento</SelectItem>
                  <SelectItem value="completed">Concluída</SelectItem>
                  <SelectItem value="cancelled">Cancelada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-4">
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Salvando..." : "Salvar alterações"}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href={`/dashboard/trips/${id}`}>Cancelar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
