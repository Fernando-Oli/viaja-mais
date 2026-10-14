import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exigirMembro, papelNaViagem, type ClienteConsulta } from "@/lib/authz/trip"
import { naoAutenticado, respostaDeErro, respostaInvalida, ErroHttp } from "@/lib/http"
import { criarDespesaSchema, type Rateio } from "@/lib/schemas/despesa"
import { calcularRateio, centavosParaReais, ErroRateio, type Parte } from "@/lib/finance/rateio"

/**
 * Despesas de uma viagem.
 *
 * Segue o molde de `app/api/trips/[tripId]/route.ts`. Cinco coisas não são
 * opcionais aqui:
 *
 *   1. `await params`     — nesta versão do Next, params é uma Promise.
 *   2. `getUser()`        — valida o token no servidor de auth.
 *   3. `exigirMembro`     — despesa é dado de viagem compartilhada: quem não
 *                           participa não lê nem escreve. Estar autenticado não
 *                           basta. A tela antiga escrevia direto do navegador,
 *                           apoiada só na RLS.
 *   4. validação com zod  — campos extraídos um a um. `.insert({ ...body })`
 *                           deixava o cliente injetar `user_id` e roubar o registro.
 *   5. `respostaDeErro`   — status certo para erro conhecido, 500 genérico para o
 *                           resto, sem vazar a mensagem crua do Postgres.
 * @RF06.1 adicionar despesa · @RF04.6 membros podem adicionar despesas
 * @RF06.9 tipo de rateio · @RF06.10 valor devido por membro (`expense_shares`)
 */

async function usuarioAtual(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

export async function GET(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    await exigirMembro(supabase, tripId, user.id)

    const { data: expenses, error } = await supabase
      .from("expenses")
      .select("*")
      .eq("trip_id", tripId)
      .order("date", { ascending: false })

    // Mensagem genérica: a do Postgres pode revelar coluna/constraint.
    if (error) throw new ErroHttp(400, "Não foi possível carregar as despesas")
    return NextResponse.json({ expenses })
  } catch (erro) {
    // `respostaDeErro` preserva a mensagem de `ErroHttp`; para 5xx, responda sempre genérico.
    if (erro instanceof ErroHttp && erro.status >= 500) {
      return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
    }
    return respostaDeErro(erro)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    await exigirMembro(supabase, tripId, user.id)

    const analise = criarDespesaSchema.safeParse(await request.json())
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    // Campo a campo. `id`, `trip_id` e `user_id` não estão no schema e por isso
    // não têm como chegar aqui — `trip_id` vem da URL, `user_id` da sessão.
    const { title, amount, currency, category, date, payment_method, notes, rateio } = analise.data

    // O total é levado a centavos uma vez só, e é esse inteiro que vai para o
    // banco e para o rateio. Gravar `amount` cru e ratear o arredondado deixaria
    // o NUMERIC(10,2) arredondar por conta própria — e a soma deixaria de fechar.
    const totalCentavos = Math.round(amount * 100)

    // O rateio é validado e calculado ANTES de qualquer escrita: rateio inválido
    // não pode deixar uma despesa gravada pela metade.
    const partes = rateio ? await calcularPartes(supabase, tripId, totalCentavos, rateio) : null

    const { data: expense, error } = await supabase
      .from("expenses")
      .insert({
        title,
        amount: centavosParaReais(totalCentavos),
        currency,
        category,
        date,
        payment_method: payment_method ?? null,
        notes: notes ?? null,
        ...(rateio ? { split_type: rateio.tipo } : {}),
        trip_id: tripId,
        user_id: user.id,
      })
      .select()
      .single()

    // Mensagem genérica: a do Postgres pode revelar coluna/constraint.
    if (error || !expense) throw new ErroHttp(400, "Não foi possível salvar a despesa")

    if (!partes) return NextResponse.json({ expense })

    // Um único insert = uma transação. A constraint trigger
    // `expense_shares_soma_fecha` é adiada para o commit e confere a soma de
    // todas as partes de uma vez (RNF-08.1).
    const { data: shares, error: erroPartes } = await supabase
      .from("expense_shares")
      .insert(
        partes.map((p) => ({
          expense_id: expense.id,
          user_id: p.userId,
          amount: centavosParaReais(p.centavos),
          weight: p.peso,
        })),
      )
      .select("user_id, amount, weight")

    if (erroPartes) {
      // Sem transação entre as duas chamadas, desfaz à mão: uma despesa sem as
      // partes que o usuário escolheu seria um lançamento diferente do pedido.
      // `expenses_delete` permite: quem acabou de criar é o `user_id` da linha.
      await supabase.from("expenses").delete().eq("id", expense.id)
      throw new ErroHttp(400, "Não foi possível salvar o rateio da despesa")
    }

    return NextResponse.json({ expense, shares })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

/**
 * Confere que todo participante é membro da viagem e recalcula as partes.
 *
 * A RLS de `expense_shares` só pergunta se **quem grava** participa da viagem —
 * não se a pessoa a quem a parte é atribuída participa. Sem esta checagem, um
 * membro poderia lançar dívida em nome de qualquer conta do sistema.
 */
async function calcularPartes(
  supabase: ClienteConsulta,
  tripId: string,
  totalCentavos: number,
  rateio: Rateio,
): Promise<Parte[]> {
  const papeis = await Promise.all(
    rateio.participantes.map((p) => papelNaViagem(supabase, tripId, p.user_id)),
  )
  if (papeis.some((papel) => papel === null)) {
    throw new ErroHttp(400, "Todo participante do rateio precisa ser membro da viagem")
  }

  try {
    return calcularRateio(totalCentavos, rateio)
  } catch (erro) {
    if (erro instanceof ErroRateio) throw new ErroHttp(400, erro.message)
    throw erro
  }
}
