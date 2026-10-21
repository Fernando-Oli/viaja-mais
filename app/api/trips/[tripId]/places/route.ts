import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exigirMembro } from "@/lib/authz/trip"
import { naoAutenticado, respostaDeErro, respostaInvalida, ErroHttp } from "@/lib/http"
import { criarLugarSchema } from "@/lib/schemas/lugar"

/**
 * Lugares de uma viagem. Segue o molde de `app/api/trips/[tripId]/route.ts`.
 *
 * Qualquer membro lê e salva lugares: o lugar que um membro encontrou interessa
 * ao grupo inteiro.
 *
 * @RF08.2 salvar lugar · @RF08.3 notas no lugar
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

    const { data: places, error } = await supabase
      .from("places")
      .select("*")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false })

    if (error) throw new ErroHttp(400, "Não foi possível carregar os lugares")
    return NextResponse.json({ places })
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

    const analise = criarLugarSchema.safeParse(await request.json())
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    // Campo a campo. `trip_id` vem da URL, já autorizada acima; `user_id`, da sessão.
    const { name, address, latitude, longitude, place_id, category, rating, notes } = analise.data

    const { data: place, error } = await supabase
      .from("places")
      .insert({
        trip_id: tripId,
        user_id: user.id,
        name,
        address: address || null,
        latitude,
        longitude,
        place_id: place_id || null,
        category: category || null,
        rating: rating ?? null,
        notes: notes || null,
      })
      .select()
      .single()

    // Mensagem genérica: a do Postgres pode revelar coluna/constraint.
    if (error) throw new ErroHttp(400, "Não foi possível salvar o lugar")
    return NextResponse.json({ place })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
