import { z } from "zod"
import { formatoUsernameSchema } from "./perfil"

/**
 * Contrato de entrada de POST /api/social/pesquisas: quem foi aberto pela
 * pesquisa, para entrar no histórico.
 *
 * Só o username, no formato da leitura (`formatoUsernameSchema`, sem a lista de
 * reservados, que é regra de escrita do próprio perfil). Qualquer outro campo do
 * corpo é descartado: o dono do histórico vem da sessão, e a data, do banco.
 *
 * @RF09.12 histórico de pesquisa
 */
export const registrarPesquisaSchema = z.object({
  username: formatoUsernameSchema,
})
