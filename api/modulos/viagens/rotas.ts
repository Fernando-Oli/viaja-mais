import { Hono } from "hono"
import { z } from "zod"
import { exigirDono, exigirMembro } from "../../../lib/authz/trip"
import { ErroHttp } from "../../../lib/erros"
import { atualizarViagemSchema } from "../../../lib/schemas/viagem"
import { comoUsuario } from "../../db/como-usuario"
import { respostaInvalida } from "../../http/erros"
import { exigirSessao, type VariaveisSessao } from "../../http/sessao"
import * as repo from "./repositorio"

/**
 * ROTA DE REFERÊNCIA DA API — o molde de toda rota portada do Next.
 *
 * Os cinco passos do molde antigo (`app/api/trips/[tripId]/route.ts`) continuam,
 * cada um num lugar:
 *
 *   1. parâmetros  — validados com zod; id que não é UUID é 400, não 500.
 *   2. sessão      — `exigirSessao`, que consulta auth.sessions a cada requisição.
 *   3. autorização — `exigirMembro` / `exigirDono`, explícitos, antes de tocar o
 *                    dado. Estar autenticado não é estar autorizado.
 *   4. corpo       — zod, e os campos extraídos um a um no repositório.
 *   5. erros       — lançados; `app.onError` (api/http/erros.ts) responde.
 *
 * E um sexto, novo: tudo dentro de `comoUsuario()`, que roda a transação como
 * o usuário. A RLS é a segunda linha de defesa, não a única.
 *
 * Os quatro testes que toda rota precisa ter: 200 feliz, 401 sem sessão,
 * 403 para quem não participa, 400 para payload inválido
 * (tests/integracao/viagens.test.ts).
 *
 * @RF03.5 visualizar detalhes da viagem · @RF03.2 editar viagem · @RF03.3 excluir viagem
 */

const parametros = z.object({ tripId: z.string().uuid("id de viagem inválido") })

function lerTripId(param: Record<string, string>) {
  const analise = parametros.safeParse(param)
  if (!analise.success) throw new ErroHttp(400, "id de viagem inválido")
  return analise.data.tripId
}

export const rotasViagens = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)

  .get("/:tripId", async (c) => {
    const tripId = lerTripId(c.req.param())
    const usuario = c.var.usuario

    const trip = await comoUsuario(usuario, async (tx) => {
      await exigirMembro((t, u) => repo.papelNaViagem(tx, t, u), tripId, usuario.id)
      return repo.buscarViagem(tx, tripId)
    })

    if (!trip) throw new ErroHttp(404, "Viagem não encontrada")
    return c.json({ trip })
  })

  .patch("/:tripId", async (c) => {
    const tripId = lerTripId(c.req.param())
    const usuario = c.var.usuario

    const corpo = await c.req.json().catch(() => null)
    const analise = atualizarViagemSchema.safeParse(corpo)

    const trip = await comoUsuario(usuario, async (tx) => {
      // Autorização antes da validação: quem não é dono recebe 403 sem saber
      // se o corpo que mandou estava certo.
      await exigirDono((t, u) => repo.papelNaViagem(tx, t, u), tripId, usuario.id)
      if (!analise.success) return null
      return repo.atualizarViagem(tx, tripId, analise.data)
    })

    if (!analise.success) return respostaInvalida(c, analise.error)
    // Mensagem genérica: a do Postgres revela coluna e constraint (RNF02.11).
    if (!trip) throw new ErroHttp(400, "Não foi possível salvar a viagem")
    return c.json({ trip })
  })

  .delete("/:tripId", async (c) => {
    const tripId = lerTripId(c.req.param())
    const usuario = c.var.usuario

    // Excluir é irreversível e apaga em cascata itinerário, despesas e reservas
    // de todos os membros — por isso é restrito ao dono, não a qualquer membro.
    const apagou = await comoUsuario(usuario, async (tx) => {
      await exigirDono((t, u) => repo.papelNaViagem(tx, t, u), tripId, usuario.id)
      return repo.excluirViagem(tx, tripId)
    })

    if (!apagou) throw new ErroHttp(400, "Não foi possível excluir a viagem")
    return c.json({ success: true })
  })
