import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Põe alguém numa viagem pelo único caminho que a RLS aceita: a dona convida
 * o e-mail, e o próprio convidado insere a linha dele em `trip_members` enquanto
 * o convite está pendente. É o que `app/api/invitations/[invitationId]/accept`
 * faz. A dona inserir o membro direto deixou de ser permitido (S06-F).
 *
 * @RF04.3 aceitar convite
 */
export async function entrarPorConvite(opcoes: {
  dona: SupabaseClient
  idDona: string
  convidado: SupabaseClient
  idConvidado: string
  emailConvidado: string
  tripId: string
}) {
  const { dona, idDona, convidado, idConvidado, emailConvidado, tripId } = opcoes

  const { data: convite, error: erroConvite } = await dona
    .from("trip_invitations")
    .insert({ trip_id: tripId, inviter_id: idDona, invitee_email: emailConvidado })
    .select("id")
    .single()
  if (erroConvite) throw new Error(`a dona não convidou ${emailConvidado}: ${erroConvite.message}`)

  const { error: erroMembro } = await convidado
    .from("trip_members")
    .insert({ trip_id: tripId, user_id: idConvidado, role: "member" })
  if (erroMembro) throw new Error(`${emailConvidado} não aceitou o convite: ${erroMembro.message}`)

  const { error: erroAceite } = await convidado
    .from("trip_invitations")
    .update({ status: "accepted" })
    .eq("id", convite.id)
  if (erroAceite) throw new Error(`o convite de ${emailConvidado} não foi marcado aceito: ${erroAceite.message}`)
}
