import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exigirMembro } from "@/lib/authz/trip"
import { naoAutenticado, respostaDeErro, respostaInvalida, ErroHttp } from "@/lib/http"
import { criarItemItinerarioSchema } from "@/lib/schemas/itinerario"

/**
 * Itinerário de uma viagem. Segue o molde de `app/api/trips/[tripId]/route.ts`.
 *
 * Qualquer membro — não só o dono — lê e adiciona itens: montar o roteiro é
 * trabalho do grupo (RF04.5).
 *
 * @RF05.4 visualizar itinerário · @RF05.1 adicionar atividade
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

    const { data: itinerary, error } = await supabase
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", tripId)
      .order("date", { ascending: true })
      .order("start_time", { ascending: true })

    if (error) throw new ErroHttp(400, "Não foi possível carregar o itinerário")
    return NextResponse.json({ itinerary })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    await exigirMembro(supabase, tripId, user.id)

    const analise = criarItemItinerarioSchema.safeParse(await request.json())
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    // Campo a campo; `trip_id` vem da URL, já autorizada acima.
    const { title, description, date, start_time, end_time, location, category, status } = analise.data

    const { data: item, error } = await supabase
      .from("itinerary_items")
      .insert({
        trip_id: tripId,
        title,
        description: description || null,
        date,
        start_time: start_time || null,
        end_time: end_time || null,
        location: location || null,
        category,
        status,
      })
      .select()
      .single()

    // Mensagem genérica: a do Postgres pode revelar coluna/constraint.
    if (error) throw new ErroHttp(400, "Não foi possível salvar a atividade")
    return NextResponse.json({ item })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
