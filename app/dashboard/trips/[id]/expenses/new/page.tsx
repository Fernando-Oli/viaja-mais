"use client"

import type React from "react"

import { useEffect, useMemo, useState, use } from "react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import { ExpenseSplit, type MembroRateio } from "@/components/expense-split"
import { useAuth } from "@/context/auth-context"
import { avaliarRateio, type ParticipanteFormulario, type TipoRateio } from "@/lib/finance/rateio"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

type EstadoMembros = "carregando" | "erro" | "pronto"

interface MembroApi {
  user_id: string
  role: string
}

async function buscarMembros(tripId: string): Promise<MembroApi[]> {
  const resposta = await fetch(`/api/trips/${tripId}`)
  const dados: { trip?: { trip_members?: MembroApi[] } } = await resposta.json().catch(() => ({}))
  if (!resposta.ok || !dados.trip?.trip_members?.length) throw new Error("Falha ao carregar os participantes")
  return dados.trip.trip_members
}

/**
 * Participantes na ordem em que aparecem: quem está lançando primeiro, depois o
 * dono, depois os demais. Ordem estável, para a prévia não pular de lugar.
 *
 * Os nomes dos outros membros não são legíveis daqui: a policy de `profiles`
 * só libera o próprio perfil. Por isso o rótulo é "Você" / "Participante N".
 */
function montarMembros(lista: MembroApi[], meuId: string | undefined): MembroRateio[] {
  const ordenados = [...lista].sort((a, b) => {
    if (a.user_id === meuId) return -1
    if (b.user_id === meuId) return 1
    if (a.role !== b.role) return a.role === "owner" ? -1 : 1
    return a.user_id.localeCompare(b.user_id)
  })
  return ordenados.map((m, i) => ({
    userId: m.user_id,
    rotulo: m.user_id === meuId ? "Você" : `Participante ${i + 1}`,
    papel: m.role === "owner" ? "owner" : "member",
  }))
}

export default function NewExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { toast } = useToast()
  const { user } = useAuth()
  const [isLoading, setIsLoading] = useState(false)

  const [estadoMembros, setEstadoMembros] = useState<EstadoMembros>("carregando")
  const [membrosApi, setMembrosApi] = useState<MembroApi[]>([])
  const [tipoRateio, setTipoRateio] = useState<TipoRateio>("equal")
  const [participantes, setParticipantes] = useState<ParticipanteFormulario[]>([])

  // O rótulo depende do usuário da sessão, que o contexto carrega à parte;
  // derivar aqui evita buscar de novo (e apagar o que foi digitado) quando ele chega.
  const membros = useMemo(() => montarMembros(membrosApi, user?.id), [membrosApi, user?.id])

  // Membros vêm da API da viagem, que já exige participação no servidor.
  // `tentativa` existe para o botão "Tentar novamente" disparar a busca outra vez.
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let ativo = true
    buscarMembros(id).then(
      (lista) => {
        if (!ativo) return
        setMembrosApi(lista)
        setParticipantes(lista.map((m) => ({ userId: m.user_id, selecionado: true, peso: "1", valor: "" })))
        setEstadoMembros("pronto")
      },
      () => {
        if (!ativo) return
        setEstadoMembros("erro")
        toast({
          title: "Erro",
          description: "Não foi possível carregar os participantes da viagem",
          variant: "destructive",
        })
      },
    )
    return () => {
      ativo = false
    }
  }, [id, tentativa, toast])

  function tentarDeNovo() {
    setEstadoMembros("carregando")
    setTentativa((n) => n + 1)
  }

  const [formData, setFormData] = useState({
    title: "",
    amount: "",
    currency: "BRL",
    category: "food",
    date: new Date().toISOString().split("T")[0],
    payment_method: "",
    notes: "",
  })

  // Na ordem exibida: é ela que decide quem recebe o centavo que sobra, e o
  // servidor recebe a mesma ordem — prévia e gravação não podem divergir.
  const participantesOrdenados = useMemo(
    () =>
      membros
        .map((m) => participantes.find((p) => p.userId === m.userId))
        .filter((p): p is ParticipanteFormulario => p !== undefined),
    [membros, participantes],
  )

  const avaliacao = useMemo(
    () => avaliarRateio(formData.amount, tipoRateio, participantesOrdenados, formData.currency),
    [formData.amount, tipoRateio, participantesOrdenados, formData.currency],
  )
  const podeEnviar = estadoMembros === "pronto" && avaliacao.valido && !isLoading

  // Só a intenção vai para a API; as partes em centavos são recalculadas lá.
  function montarRateio() {
    const selecionados = participantesOrdenados.filter((p) => p.selecionado)
    if (tipoRateio === "weight") {
      return { tipo: tipoRateio, participantes: selecionados.map((p) => ({ user_id: p.userId, peso: p.peso })) }
    }
    if (tipoRateio === "exact") {
      return {
        tipo: tipoRateio,
        participantes: selecionados.map((p) => ({ user_id: p.userId, valor: p.valor.trim() || "0" })),
      }
    }
    return { tipo: tipoRateio, participantes: selecionados.map((p) => ({ user_id: p.userId })) }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!podeEnviar) {
      toast({
        title: "Rateio inválido",
        description: avaliacao.erro ?? "Confira a divisão da despesa",
        variant: "destructive",
      })
      return
    }
    setIsLoading(true)

    try {
      // Sem escrita direta do navegador: a criação passa pelo route handler, que
      // valida com zod e confirma no servidor que este usuário participa da viagem.
      const resposta = await fetch(`/api/trips/${id}/expenses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formData.title,
          amount: formData.amount,
          currency: formData.currency,
          category: formData.category,
          date: formData.date,
          payment_method: formData.payment_method || null,
          notes: formData.notes || null,
          rateio: montarRateio(),
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
        throw new Error(especifico || dados.error || "Erro ao criar despesa")
      }

      toast({
        title: "Despesa adicionada",
        description: "O gasto e a divisão foram registrados na viagem.",
      })

      router.push(`/dashboard/trips/${id}?aba=despesas`)
      router.refresh()
    } catch (err: any) {
      toast({
        title: "Erro",
        description: err.message || "Erro ao criar despesa",
        variant: "destructive",
      })
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

            {estadoMembros === "carregando" && (
              <div role="status" className="flex items-center gap-2 rounded-lg border p-4 text-sm text-slate-600">
                <Spinner />
                Carregando participantes...
              </div>
            )}

            {estadoMembros === "erro" && (
              <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                <span className="flex-1">Não foi possível carregar os participantes da viagem.</span>
                <Button type="button" variant="outline" size="sm" onClick={tentarDeNovo}>
                  Tentar novamente
                </Button>
              </div>
            )}

            {estadoMembros === "pronto" && (
              <ExpenseSplit
                membros={membros}
                moeda={formData.currency}
                totalTexto={formData.amount}
                tipo={tipoRateio}
                participantes={participantes}
                avaliacao={avaliacao}
                desabilitado={isLoading}
                onTipoChange={setTipoRateio}
                onParticipantesChange={setParticipantes}
              />
            )}

            <div className="flex flex-wrap gap-4">
              <Button type="submit" disabled={!podeEnviar} className="bg-viaja-orange">
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
