import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exigirMembro } from "@/lib/authz/trip"
import { naoAutenticado, naoEncontrado, respostaDeErro, respostaInvalida, ErroHttp } from "@/lib/http"
import { atualizarLugarSchema } from "@/lib/schemas/lugar"

/**
 * Um lugar salvo. Segue o molde de `app/api/trips/[tripId]/route.ts`.
 *
 * Toda consulta filtra por `trip_id` **e** `id`: a autorização acima olha para a
 * viagem da URL, então sem o primeiro filtro um membro da viagem X alteraria o
 * lugar da viagem Y só trocando o `placeId`.
 *
 * @RF08.4 marcar visitado · @RF08.6 excluir lugar
 */

type Contexto = { params: Promise<{ tripId: string; placeId: string }> }

async function usuarioAtual(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

export async function PATCH(request: Request, { params }: Contexto) {
  const { tripId, placeId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    await exigirMembro(supabase, tripId, user.id)

    const analise = atualizarLugarSchema.safeParse(await request.json())
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    // Campo a campo. Só o que veio no corpo entra no update: marcar visitado não
    // pode apagar a observação que outro membro escreveu.
    const { visited, notes } = analise.data
    const valores: { visited?: boolean; notes?: string | null } = {}
    if (visited !== undefined) valores.visited = visited
    if (notes !== undefined) valores.notes = notes || null

    const { data: place, error } = await supabase
      .from("places")
      .update(valores)
      .eq("trip_id", tripId)
      .eq("id", placeId)
      .select()
      .maybeSingle()

    if (error) throw new ErroHttp(400, "Não foi possível salvar o lugar")
    if (!place) throw naoEncontrado("Lugar")
    return NextResponse.json({ place })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function DELETE(_request: Request, { params }: Contexto) {
  const { tripId, placeId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    await exigirMembro(supabase, tripId, user.id)

    // `.select()` devolve as linhas apagadas: vazio significa que o lugar não é
    // desta viagem (ou não existe), e a resposta precisa dizer isso.
    const { data: apagados, error } = await supabase
      .from("places")
      .delete()
      .eq("trip_id", tripId)
      .eq("id", placeId)
      .select("id")

    if (error) throw new ErroHttp(400, "Não foi possível excluir o lugar")
    if (!apagados || apagados.length === 0) throw naoEncontrado("Lugar")
    return NextResponse.json({ success: true })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
