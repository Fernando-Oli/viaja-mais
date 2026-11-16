import type { Tx } from "../../db/como-usuario"
import type { AtualizarViagem, CriarViagem } from "../../../lib/schemas/viagem"
import { LIMITE_LISTAGEM } from "../../../lib/listagem"

/**
 * Acesso a dados de viagem. Único lugar do módulo que escreve SQL.
 *
 * Toda função recebe a transação aberta por `comoUsuario()`: as consultas
 * rodam como o usuário, e a RLS filtra o que ele não pode ver. As rotas decidem
 * a autorização explicitamente antes de chamar aqui; a RLS é a segunda linha.
 */

/** Papel do usuário na viagem, para `exigirMembro`/`exigirDono`. */
export async function papelNaViagem(tx: Tx, tripId: string, userId: string): Promise<string | null> {
  const linha = await tx
    .selectFrom("trip_members")
    .select("role")
    .where("trip_id", "=", tripId)
    .where("user_id", "=", userId)
    .executeTakeFirst()
  return linha?.role ?? null
}

/**
 * Viagem com os membros, no mesmo formato que o Supabase devolvia para
 * `select("*, trip_members(user_id, role)")` — as telas leem `trip.trip_members`.
 */
export async function buscarViagem(tx: Tx, tripId: string) {
  const viagem = await tx.selectFrom("trips").selectAll().where("id", "=", tripId).executeTakeFirst()
  if (!viagem) return null

  const membros = await tx
    .selectFrom("trip_members")
    .select(["user_id", "role"])
    .where("trip_id", "=", tripId)
    .orderBy("joined_at")
    .execute()

  return { ...viagem, trip_members: membros }
}

/**
 * Atualiza só os campos recebidos. A lista é fechada pelo tipo: `user_id`, `id`
 * e `created_at` não estão em `AtualizarViagem` e não têm como chegar aqui.
 *
 * @RNF02.7 sem atribuição em massa
 */
export async function atualizarViagem(tx: Tx, tripId: string, campos: AtualizarViagem) {
  const { title, destination, start_date, end_date, description, budget, currency, status } = campos
  return tx
    .updateTable("trips")
    .set({ title, destination, start_date, end_date, description, budget, currency, status, updated_at: new Date() })
    .where("id", "=", tripId)
    .returningAll()
    .executeTakeFirst()
}

export async function excluirViagem(tx: Tx, tripId: string): Promise<boolean> {
  const resultado = await tx.deleteFrom("trips").where("id", "=", tripId).executeTakeFirst()
  return resultado.numDeletedRows > BigInt(0)
}

/**
 * Viagens de que o usuário **participa** (dono ou membro), não só as que criou.
 *
 * Mesmo formato do Supabase para `select("*, trip_members!inner(user_id, role)")`
 * filtrado pelo usuário: cada viagem traz em `trip_members` só a linha dele —
 * é por ela que as telas sabem se ele é dono. O `inner join` é o filtro; a RLS
 * filtra de novo por baixo.
 *
 * @RF03.4 listar viagens · @RF04.4 os membros visualizam a viagem · @RNF06.4 limite explícito
 */
export async function listarViagens(tx: Tx, userId: string) {
  const linhas = await tx
    .selectFrom("trips")
    .innerJoin("trip_members", "trip_members.trip_id", "trips.id")
    .selectAll("trips")
    .select(["trip_members.user_id as membro_user_id", "trip_members.role as membro_role"])
    .where("trip_members.user_id", "=", userId)
    .orderBy("trips.start_date", "desc")
    .limit(LIMITE_LISTAGEM)
    .execute()

  return linhas.map(({ membro_user_id, membro_role, ...viagem }) => ({
    ...viagem,
    trip_members: [{ user_id: membro_user_id, role: membro_role }],
  }))
}

/**
 * Cria a viagem com `user_id` da sessão e os campos do zod, um a um.
 *
 * O gatilho `on_trip_created` insere o criador em `trip_members` como owner na
 * mesma transação — inserir aqui de novo colide com a constraint única.
 *
 * @RF03.1 criar viagem · @RNF02.7 sem atribuição em massa
 */
export async function criarViagem(tx: Tx, userId: string, campos: CriarViagem) {
  const { title, destination, start_date, end_date, description, budget, currency, status } = campos
  return tx
    .insertInto("trips")
    .values({
      user_id: userId,
      title,
      destination,
      start_date,
      end_date,
      description: description || null,
      budget: budget ?? null,
      currency,
      status,
    })
    .returningAll()
    .executeTakeFirstOrThrow()
}
