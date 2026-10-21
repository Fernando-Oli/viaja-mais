import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ErroHttp, naoAutenticado, naoEncontrado, respostaDeErro } from "@/lib/http"

/**
 * Aceitar um convite: é a única porta de entrada numa viagem. A policy
 * `trip_members_insert` só deixa a própria pessoa se inserir, e só com convite
 * pendente para o e-mail dela.
 *
 * O convite é lido sem embutir `trips`: quem ainda não é membro não enxerga a
 * viagem pela RLS, e um `trips!inner` zerava o resultado — todo aceite caía em
 * 404 e ninguém entrava em viagem nenhuma pelo app.
 *
 * O filtro por `invitee_email` da sessão é a autorização: convite de outra
 * pessoa responde 404, sem confirmar que ele existe.
 *
 * @RF04.3 aceitar convite
 */

type Contexto = { params: Promise<{ invitationId: string }> }

export async function POST(_request: Request, { params }: Contexto) {
  const { invitationId } = await params
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user?.email) throw naoAutenticado()

    const { data: convite, error: erroConvite } = await supabase
      .from("trip_invitations")
      .select("id, trip_id")
      .eq("id", invitationId)
      .eq("invitee_email", user.email)
      .eq("status", "pending")
      .maybeSingle()

    if (erroConvite) throw new ErroHttp(400, "Não foi possível carregar o convite")
    if (!convite) throw naoEncontrado("Convite")

    const { data: jaMembro } = await supabase
      .from("trip_members")
      .select("id")
      .eq("trip_id", convite.trip_id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!jaMembro) {
      const { error: erroMembro } = await supabase
        .from("trip_members")
        .insert({ trip_id: convite.trip_id, user_id: user.id, role: "member" })
      if (erroMembro) throw new ErroHttp(400, "Não foi possível entrar na viagem")
    }

    const { error: erroAceite } = await supabase
      .from("trip_invitations")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", convite.id)
      .eq("invitee_email", user.email)

    if (erroAceite) throw new ErroHttp(400, "Não foi possível aceitar o convite")

    return NextResponse.json({ success: true, trip_id: convite.trip_id })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
