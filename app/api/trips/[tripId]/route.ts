import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exigirDono, exigirMembro } from "@/lib/authz/trip"
import { naoAutenticado, respostaDeErro, respostaInvalida, ErroHttp } from "@/lib/http"
import { atualizarViagemSchema } from "@/lib/schemas/viagem"

/**
 * ROTA DE REFERÊNCIA — este arquivo é o molde de todo route handler do projeto.
 *
 * Cinco coisas se repetem em toda rota e nenhuma é opcional:
 *
 *   1. `await params`      — nesta versão do Next, params é uma Promise.
 *   2. `getUser()`         — valida o token no servidor de auth. `getSession()`
 *                            só decodifica o cookie e não serve para decidir acesso.
 *   3. autorização         — `exigirMembro` / `exigirDono`. Estar autenticado não
 *                            é estar autorizado: o furo original aqui era permitir
 *                            que qualquer usuário logado editasse viagem alheia.
 *   4. validação com zod   — e os campos extraídos **um a um** do resultado.
 *                            `.update(body)` deixa o cliente reescrever `user_id`.
 *   5. `respostaDeErro`    — status certo para erro conhecido, 500 genérico para o
 *                            resto, sem vazar a mensagem crua do Postgres.
 *
 * Os quatro testes que toda rota precisa ter: 200 feliz, 401 sem sessão,
 * 403 para quem não participa, 400 para payload inválido.
 *
 * @RF03.2 visualizar viagem · @RF03.4 editar viagem · @RF03.5 excluir viagem
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

    const { data: trip, error } = await supabase
      .from("trips")
      .select("*, trip_members(user_id, role)")
      .eq("id", tripId)
      .single()

    if (error) throw new ErroHttp(404, "Viagem não encontrada")
    return NextResponse.json({ trip })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    await exigirDono(supabase, tripId, user.id)

    const analise = atualizarViagemSchema.safeParse(await request.json())
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    // Campo a campo. `user_id`, `id` e `created_at` não estão no schema e por
    // isso não têm como chegar aqui, venha o que vier no corpo da requisição.
    const { title, destination, start_date, end_date, description, budget, currency, status } = analise.data

    const { data: trip, error } = await supabase
      .from("trips")
      .update({ title, destination, start_date, end_date, description, budget, currency, status })
      .eq("id", tripId)
      .select()
      .single()

    if (error) throw new ErroHttp(400, error.message)
    return NextResponse.json({ trip })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    // Excluir é irreversível e apaga em cascata itinerário, despesas e reservas
    // de todos os membros — por isso é restrito ao dono, não a qualquer membro.
    await exigirDono(supabase, tripId, user.id)

    const { error } = await supabase.from("trips").delete().eq("id", tripId)
    if (error) throw new ErroHttp(400, error.message)

    return NextResponse.json({ success: true })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
