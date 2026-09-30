import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exigirMembro } from "@/lib/authz/trip"
import { naoAutenticado, respostaDeErro, respostaInvalida, ErroHttp } from "@/lib/http"
import { criarReservaSchema } from "@/lib/schemas/reserva"

/**
 * Reservas de uma viagem. Segue o molde de `app/api/trips/[tripId]/route.ts`.
 *
 * Qualquer membro lê e cadastra reservas: voo e hotel costumam ser comprados por
 * pessoas diferentes do grupo, e todos precisam enxergá-los.
 *
 * @RF07.7 visualizar reservas · @RF07.1 @RF07.2 @RF07.3 @RF07.4 adicionar reserva
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

    const { data: bookings, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("trip_id", tripId)
      .order("start_date", { ascending: true })

    if (error) throw new ErroHttp(400, "Não foi possível carregar as reservas")
    return NextResponse.json({ bookings })
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

    const analise = criarReservaSchema.safeParse(await request.json())
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    // Campo a campo. `trip_id` vem da URL, já autorizada acima; `user_id`, da sessão.
    const {
      type,
      title,
      provider,
      confirmation_number,
      start_date,
      end_date,
      location,
      price,
      currency,
      status,
      notes,
    } = analise.data

    const { data: booking, error } = await supabase
      .from("bookings")
      .insert({
        trip_id: tripId,
        user_id: user.id,
        type,
        title,
        provider: provider || null,
        confirmation_number: confirmation_number || null,
        start_date,
        end_date: end_date || null,
        location: location || null,
        price: price ?? null,
        currency,
        status,
        notes: notes || null,
      })
      .select()
      .single()

    // Mensagem genérica: a do Postgres pode revelar coluna/constraint.
    if (error) throw new ErroHttp(400, "Não foi possível salvar a reserva")
    return NextResponse.json({ booking })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
