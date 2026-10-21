import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Nome de exibição de vários perfis de uma vez, por id.
 *
 * Existe porque `profiles` não pode ser embutido a partir de outra tabela:
 * `trip_members.user_id`, `expenses.user_id` e as demais apontam para
 * `auth.users`, não para `profiles`, e o PostgREST recusa o embed
 * `trip_members(..., profiles(...))` com PGRST200. A consulta inteira falha —
 * a lista de membros da viagem chegava vazia, sem a própria dona.
 *
 * Lê só `full_name`: é a coluna que as outras telas precisam, e `profiles` é
 * legível por qualquer autenticado (policy `profiles_select_autenticado`).
 *
 * Devolve um mapa vazio se a consulta falhar: o nome é enfeite, e a tela
 * mostra "Usuário" no lugar em vez de perder a lista inteira.
 */
export async function nomesDosPerfis(
  supabase: SupabaseClient,
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  const unicos = [...new Set(ids)]
  if (unicos.length === 0) return new Map()

  const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", unicos)
  if (error || !data) return new Map()

  return new Map(data.map((perfil: { id: string; full_name: string | null }) => [perfil.id, perfil.full_name]))
}
