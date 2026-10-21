import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exigirMembro, type PapelNaViagem } from "@/lib/authz/trip"
import { naoAutenticado, naoEncontrado, respostaDeErro, respostaInvalida, semPermissao, ErroHttp } from "@/lib/http"
import { atualizarDespesaSchema } from "@/lib/schemas/despesa"
import { calcularRateio, centavosParaReais, ErroRateio, type Parte } from "@/lib/finance/rateio"

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

type Supabase = Awaited<ReturnType<typeof createClient>>
type ParteGravada = { user_id: string; weight: number | null; settled_at: string | null }

/**
 * Partes recalculadas para o novo total, com os mesmos participantes e pesos.
 * Nada é gravado aqui: rateio que não pode ser refeito tem de falhar antes de a
 * despesa mudar.
 *
 * A constraint trigger `expense_shares_soma_fecha` só dispara quando as partes
 * mudam, não quando `expenses.amount` muda — por isso a rota refaz as partes
 * junto com o valor, em vez de deixar a soma descolar do total.
 *
 * @RF06.2 editar despesa · @RNF08.1 a soma das partes iguala o valor da despesa
 */
async function partesParaNovoTotal(
  supabase: Supabase,
  despesa: Despesa,
  expenseId: string,
  totalCentavos: number,
): Promise<Parte[] | null> {
  const { data, error } = await supabase
    .from("expense_shares")
    .select("user_id, weight, settled_at")
    .eq("expense_id", expenseId)
    .order("user_id")

  if (error) throw new ErroHttp(400, "Não foi possível carregar o rateio da despesa")
  const partes = (data ?? []) as ParteGravada[]
  if (partes.length === 0) return null

  if (partes.some((p) => p.settled_at)) {
    throw new ErroHttp(409, "Parte desta despesa já foi quitada: o valor não pode mais mudar")
  }

  try {
    if (despesa.split_type === "weight") {
      return calcularRateio(totalCentavos, {
        tipo: "weight",
        participantes: partes.map((p) => ({ user_id: p.user_id, peso: Number(p.weight) })),
      })
    }
    if (despesa.split_type === "equal") {
      return calcularRateio(totalCentavos, {
        tipo: "equal",
        participantes: partes.map((p) => ({ user_id: p.user_id })),
      })
    }
  } catch (erro) {
    if (erro instanceof ErroRateio) throw new ErroHttp(400, erro.message)
    throw erro
  }

  // Valor exato: não há como adivinhar quanto cabe a cada um no total novo.
  throw new ErroHttp(409, "O rateio desta despesa é por valor exato: exclua e lance de novo com o valor certo")
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

    const totalCentavos = amount === undefined ? undefined : Math.round(amount * 100)
    const mudouValor = totalCentavos !== undefined && totalCentavos !== Math.round(Number(despesa.amount) * 100)
    const partes = mudouValor ? await partesParaNovoTotal(supabase, despesa, expenseId, totalCentavos) : null

    const { data: atualizada, error } = await supabase
      .from("expenses")
      .update({
        title,
        amount: totalCentavos === undefined ? undefined : centavosParaReais(totalCentavos),
        currency,
        category,
        date,
        payment_method,
        notes,
      })
      .eq("trip_id", tripId)
      .eq("id", expenseId)
      .select()
      .maybeSingle()

    if (error) throw new ErroHttp(400, "Não foi possível salvar a despesa")
    if (!atualizada) throw naoEncontrado("Despesa")
    if (!partes) return NextResponse.json({ expense: atualizada })

    // Um único upsert = uma transação: a trigger confere a soma das partes
    // contra o valor novo no commit.
    const { error: erroPartes } = await supabase.from("expense_shares").upsert(
      partes.map((p) => ({
        expense_id: expenseId,
        user_id: p.userId,
        amount: centavosParaReais(p.centavos),
        weight: p.peso,
      })),
      { onConflict: "expense_id,user_id" },
    )

    if (erroPartes) {
      // Sem transação entre as duas chamadas: devolve o valor antigo, para as
      // partes antigas continuarem fechando com o total.
      await supabase.from("expenses").update({ amount: despesa.amount }).eq("trip_id", tripId).eq("id", expenseId)
      throw new ErroHttp(400, "Não foi possível recalcular o rateio da despesa")
    }

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
