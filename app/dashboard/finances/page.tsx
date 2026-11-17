import { lerDaApi } from "@/lib/api-servidor"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DollarSign, TrendingUp, TrendingDown, PieChart } from "lucide-react"

/** Formato de `GET /api/trips`: viagens de que o usuário participa. */
type ViagemDoPainel = {
  id: string
  title: string
  destination: string
  status: string | null
  budget: number | null
  currency: string | null
}

/** Formato de `GET /api/expenses`, com a viagem junto, em `trips`. */
type DespesaDoPainel = {
  id: string
  trip_id: string
  title: string
  amount: number
  currency: string | null
  category: string
  date: string
  trips: { title: string; currency: string | null }
}

export default async function FinancesPage() {
  // A despesa do grupo é do grupo: a API devolve as despesas de todas as
  // viagens de que a pessoa participa, de qualquer autor. Filtrar por `user_id`
  // mostrava ao convidado só o que ele mesmo lançou, e o total saía errado.
  const [{ trips }, { expenses: allExpenses }] = await Promise.all([
    lerDaApi<{ trips: ViagemDoPainel[] }>("/api/trips"),
    lerDaApi<{ expenses: DespesaDoPainel[] }>("/api/expenses"),
  ])

  // Somatórios por moeda, a da viagem.
  const totalsByCurrency = allExpenses.reduce<Record<string, number>>((acc, expense) => {
    const currency = expense.trips?.currency || "BRL"
    acc[currency] = (acc[currency] ?? 0) + Number(expense.amount)
    return acc
  }, {})

  const byCategory = allExpenses.reduce<Record<string, number>>((acc, expense) => {
    acc[expense.category] = (acc[expense.category] ?? 0) + Number(expense.amount)
    return acc
  }, {})

  const categoryLabels: Record<string, string> = {
    accommodation: "Hospedagem",
    transport: "Transporte",
    food: "Alimentação",
    activities: "Atividades",
    shopping: "Compras",
    other: "Outros",
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground">Controle Financeiro</h1>
        <p className="mt-2 text-muted-foreground">Acompanhe seus gastos e orçamentos de viagem</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total de Gastos</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {Object.entries(totalsByCurrency).map(([currency, total]) => (
                <div key={currency} className="text-2xl font-semibold">
                  {new Intl.NumberFormat("pt-BR", {
                    style: "currency",
                    currency,
                  }).format(total)}
                </div>
              ))}
              {Object.keys(totalsByCurrency).length === 0 && (
                <div className="text-2xl font-semibold">R$ 0,00</div>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{allExpenses?.length || 0} despesas registradas</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Viagens Ativas</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {trips?.filter((t) => t.status === "confirmed" || t.status === "ongoing").length || 0}
            </div>
            <p className="text-xs text-muted-foreground">com orçamento definido</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Categoria Principal</CardTitle>
            <PieChart className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {Object.keys(byCategory).length > 0
                ? categoryLabels[Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0][0]]
                : "-"}
            </div>
            <p className="text-xs text-muted-foreground">maior gasto</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList>
          <TabsTrigger value="overview">Visão Geral</TabsTrigger>
          <TabsTrigger value="by-trip">Por Viagem</TabsTrigger>
          <TabsTrigger value="by-category">Por Categoria</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Despesas Recentes</CardTitle>
              <CardDescription>Últimas despesas registradas</CardDescription>
            </CardHeader>
            <CardContent>
              {!allExpenses || allExpenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <DollarSign className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold text-foreground">Nenhuma despesa registrada</h3>
                  <p className="text-center text-muted-foreground">Comece a registrar seus gastos de viagem</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {allExpenses.slice(0, 10).map((expense) => (
                    <div
                      key={expense.id}
                      className="flex items-center justify-between border-b border-border pb-4 last:border-0"
                    >
                      <div className="flex-1">
                        <h4 className="font-medium text-foreground">{expense.title}</h4>
                        <p className="text-sm text-muted-foreground">
                          {expense.trips?.title} • {categoryLabels[expense.category]} •{" "}
                          {new Date(expense.date).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">
                          {new Intl.NumberFormat("pt-BR", {
                            style: "currency",
                            currency: expense.currency || "BRL",
                          }).format(Number(expense.amount))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="by-trip" className="mt-6 space-y-4">
          {!trips || trips.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <TrendingDown className="mb-4 h-12 w-12 text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold text-foreground">Nenhuma viagem cadastrada</h3>
                <p className="text-center text-muted-foreground">Crie uma viagem para começar a controlar gastos</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {trips.map((trip) => {
                const tripExpenses = allExpenses?.filter((e) => e.trip_id === trip.id) || []
                const totalSpent = tripExpenses.reduce((sum, e) => sum + Number(e.amount), 0)
                const budget = Number(trip.budget) || 0
                const percentage = budget > 0 ? (totalSpent / budget) * 100 : 0

                return (
                  <Card key={trip.id}>
                    <CardHeader>
                      <CardTitle className="text-lg">{trip.title}</CardTitle>
                      <CardDescription>{trip.destination}</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Gasto</span>
                          <span className="font-semibold text-foreground">
                            {new Intl.NumberFormat("pt-BR", {
                              style: "currency",
                              currency: trip.currency || "BRL",
                            }).format(totalSpent)}
                          </span>
                        </div>
                        {budget > 0 && (
                          <>
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-muted-foreground">Orçamento</span>
                              <span className="font-semibold text-foreground">
                                {new Intl.NumberFormat("pt-BR", {
                                  style: "currency",
                                  currency: trip.currency || "BRL",
                                }).format(budget)}
                              </span>
                            </div>
                            <div>
                              <div className="mb-2 flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">Utilizado</span>
                                <span
                                  className={`font-medium ${percentage > 100 ? "text-destructive" : percentage > 80 ? "text-foreground" : "text-primary"}`}
                                >
                                  {percentage.toFixed(1)}%
                                </span>
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full transition-all ${percentage > 100 ? "bg-destructive/100" : percentage > 80 ? "bg-citrico" : "bg-primary"}`}
                                  style={{ width: `${Math.min(percentage, 100)}%` }}
                                />
                              </div>
                            </div>
                          </>
                        )}
                        <div className="pt-2 text-sm text-muted-foreground">{tripExpenses.length} despesas</div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="by-category" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Gastos por Categoria</CardTitle>
              <CardDescription>Distribuição dos seus gastos</CardDescription>
            </CardHeader>
            <CardContent>
              {!byCategory || Object.keys(byCategory).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12">
                  <PieChart className="mb-4 h-12 w-12 text-muted-foreground" />
                  <h3 className="mb-2 text-lg font-semibold text-foreground">Nenhuma despesa por categoria</h3>
                  <p className="text-center text-muted-foreground">Registre despesas para ver a distribuição</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {Object.entries(byCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, amount]) => {
                      const total = Object.values(byCategory).reduce((sum, val) => sum + val, 0)
                      const percentage = (amount / total) * 100

                      return (
                        <div key={category} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">{categoryLabels[category]}</span>
                            <span className="text-sm text-muted-foreground">{percentage.toFixed(1)}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                            <div className="h-full bg-primary transition-all" style={{ width: `${percentage}%` }} />
                          </div>
                          <div className="text-right text-sm font-semibold text-foreground">R$ {amount.toFixed(2)}</div>
                        </div>
                      )
                    })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
