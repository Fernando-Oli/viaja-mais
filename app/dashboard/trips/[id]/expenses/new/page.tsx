"use client"

import type React from "react"

import { useState, use } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default function NewExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    title: "",
    amount: "",
    currency: "BRL",
    category: "food",
    date: new Date().toISOString().split("T")[0],
    payment_method: "",
    notes: "",
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error("Usuário não autenticado")
      }

      const { error } = await supabase.from("expenses").insert([
        {
          trip_id: id,
          user_id: user.id,
          title: formData.title,
          amount: Number.parseFloat(formData.amount),
          currency: formData.currency,
          category: formData.category,
          date: formData.date,
          payment_method: formData.payment_method || null,
          notes: formData.notes || null,
        },
      ])

      if (error) throw error

      router.push(`/dashboard/trips/${id}?tab=expenses`)
      router.refresh()
    } catch (err: any) {
      setError(err.message || "Erro ao criar despesa")
    } finally {
      setIsLoading(false)
    }
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
        <h1 className="text-3xl font-bold text-slate-900">Nova Despesa</h1>
        <p className="mt-2 text-slate-600">Registre um gasto da sua viagem</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalhes da Despesa</CardTitle>
          <CardDescription>Preencha as informações sobre o gasto</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Descrição *</Label>
              <Input
                id="title"
                placeholder="Ex: Jantar no restaurante"
                required
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amount">Valor *</Label>
                <Input
                  id="amount"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  required
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Moeda</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(value) => setFormData({ ...formData, currency: value })}
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

              <div className="space-y-2">
                <Label htmlFor="category">Categoria *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData({ ...formData, category: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="accommodation">Hospedagem</SelectItem>
                    <SelectItem value="transport">Transporte</SelectItem>
                    <SelectItem value="food">Alimentação</SelectItem>
                    <SelectItem value="activities">Atividades</SelectItem>
                    <SelectItem value="shopping">Compras</SelectItem>
                    <SelectItem value="other">Outros</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="date">Data *</Label>
                <Input
                  id="date"
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_method">Método de Pagamento</Label>
              <Input
                id="payment_method"
                placeholder="Ex: Cartão de crédito, Dinheiro"
                value={formData.payment_method}
                onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                placeholder="Adicione observações sobre esta despesa..."
                rows={3}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              />
            </div>

            {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

            <div className="flex gap-4">
              <Button type="submit" disabled={isLoading} className="bg-viaja-orange">
                {isLoading ? "Salvando..." : "Salvar Despesa"}
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
