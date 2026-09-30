import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exigirMembro } from "@/lib/authz/trip"
import { naoAutenticado, naoEncontrado, respostaDeErro, respostaInvalida, ErroHttp } from "@/lib/http"
import { atualizarReservaSchema } from "@/lib/schemas/reserva"

/**
 * Uma reserva. Segue o molde de `app/api/trips/[tripId]/route.ts`.
 *
 * Toda consulta filtra por `trip_id` **e** `id`: a autorização acima olha para a
 * viagem da URL, então sem o primeiro filtro um membro da viagem X alteraria a
 * reserva da viagem Y só trocando o `bookingId`.
 *
 * @RF07.5 editar reserva · @RF07.6 excluir reserva
 */

type Contexto = { params: Promise<{ tripId: string; bookingId: string }> }

async function usuarioAtual(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

export async function GET(_request: Request, { params }: Contexto) {
  const { tripId, bookingId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    await exigirMembro(supabase, tripId, user.id)

    const { data: booking, error } = await supabase
      .from("bookings")
      .select("*")
      .eq("trip_id", tripId)
      .eq("id", bookingId)
      .maybeSingle()

    if (error) throw new ErroHttp(400, "Não foi possível carregar a reserva")
    if (!booking) throw naoEncontrado("Reserva")
    return NextResponse.json({ booking })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function PATCH(request: Request, { params }: Contexto) {
  const { tripId, bookingId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    await exigirMembro(supabase, tripId, user.id)

    const analise = atualizarReservaSchema.safeParse(await request.json())
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    // Campo a campo. `id`, `trip_id` e `user_id` não estão no schema: a reserva não
    // muda de viagem nem de autor.
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
      .update({
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
      })
      .eq("trip_id", tripId)
      .eq("id", bookingId)
      .select()
      .maybeSingle()

    if (error) throw new ErroHttp(400, "Não foi possível salvar a reserva")
    if (!booking) throw naoEncontrado("Reserva")
    return NextResponse.json({ booking })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function DELETE(_request: Request, { params }: Contexto) {
  const { tripId, bookingId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    await exigirMembro(supabase, tripId, user.id)

    // `.select()` devolve as linhas apagadas: vazio significa que a reserva não é
    // desta viagem (ou não existe), e a resposta precisa dizer isso.
    const { data: apagadas, error } = await supabase
      .from("bookings")
      .delete()
      .eq("trip_id", tripId)
      .eq("id", bookingId)
      .select("id")

    if (error) throw new ErroHttp(400, "Não foi possível excluir a reserva")
    if (!apagadas || apagadas.length === 0) throw naoEncontrado("Reserva")
    return NextResponse.json({ success: true })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
