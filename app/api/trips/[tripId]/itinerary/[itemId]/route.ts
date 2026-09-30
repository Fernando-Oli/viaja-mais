import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exigirMembro } from "@/lib/authz/trip"
import { naoAutenticado, naoEncontrado, respostaDeErro, respostaInvalida, ErroHttp } from "@/lib/http"
import { atualizarItemItinerarioSchema } from "@/lib/schemas/itinerario"

/**
 * Um item do itinerário. Segue o molde de `app/api/trips/[tripId]/route.ts`.
 *
 * `exigirMembro` e não `exigirDono`: montar o roteiro é trabalho do grupo, como
 * na criação. Toda consulta filtra por `trip_id` **e** `id` — sem o primeiro, um
 * membro da viagem X alteraria item da viagem Y só trocando o `itemId` na URL,
 * porque a autorização acima olhou para X.
 *
 * @RF05.2 editar atividade · @RF05.3 excluir atividade
 */

type Contexto = { params: Promise<{ tripId: string; itemId: string }> }

async function usuarioAtual(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

export async function GET(_request: Request, { params }: Contexto) {
  const { tripId, itemId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    await exigirMembro(supabase, tripId, user.id)

    const { data: item, error } = await supabase
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", tripId)
      .eq("id", itemId)
      .maybeSingle()

    if (error) throw new ErroHttp(400, "Não foi possível carregar a atividade")
    if (!item) throw naoEncontrado("Atividade")
    return NextResponse.json({ item })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function PATCH(request: Request, { params }: Contexto) {
  const { tripId, itemId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    await exigirMembro(supabase, tripId, user.id)

    const analise = atualizarItemItinerarioSchema.safeParse(await request.json())
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    // Campo a campo. `id` e `trip_id` não estão no schema: o item não muda de viagem.
    const { title, description, date, start_time, end_time, location, category, status } = analise.data

    const { data: item, error } = await supabase
      .from("itinerary_items")
      .update({ title, description, date, start_time, end_time, location, category, status })
      .eq("trip_id", tripId)
      .eq("id", itemId)
      .select()
      .maybeSingle()

    if (error) throw new ErroHttp(400, "Não foi possível salvar a atividade")
    if (!item) throw naoEncontrado("Atividade")
    return NextResponse.json({ item })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function DELETE(_request: Request, { params }: Contexto) {
  const { tripId, itemId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    await exigirMembro(supabase, tripId, user.id)

    // `.select()` devolve as linhas apagadas: vazio significa que o item não é
    // desta viagem (ou não existe), e a resposta precisa dizer isso.
    const { data: apagados, error } = await supabase
      .from("itinerary_items")
      .delete()
      .eq("trip_id", tripId)
      .eq("id", itemId)
      .select("id")

    if (error) throw new ErroHttp(400, "Não foi possível excluir a atividade")
    if (!apagados || apagados.length === 0) throw naoEncontrado("Atividade")
    return NextResponse.json({ success: true })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
