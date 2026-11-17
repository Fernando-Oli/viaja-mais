import { sql } from "kysely"
import type { Tx } from "../../db/como-usuario"

/**
 * Acesso a `trip_invitations` e a entrada do convidado em `trip_members`.
 * Toda operação do convidado filtra pelo e-mail da sessão: é essa a
 * autorização, e convite de outra pessoa simplesmente não aparece (404).
 *
 * @RF04.1 convidar · @RF04.3 aceitar convite
 */

/**
 * Convites pendentes do e-mail da sessão, com título, destino e datas da
 * viagem. A função é `security definer` porque quem foi convidado ainda não
 * enxerga a viagem pela RLS (S09-F).
 */
export async function pendentesDaSessao(tx: Tx) {
  const { rows } = await sql<{
    id: string
    trip_id: string
    created_at: Date
    title: string
    destination: string
    start_date: string
    end_date: string
  }>`select * from public.meus_convites_pendentes()`.execute(tx)
  return rows
}

/** Campo a campo: `inviter_id` vem da sessão e `status` é fixo. @RNF02.7 */
export function criar(tx: Tx, tripId: string, inviterId: string, email: string) {
  return tx
    .insertInto("trip_invitations")
    .values({ trip_id: tripId, inviter_id: inviterId, invitee_email: email, status: "pending" })
    .returning(["id"])
    .executeTakeFirstOrThrow()
}

/** Título da viagem e nome de quem convida, para o texto do e-mail. */
export async function dadosDoEmail(tx: Tx, tripId: string, inviterId: string) {
  const viagem = await tx.selectFrom("trips").select("title").where("id", "=", tripId).executeTakeFirst()
  const perfil = await tx.selectFrom("profiles").select("full_name").where("id", "=", inviterId).executeTakeFirst()
  return { titulo: viagem?.title ?? "uma viagem", quemConvida: perfil?.full_name?.trim() || "Alguém" }
}

export function pendenteDoEmail(tx: Tx, invitationId: string, email: string) {
  return tx
    .selectFrom("trip_invitations")
    .select(["id", "trip_id"])
    .where("id", "=", invitationId)
    .where("invitee_email", "=", email)
    .where("status", "=", "pending")
    .executeTakeFirst()
}

/**
 * Entra na viagem, se ainda não estiver nela. A policy `trip_members_insert`
 * só aceita a própria pessoa com convite pendente para o e-mail dela — por
 * isso a entrada vem **antes** de marcar o convite como aceito.
 *
 * Sem `on conflict do nothing`: com ele, o Postgres exige que a linha nova
 * também passe na policy de leitura (`can_access_trip`), e quem ainda não é
 * membro não passa — todo aceite virava violação de RLS.
 */
export async function entrarNaViagem(tx: Tx, tripId: string, userId: string) {
  const jaMembro = await tx
    .selectFrom("trip_members")
    .select("id")
    .where("trip_id", "=", tripId)
    .where("user_id", "=", userId)
    .executeTakeFirst()
  if (jaMembro) return
  await tx.insertInto("trip_members").values({ trip_id: tripId, user_id: userId, role: "member" }).execute()
}

export async function responder(tx: Tx, invitationId: string, email: string, status: "accepted" | "declined") {
  const r = await tx
    .updateTable("trip_invitations")
    .set({ status, updated_at: sql`now()` })
    .where("id", "=", invitationId)
    .where("invitee_email", "=", email)
    .where("status", "=", "pending")
    .executeTakeFirst()
  return r.numUpdatedRows > BigInt(0)
}
