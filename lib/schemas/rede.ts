import { z } from "zod"
import { formatoUsernameSchema } from "./perfil"

/**
 * Contrato da consulta das listas de seguidores e de seguindo
 * (GET /api/social/perfis/[username]/seguidores e /seguindo): sem parâmetro, a
 * primeira página; com `cursor`, a página depois da pessoa do cursor. O cursor é
 * um username, no mesmo formato da leitura de perfil: fora dele, nenhuma pessoa
 * pode tê-lo, e a rota responde 400 sem consultar o banco.
 *
 * @RF09.6 listas de seguidores e de seguindo
 */
export const consultaRedeSchema = z.object({
  cursor: formatoUsernameSchema.optional(),
})
