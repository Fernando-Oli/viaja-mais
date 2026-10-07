"use client"

import type React from "react"

import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { use, useEffect, useState } from "react"

export default function EditExpensePage({ params }: { params: Promise<{ id: string; expenseId: string }> }) {
  const { id, expenseId } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(false)
  const [isFetching, setIsFetching] = useState(true)

  const [formData, setFormData] = useState({
    title: "",
    amount: "",
    currency: "BRL",
    category: "food",
    date: "",
    payment_method: "",
    notes: "",
  })

  useEffect(() => {
    async function carregar() {
      const resposta = await fetch(`/api/trips/${id}/expenses/${expenseId}`)
      if (!resposta.ok) {
        const dados: { error?: string } = await resposta.json().catch(() => ({}))
        toast({
          title: "Erro",
          description: dados.error || "Não foi possível carregar a despesa",
          variant: "destructive",
        })
        router.push(`/dashboard/trips/${id}?aba=despesas`)
        return
      }
      const { expense } = await resposta.json()
      setFormData({
        title: expense.title,
        amount: String(expense.amount),
        currency: expense.currency ?? "BRL",
        category: expense.category,
        date: expense.date,
        payment_method: expense.payment_method ?? "",
        notes: expense.notes ?? "",
      })
      setIsFetching(false)
    }
    carregar()
  }, [id, expenseId, router, toast])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const resposta = await fetch(`/api/trips/${id}/expenses/${expenseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          amount: formData.amount,
          currency: formData.currency,
          category: formData.category,
          date: formData.date,
          payment_method: formData.payment_method || null,
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
        throw new Error(especifico || dados.error || "Erro ao editar despesa")
      }

      toast({ title: "Despesa atualizada", description: "As alterações foram salvas." })
      router.push(`/dashboard/trips/${id}?aba=despesas`)
      router.refresh()
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Erro ao editar despesa"
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
          <Link href={`/dashboard/trips/${id}?aba=despesas`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Link>
        </Button>
        <h1 className="text-3xl font-bold text-slate-900">Editar Despesa</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detalhes da Despesa</CardTitle>
          <CardDescription>Atualize as informações do gasto</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="title">Descrição *</Label>
              <Input id="title" name="title" required value={formData.title} onChange={handleInputChange} />
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="amount">Valor *</Label>
                <Input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                  value={formData.amount}
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

              <div className="space-y-2">
                <Label htmlFor="category">Categoria *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, category: value }))}
                >
                  <SelectTrigger id="category">
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
                  name="date"
                  type="date"
                  required
                  value={formData.date}
                  onChange={handleInputChange}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_method">Método de Pagamento</Label>
              <Input
                id="payment_method"
                name="payment_method"
                value={formData.payment_method}
                onChange={handleInputChange}
              />
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
                <Link href={`/dashboard/trips/${id}?aba=despesas`}>Cancelar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
