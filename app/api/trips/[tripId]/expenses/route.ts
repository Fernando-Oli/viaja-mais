import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exigirMembro } from "@/lib/authz/trip"
import { naoAutenticado, respostaDeErro, respostaInvalida, ErroHttp } from "@/lib/http"
import { criarDespesaSchema } from "@/lib/schemas/despesa"

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
    const { title, amount, currency, category, date, payment_method, notes } = analise.data

    const { data: expense, error } = await supabase
      .from("expenses")
      .insert({
        title,
        amount,
        currency,
        category,
        date,
        payment_method: payment_method ?? null,
        notes: notes ?? null,
        trip_id: tripId,
        user_id: user.id,
      })
      .select()
      .single()

    // Mensagem genérica: a do Postgres pode revelar coluna/constraint.
    if (error) throw new ErroHttp(400, "Não foi possível salvar a despesa")
    return NextResponse.json({ expense })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
