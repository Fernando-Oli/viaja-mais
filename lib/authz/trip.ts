import { naoAutenticado, semPermissao } from "@/lib/erros"

export type PapelNaViagem = "owner" | "member"

/**
 * De onde vem o papel: uma função que devolve o papel do usuário na viagem
 * (`"owner"`, `"member"`) ou `null`. A API passa uma consulta pelo Kysely dentro
 * da transação do usuário (`api/modulos/viagens/acesso.ts`); o teste passa uma
 * função qualquer. Falha da consulta propaga como está.
 */
export type BuscarPapel = (tripId: string, userId: string) => Promise<string | null>

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
  fonte: BuscarPapel,
  tripId: string,
  userId: string,
): Promise<PapelNaViagem | null> {
  const role = await fonte(tripId, userId)
  if (!role) return null
  return role === "owner" ? "owner" : "member"
}

/** Exige que o usuário participe da viagem. Devolve o papel para quem precisar dele. */
export async function exigirMembro(
  fonte: BuscarPapel,
  tripId: string,
  userId: string | undefined,
): Promise<PapelNaViagem> {
  if (!userId) throw naoAutenticado()
  const papel = await papelNaViagem(fonte, tripId, userId)
  // 403 e não 404: quem não participa não deveria nem descobrir se a viagem
  // existe, mas separar os dois casos exigiria uma consulta a mais que vaza
  // justamente essa informação.
  if (!papel) throw semPermissao("esta viagem")
  return papel
}

/** Exige que o usuário seja o dono. Excluir viagem e remover membro passam por aqui. */
export async function exigirDono(
  fonte: BuscarPapel,
  tripId: string,
  userId: string | undefined,
): Promise<void> {
  const papel = await exigirMembro(fonte, tripId, userId)
  if (papel !== "owner") throw semPermissao("esta ação, restrita ao dono da viagem")
}
