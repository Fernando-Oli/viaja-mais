import { createMiddleware } from "hono/factory"
import { naoAutenticado } from "../../lib/erros"
import { auth } from "../auth/auth"
import type { Identidade } from "../db/como-usuario"

export type VariaveisSessao = { usuario: Identidade }

/**
 * Exige sessão válida e põe o usuário em `c.var.usuario`.
 *
 * `getSession` consulta `auth.sessions` a cada requisição: confere assinatura do
 * cookie, existência e expiração. Não é decodificar um token — é o equivalente
 * ao `getUser()` do Supabase, e não ao `getSession()`, que só lia o cookie.
 *
 * O `proxy.ts` do Next faz uma checagem otimista (só a presença do cookie) para
 * redirecionar telas. A decisão de verdade é esta.
 *
 * @RNF02.3 sessão validada no servidor a cada requisição
 */
export const exigirSessao = createMiddleware<{ Variables: VariaveisSessao }>(async (c, next) => {
  // Módulos montados dentro de /api/trips/:tripId/... passam pelo middleware do
  // módulo de viagens e pelo próprio. A sessão é validada uma vez por requisição.
  if (c.get("usuario")) return next()
  const sessao = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!sessao) throw naoAutenticado()
  c.set("usuario", { id: sessao.user.id, email: sessao.user.email })
  await next()
})
