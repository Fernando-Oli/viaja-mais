import type { createClient } from "@/lib/supabase/server"
import { ErroHttp } from "@/lib/http"
import {
  montarAcerto,
  type Acerto,
  type DespesaLida,
  type MembroLido,
  type PagamentoLido,
  type ParteLida,
} from "@/lib/finance/acerto"

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Lê tudo o que o acerto de uma viagem precisa e monta o acerto.
 *
 * Usada pelo `GET` (que exibe) e pelo `POST` de transferência (que valida o
 * pagamento contra o saldo atual): as duas rotas precisam ver exatamente o
 * mesmo saldo, então leem do mesmo jeito. Não é arquivo de rota — o Next só
 * expõe `route.ts`.
 *
 * Quem chama já autenticou e já passou por `exigirMembro()`. As leituras são
 * com o cliente da sessão, sob RLS, escopadas pela viagem da URL.
 *
 * @RF06.11 saldo por membro · @RF06.13 transferências sugeridas e pagamentos registrados
 */
export async function carregarAcerto(supabase: Supabase, tripId: string, usuarioAtualId: string): Promise<Acerto> {
  const [despesas, partes, membros, pagamentos] = await Promise.all([
    supabase.from("expenses").select("id, paid_by, currency").eq("trip_id", tripId),
    supabase
      .from("expense_shares")
      .select("expense_id, user_id, amount, settled_at, expenses!inner(trip_id)")
      .eq("expenses.trip_id", tripId),
    supabase.from("trip_members").select("user_id, role").eq("trip_id", tripId),
    supabase.from("settlements").select("from_user_id, to_user_id, amount, currency").eq("trip_id", tripId),
  ])

  // Mensagem genérica: a do Postgres pode revelar coluna/constraint.
  if (despesas.error || partes.error || membros.error || pagamentos.error) {
    throw new ErroHttp(500, "Não foi possível carregar o acerto de contas")
  }

  return montarAcerto({
    despesas: (despesas.data ?? []) as DespesaLida[],
    partes: (partes.data ?? []) as unknown as ParteLida[],
    membros: (membros.data ?? []) as MembroLido[],
    pagamentos: (pagamentos.data ?? []) as PagamentoLido[],
    usuarioAtualId,
  })
}
