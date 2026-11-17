import { Hono } from "hono"
import { z } from "zod"
import { ErroHttp, naoEncontrado } from "../../../lib/erros"
import { assinarAvatar } from "../../arquivos/avatares"
import { comoUsuario } from "../../db/como-usuario"
import { exigirSessao, type VariaveisSessao } from "../../http/sessao"

/**
 * Dados básicos de um perfil, por id. Quem consome é `context/auth-context.tsx`,
 * para o nome e o avatar do cabeçalho — por isso a resposta continua `{ profile }`.
 *
 * Portada de `app/api/profile/[userId]/route.ts`, no molde de
 * `api/modulos/viagens/rotas.ts`. Não há `exigirMembro`/`exigirDono`: perfil não
 * é recurso de viagem, e os dados básicos são visíveis a qualquer autenticado
 * (detalhamento do RF02). A RLS de `profiles` continua valendo por baixo.
 *
 * `avatar_url` sai como link assinado de validade curta: o banco guarda o
 * caminho no bucket privado (`api/arquivos/avatares.ts`).
 *
 * @RF02.1 visualizar perfil · @RNF02.11 erro do banco não vaza
 */

const parametros = z.object({ userId: z.string().uuid() })

export const rotasPerfis = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)

  .get("/:userId", async (c) => {
    const analise = parametros.safeParse(c.req.param())
    if (!analise.success) throw new ErroHttp(400, "Identificador de usuário inválido")

    const profile = await comoUsuario(c.var.usuario, (tx) =>
      tx
        .selectFrom("profiles")
        .select(["id", "full_name", "avatar_url", "created_at", "updated_at"])
        .where("id", "=", analise.data.userId)
        .executeTakeFirst(),
    )

    if (!profile) throw naoEncontrado("Perfil")
    c.header("Cache-Control", "private, no-store")
    return c.json({ profile: { ...profile, avatar_url: await assinarAvatar(profile) } })
  })
