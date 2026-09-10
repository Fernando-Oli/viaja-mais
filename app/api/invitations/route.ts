import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { exigirDono } from "@/lib/authz/trip"
import { naoAutenticado, respostaDeErro, respostaInvalida, ErroHttp } from "@/lib/http"
import { criarConviteSchema } from "@/lib/schemas/convite"
import { env } from "@/lib/env"

/**
 * Convites para participar de uma viagem.
 *
 * Segue o molde de `app/api/trips/[tripId]/route.ts`. Duas coisas são
 * específicas daqui:
 *
 *   - **Convidar é ação de dono**, não de qualquer membro. Espelha a policy
 *     `trip_invitations_insert` (`is_trip_owner`) do banco: a checagem no
 *     servidor repete a regra da RLS de propósito, porque a RLS é a segunda
 *     linha de defesa, nunca a única.
 *   - **`inviter_id` vem da sessão.** Antes vinha do corpo da requisição — e o
 *     handler não chamava `getUser()` em momento nenhum, então qualquer
 *     requisição podia criar convite para qualquer viagem, em nome de qualquer
 *     pessoa.
 *
 * @RF04.1 o dono convida pessoas por e-mail
 */

async function usuarioAtual(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

export async function GET() {
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)

    const { data: invitations, error } = await supabase
      .from("trip_invitations")
      .select("*")
      .eq("invitee_email", user.email)
      .eq("status", "pending")

    // Mensagem genérica: a do Postgres pode revelar coluna e constraint.
    if (error) throw new ErroHttp(400, "Não foi possível carregar os convites")

    const comViagem = await Promise.all(
      (invitations || []).map(async (invitation) => {
        const { data: trip } = await supabase
          .from("trips")
          .select("id, title, destination, start_date, end_date")
          .eq("id", invitation.trip_id)
          .single()

        return { ...invitation, trip }
      }),
    )

    return NextResponse.json({ invitations: comViagem })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)

    // O `tripId` vem do corpo, então a validação precisa acontecer antes da
    // autorização — não há o que autorizar enquanto não se sabe qual viagem é.
    const analise = criarConviteSchema.safeParse(await request.json())
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    const { email, tripId } = analise.data

    await exigirDono(supabase, tripId, user.id)

    // O e-mail ainda não sai: este cliente usa a chave anon e
    // `auth.admin.inviteUserByEmail` exige a service role, então a chamada
    // falha com 403 e o convite fica só no banco. Consertar é a atividade
    // S03-F-convite-email; aqui o escopo é autorização, e misturar as duas
    // coisas faria o PR perder revisibilidade.
    const { error: erroEnvio } = await supabase.auth.admin.inviteUserByEmail(email, {
      data: { invited_to_trip: tripId, inviter: user.id },
      redirectTo: `${env.NEXT_PUBLIC_APP_URL}/dashboard`,
    })
    if (erroEnvio) console.warn("[convite] envio de e-mail falhou:", erroEnvio.message)

    // Campo a campo. `inviter_id` sai da sessão e `status` é fixo aqui, então
    // nem um nem outro têm como chegar pelo corpo da requisição.
    const { error } = await supabase.from("trip_invitations").insert({
      trip_id: tripId,
      inviter_id: user.id,
      invitee_email: email,
      status: "pending",
    })

    if (error) throw new ErroHttp(400, "Não foi possível criar o convite")

    return NextResponse.json({ success: true })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
