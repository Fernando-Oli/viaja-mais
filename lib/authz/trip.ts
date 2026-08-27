import { ErroHttp, naoAutenticado, semPermissao } from "@/lib/http"

export type PapelNaViagem = "owner" | "member"

type RespostaPapel = {
  data: { role: string } | null
  error: { message: string } | null
}

/** Forma da cadeia de consulta usada aqui — o mínimo, nada além. */
interface CadeiaPapel {
  select(colunas: string): {
    eq(
      coluna: string,
      valor: string,
    ): {
      eq(coluna: string, valor: string): { maybeSingle(): PromiseLike<RespostaPapel> }
    }
  }
}

/**
 * Contrato mínimo do cliente. Tipar `SupabaseClient` inteiro aqui obrigaria todo
 * teste a montar um mock do SDK; com esta interface, um objeto literal basta.
 */
export interface ClienteConsulta {
  from(tabela: string): unknown
}

async function consultarPapel(
  supabase: ClienteConsulta,
  tripId: string,
  userId: string,
): Promise<RespostaPapel> {
  // Único cast do módulo. Os tipos genéricos do supabase-js não são
  // estruturalmente compatíveis com uma interface reduzida (o builder é
  // "thenable", não Promise), e comparar a árvore inteira estoura a
  // profundidade de instanciação do TypeScript.
  const tabela = supabase.from("trip_members") as CadeiaPapel
  return tabela.select("role").eq("trip_id", tripId).eq("user_id", userId).maybeSingle()
}

/**
 * Autorização de viagem, em um lugar só.
 *
 * Por que existe: a aplicação nasceu decidindo acesso na interface — escondendo
 * botão com `if (isOwner)` — o que não impede requisição nenhuma. E as telas
 * filtravam por `user_id`, o que quebra o modelo de viagem compartilhada: quem
 * foi convidado deixava de ver despesas e reservas da própria viagem.
 *
 * O predicado correto é **participação**, não propriedade.
 */
export async function papelNaViagem(
  supabase: ClienteConsulta,
  tripId: string,
  userId: string,
): Promise<PapelNaViagem | null> {
  const { data, error } = await consultarPapel(supabase, tripId, userId)

  if (error) throw new ErroHttp(500, error.message)
  if (!data) return null
  return data.role === "owner" ? "owner" : "member"
}

/** Exige que o usuário participe da viagem. Devolve o papel para quem precisar dele. */
export async function exigirMembro(
  supabase: ClienteConsulta,
  tripId: string,
  userId: string | undefined,
): Promise<PapelNaViagem> {
  if (!userId) throw naoAutenticado()
  const papel = await papelNaViagem(supabase, tripId, userId)
  // 403 e não 404: quem não participa não deveria nem descobrir se a viagem
  // existe, mas separar os dois casos exigiria uma consulta a mais que vaza
  // justamente essa informação.
  if (!papel) throw semPermissao("esta viagem")
  return papel
}

/** Exige que o usuário seja o dono. Excluir viagem e remover membro passam por aqui. */
export async function exigirDono(
  supabase: ClienteConsulta,
  tripId: string,
  userId: string | undefined,
): Promise<void> {
  const papel = await exigirMembro(supabase, tripId, userId)
  if (papel !== "owner") throw semPermissao("esta ação, restrita ao dono da viagem")
}
