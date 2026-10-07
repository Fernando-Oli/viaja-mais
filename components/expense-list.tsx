"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import ConfirmModal from "@/components/ui/confirm-modal"
import { useToast } from "@/hooks/use-toast"
import { DollarSign, Pencil, Trash2 } from "lucide-react"

interface Expense {
  id: string
  title: string
  amount: number
  currency: string | null
  category: string | null
  date: string
  user_id: string
}

interface ExpenseListProps {
  expenses: Expense[]
  tripId: string
  currentUserId: string
  isOwner: boolean
}

const categoryLabels: Record<string, string> = {
  accommodation: "Hospedagem",
  transport: "Transporte",
  food: "Alimentação",
  activities: "Atividades",
  shopping: "Compras",
  other: "Outros",
}

/**
 * Despesas de uma viagem, com editar e excluir. Toda escrita passa pela rota
 * `/api/trips/[tripId]/expenses/[expenseId]`, que confere a participação na
 * viagem e, além disso, que quem altera é quem registrou o gasto ou o dono da
 * viagem — por isso os botões só aparecem para essas duas pessoas; para as
 * demais o servidor devolveria 403 mesmo que o botão existisse.
 *
 * @RF06.2 editar despesa · @RF06.3 excluir despesa
 */
export function ExpenseList({ expenses, tripId, currentUserId, isOwner }: ExpenseListProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [pendente, setPendente] = useState<string | null>(null)
  const [paraExcluir, setParaExcluir] = useState<Expense | null>(null)

  async function excluir(expense: Expense) {
    setParaExcluir(null)
    setPendente(expense.id)
    try {
      const resposta = await fetch(`/api/trips/${tripId}/expenses/${expense.id}`, { method: "DELETE" })
      if (!resposta.ok) {
        const dados: { error?: string } = await resposta.json().catch(() => ({}))
        throw new Error(dados.error || "Erro ao excluir despesa")
      }
      toast({ title: "Despesa excluída" })
      router.refresh()
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : "Erro ao excluir despesa"
      toast({ title: "Erro", description: mensagem, variant: "destructive" })
    } finally {
      setPendente(null)
    }
  }

  if (expenses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <DollarSign className="mb-4 h-12 w-12 text-gray-300" />
        <h3 className="mb-2 text-lg font-semibold text-viaja-navy">Nenhuma despesa registrada</h3>
        <p className="text-center text-gray-600">Comece a registrar seus gastos</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ConfirmModal
        open={paraExcluir !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setParaExcluir(null)
        }}
        title="Excluir despesa?"
        description={`"${paraExcluir?.title ?? ""}" será removida da viagem. Essa ação é irreversível.`}
        confirmText="Excluir"
        variant="destructive"
        onConfirm={() => paraExcluir && excluir(paraExcluir)}
      />

      {expenses.map((expense) => {
        const podeAlterar = isOwner || expense.user_id === currentUserId
        const ocupado = pendente === expense.id

        return (
          <div
            key={expense.id}
            className="flex flex-col gap-3 border-b border-gray-200 pb-4 last:border-0 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <h4 className="font-medium text-viaja-navy">{expense.title}</h4>
              <p className="text-sm text-gray-600">
                {categoryLabels[expense.category ?? "other"] ?? expense.category} •{" "}
                {new Date(`${expense.date}T00:00`).toLocaleDateString("pt-BR")}
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 sm:justify-end">
              <p className="font-semibold text-viaja-navy">
                {new Intl.NumberFormat("pt-BR", {
                  style: "currency",
                  currency: expense.currency || "BRL",
                }).format(Number(expense.amount))}
              </p>

              {podeAlterar && (
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/dashboard/trips/${tripId}/expenses/${expense.id}/edit`}>
                      <Pencil className="mr-1 h-4 w-4" />
                      Editar
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ocupado}
                    onClick={() => setParaExcluir(expense)}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Excluir
                  </Button>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
