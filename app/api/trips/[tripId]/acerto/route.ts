import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { exigirMembro } from "@/lib/authz/trip"
import { naoAutenticado, respostaDeErro, respostaInvalida, ErroHttp } from "@/lib/http"
import { montarAcerto, type DespesaLida, type MembroLido, type ParteLida } from "@/lib/finance/acerto"

/**
 * Acerto de contas de uma viagem: saldo por membro e transferências sugeridas.
 *
 * Só leitura. Segue o molde de `app/api/trips/[tripId]/expenses/route.ts`:
 *
 *   1. `tripId` validado com zod — id malformado é 400, antes de qualquer consulta.
 *   2. `getUser()`      — valida o token no servidor de auth; sem sessão, 401.
 *   3. `exigirMembro`   — saldo é dado da viagem; quem não participa recebe 403.
 *   4. cliente da sessão, sob RLS — `expenses_select` e `expense_shares_select`
 *                         são a segunda linha de defesa. Sem service role.
 *   5. a conta é de `lib/finance/` — a rota só lê e entrega.
 *
 * As partes vêm todas, inclusive as quitadas: `montarAcerto()` descarta as que
 * têm `settled_at` e usa as quitadas só para saber que a despesa foi rateada.
 *
 * @RF06.11 visualizar o saldo por membro (quem deve a quem)
 * @RF06.13 sugerir transferências para acerto de contas
 */

const tripIdSchema = z.string().uuid()

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw naoAutenticado()

    if (!tripIdSchema.safeParse(tripId).success) {
      return respostaInvalida({ tripId: ["identificador de viagem inválido"] })
    }

    await exigirMembro(supabase, tripId, user.id)

    const [despesas, partes, membros] = await Promise.all([
      supabase.from("expenses").select("id, paid_by, currency").eq("trip_id", tripId),
      supabase
        .from("expense_shares")
        .select("expense_id, user_id, amount, settled_at, expenses!inner(trip_id)")
        .eq("expenses.trip_id", tripId),
      supabase.from("trip_members").select("user_id, role").eq("trip_id", tripId),
    ])

    // Mensagem genérica: a do Postgres pode revelar coluna/constraint.
    if (despesas.error || partes.error || membros.error) {
      throw new ErroHttp(500, "Não foi possível carregar o acerto de contas")
    }

    const acerto = montarAcerto({
      despesas: (despesas.data ?? []) as DespesaLida[],
      partes: (partes.data ?? []) as unknown as ParteLida[],
      membros: (membros.data ?? []) as MembroLido[],
      usuarioAtualId: user.id,
    })

    return NextResponse.json(acerto)
  } catch (erro) {
    if (erro instanceof ErroHttp && erro.status >= 500) {
      return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
    return respostaDeErro(erro)
  }
}
