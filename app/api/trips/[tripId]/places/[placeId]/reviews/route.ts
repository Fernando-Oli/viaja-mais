import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exigirMembro } from "@/lib/authz/trip"
import { naoAutenticado, naoEncontrado, respostaDeErro, respostaInvalida, ErroHttp } from "@/lib/http"
import { avaliacaoSchema } from "@/lib/schemas/avaliacao"
import { resumirAvaliacoes } from "@/lib/lugares/avaliacoes"
import { nomesDosPerfis } from "@/lib/social/perfis"

/**
 * Avaliações de um lugar salvo. Segue o molde de
 * `app/api/trips/[tripId]/places/[placeId]/route.ts`.
 *
 * A avaliação se prende ao identificador do Google do lugar, não ao
 * `places.id`: o mesmo lugar salvo em outra viagem mostra as mesmas avaliações
 * (RF11.2). A URL continua passando pela viagem porque é dela que sai a
 * autorização — só avalia quem tem o lugar numa viagem de que participa, a
 * mesma regra da policy `place_reviews_insert`.
 *
 * @RF11.1 avaliar · @RF11.2 ver avaliações de outros · @RF11.3 editar/excluir a própria
 */

type Contexto = { params: Promise<{ tripId: string; placeId: string }> }
type Cliente = Awaited<ReturnType<typeof createClient>>

async function usuarioAtual(supabase: Cliente) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

/** Lugar da viagem da URL, com filtro por `trip_id` **e** `id`. */
async function lugarAvaliavel(supabase: Cliente, tripId: string, placeId: string) {
  const { data: lugar, error } = await supabase
    .from("places")
    .select("name, place_id")
    .eq("trip_id", tripId)
    .eq("id", placeId)
    .maybeSingle()

  if (error) throw new ErroHttp(500, "Não foi possível carregar o lugar")
  if (!lugar) throw naoEncontrado("Lugar")
  if (!lugar.place_id) throw new ErroHttp(400, "Este lugar não veio da busca e não pode ser avaliado")
  return { nome: lugar.name as string, googlePlaceId: lugar.place_id as string }
}

async function preparar(params: Contexto["params"]) {
  const { tripId, placeId } = await params
  const supabase = await createClient()
  const user = await usuarioAtual(supabase)
  await exigirMembro(supabase, tripId, user.id)
  const lugar = await lugarAvaliavel(supabase, tripId, placeId)
  return { supabase, user, lugar }
}

export async function GET(_request: Request, { params }: Contexto) {
  try {
    const { supabase, user, lugar } = await preparar(params)

    const { data, error } = await supabase
      .from("place_reviews")
      .select("id, user_id, rating, comment, updated_at")
      .eq("google_place_id", lugar.googlePlaceId)
      .order("updated_at", { ascending: false })

    if (error) throw new ErroHttp(500, "Não foi possível carregar as avaliações")
    const avaliacoes = data ?? []
    const nomes = await nomesDosPerfis(
      supabase,
      avaliacoes.map((a) => a.user_id),
    )

    return NextResponse.json({
      reviews: avaliacoes.map((a) => ({
        ...a,
        autor: nomes.get(a.user_id) ?? null,
        minha: a.user_id === user.id,
      })),
      resumo: resumirAvaliacoes(avaliacoes),
    })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function PUT(request: Request, { params }: Contexto) {
  try {
    const { supabase, user, lugar } = await preparar(params)

    const analise = avaliacaoSchema.safeParse(await request.json())
    if (!analise.success) return respostaInvalida(analise.error.flatten())
    const rating = analise.data.rating
    const comment = analise.data.comment || null

    // Sem upsert: o `on conflict do update` do PostgREST regrava todas as
    // colunas enviadas, e o grant de UPDATE só cobre nota e comentário.
    const { data: existente, error: erroBusca } = await supabase
      .from("place_reviews")
      .select("id")
      .eq("google_place_id", lugar.googlePlaceId)
      .eq("user_id", user.id)
      .maybeSingle()
    if (erroBusca) throw new ErroHttp(500, "Não foi possível salvar a avaliação")

    if (existente) {
      const { data: review, error } = await supabase
        .from("place_reviews")
        .update({ rating, comment })
        .eq("id", existente.id)
        .eq("user_id", user.id)
        .select()
        .single()
      if (error) throw new ErroHttp(400, "Não foi possível salvar a avaliação")
      return NextResponse.json({ review })
    }

    const { data: review, error } = await supabase
      .from("place_reviews")
      .insert({
        google_place_id: lugar.googlePlaceId,
        place_name: lugar.nome,
        user_id: user.id,
        rating,
        comment,
      })
      .select()
      .single()

    // 23505: dois envios simultâneos da mesma pessoa; o primeiro já gravou.
    if (error?.code === "23505") throw new ErroHttp(409, "Sua avaliação já foi salva; recarregue a página")
    if (error) throw new ErroHttp(400, "Não foi possível salvar a avaliação")
    return NextResponse.json({ review }, { status: 201 })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function DELETE(_request: Request, { params }: Contexto) {
  try {
    const { supabase, user, lugar } = await preparar(params)

    const { data: apagadas, error } = await supabase
      .from("place_reviews")
      .delete()
      .eq("google_place_id", lugar.googlePlaceId)
      .eq("user_id", user.id)
      .select("id")

    if (error) throw new ErroHttp(400, "Não foi possível excluir a avaliação")
    if (!apagadas || apagadas.length === 0) throw naoEncontrado("Avaliação")
    return NextResponse.json({ success: true })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
