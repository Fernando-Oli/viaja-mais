import { exigirDono, exigirMembro, type PapelNaViagem } from "../../../lib/authz/trip"
import type { Tx } from "../../db/como-usuario"
import { papelNaViagem } from "./repositorio"

/**
 * Autorização de viagem para os módulos montados sob `/api/trips/:tripId/...`
 * (itinerário, reservas, lugares, despesas). A regra é a de `lib/authz/trip.ts`;
 * aqui só se liga ela à transação do usuário.
 *
 * É a porta pela qual os outros domínios perguntam "esta pessoa participa da
 * viagem?" sem consultar `trip_members` por conta própria.
 */
export function exigirMembroNaTx(tx: Tx, tripId: string, userId: string): Promise<PapelNaViagem> {
  return exigirMembro((t, u) => papelNaViagem(tx, t, u), tripId, userId)
}

export function exigirDonoNaTx(tx: Tx, tripId: string, userId: string): Promise<void> {
  return exigirDono((t, u) => papelNaViagem(tx, t, u), tripId, userId)
}

/**
 * Papel de qualquer pessoa na viagem, ou `null` se ela não participa. Para
 * regra que pergunta por um terceiro — o participante de um rateio, por exemplo.
 */
export function papelNaViagemTx(tx: Tx, tripId: string, userId: string): Promise<string | null> {
  return papelNaViagem(tx, tripId, userId)
}
