import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exigirMembro, type PapelNaViagem } from "@/lib/authz/trip"
import { naoAutenticado, naoEncontrado, respostaDeErro, respostaInvalida, semPermissao, ErroHttp } from "@/lib/http"
import { atualizarDespesaSchema } from "@/lib/schemas/despesa"

/**
 * Uma despesa. Segue o molde de `app/api/trips/[tripId]/bookings/[bookingId]/route.ts`.
 *
 * Diferença: lá qualquer membro edita qualquer reserva. Aqui não — despesa é
 * dinheiro de alguém específico, então `exigirMembro` garante só a participação
 * na viagem e `exigirAutorOuDono` garante que quem altera é quem registrou o
 * gasto, ou o dono da viagem corrigindo em nome do grupo.
 *
 * Toda consulta filtra por `trip_id` **e** `id`: sem o primeiro, um membro da
 * viagem X alteraria despesa da viagem Y só trocando o `expenseId` na URL.
 *
 * @RF06.2 editar despesa · @RF06.3 excluir despesa
 */

type Contexto = { params: Promise<{ tripId: string; expenseId: string }> }
type Despesa = { user_id: string } & Record<string, unknown>

async function usuarioAtual(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

async function buscarDespesa(
  supabase: Awaited<ReturnType<typeof createClient>>,
  tripId: string,
  expenseId: string,
): Promise<Despesa> {
  const { data: despesa, error } = await supabase
    .from("expenses")
    .select("*")
    .eq("trip_id", tripId)
    .eq("id", expenseId)
    .maybeSingle()

  if (error) throw new ErroHttp(400, "Não foi possível carregar a despesa")
  if (!despesa) throw naoEncontrado("Despesa")
  return despesa as Despesa
}

/** Só quem registrou a despesa, ou o dono da viagem, pode alterá-la. */
function exigirAutorOuDono(despesa: Despesa, userId: string, papel: PapelNaViagem) {
  if (despesa.user_id === userId || papel === "owner") return
  throw semPermissao("esta despesa, restrita a quem a registrou ou ao dono da viagem")
}

export async function GET(_request: Request, { params }: Contexto) {
  const { tripId, expenseId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    const papel = await exigirMembro(supabase, tripId, user.id)

    const despesa = await buscarDespesa(supabase, tripId, expenseId)
    exigirAutorOuDono(despesa, user.id, papel)

    return NextResponse.json({ expense: despesa })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function PATCH(request: Request, { params }: Contexto) {
  const { tripId, expenseId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    const papel = await exigirMembro(supabase, tripId, user.id)

    const despesa = await buscarDespesa(supabase, tripId, expenseId)
    exigirAutorOuDono(despesa, user.id, papel)

    const analise = atualizarDespesaSchema.safeParse(await request.json())
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    // Campo a campo. `id`, `trip_id` e `user_id` não estão no schema: a despesa
    // não muda de viagem nem de autor.
    const { title, amount, currency, category, date, payment_method, notes } = analise.data

    const { data: atualizada, error } = await supabase
      .from("expenses")
      .update({ title, amount, currency, category, date, payment_method, notes })
      .eq("trip_id", tripId)
      .eq("id", expenseId)
      .select()
      .maybeSingle()

    if (error) throw new ErroHttp(400, "Não foi possível salvar a despesa")
    if (!atualizada) throw naoEncontrado("Despesa")
    return NextResponse.json({ expense: atualizada })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function DELETE(_request: Request, { params }: Contexto) {
  const { tripId, expenseId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    const papel = await exigirMembro(supabase, tripId, user.id)

    const despesa = await buscarDespesa(supabase, tripId, expenseId)
    exigirAutorOuDono(despesa, user.id, papel)

    // `.select()` devolve as linhas apagadas: vazio significa que a despesa não
    // é desta viagem (ou não existe), e a resposta precisa dizer isso.
    const { data: apagadas, error } = await supabase
      .from("expenses")
      .delete()
      .eq("trip_id", tripId)
      .eq("id", expenseId)
      .select("id")

    if (error) throw new ErroHttp(400, "Não foi possível excluir a despesa")
    if (!apagadas || apagadas.length === 0) throw naoEncontrado("Despesa")
    return NextResponse.json({ success: true })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
