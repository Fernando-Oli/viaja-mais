import { Hono } from "hono"
import { z } from "zod"
import { naoEncontrado } from "../../../lib/erros"
import { atualizarItemItinerarioSchema, criarItemItinerarioSchema } from "../../../lib/schemas/itinerario"
import { comoUsuario } from "../../db/como-usuario"
import { respostaInvalida } from "../../http/erros"
import { lerCorpo, lerUuid } from "../../http/parametros"
import { exigirSessao, type VariaveisSessao } from "../../http/sessao"
import { exigirMembroNaTx } from "../viagens/acesso"
import * as repo from "./repositorio"

/**
 * Itinerário de uma viagem, montado em `/api/trips/:tripId/itinerary`. Portado
 * de `app/api/trips/[tripId]/itinerary/**`, no molde de `api/modulos/viagens/rotas.ts`.
 *
 * `exigirMembro` e não `exigirDono`: montar o roteiro é trabalho do grupo (RF04.5).
 *
 * @RF05.1 adicionar atividade · @RF05.2 editar atividade · @RF05.3 excluir atividade
 * @RF05.4 visualizar itinerário
 */
export const rotasItinerario = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)

  .get("/", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const itinerary = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return repo.listar(tx, tripId)
    })
    return c.json({ itinerary })
  })

  .post("/", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const analise = criarItemItinerarioSchema.safeParse(await lerCorpo(c))

    // Autorização antes da validação: quem não participa recebe 403 sem saber
    // se o corpo estava certo.
    const item = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return analise.success ? repo.criar(tx, tripId, analise.data) : null
    })
    if (!analise.success) return respostaInvalida(c, analise.error)
    return c.json({ item })
  })

  .get("/:itemId", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const itemId = lerUuid(c.req.param(), "itemId", "atividade")
    const item = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return repo.buscar(tx, tripId, itemId)
    })
    if (!item) throw naoEncontrado("Atividade")
    return c.json({ item })
  })

  .patch("/:itemId", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const itemId = lerUuid(c.req.param(), "itemId", "atividade")
    const analise = atualizarItemItinerarioSchema.safeParse(await lerCorpo(c))

    const item = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return analise.success ? repo.atualizar(tx, tripId, itemId, analise.data) : null
    })
    if (!analise.success) return respostaInvalida(c, analise.error)
    if (!item) throw naoEncontrado("Atividade")
    return c.json({ item })
  })

  .delete("/:itemId", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const itemId = lerUuid(c.req.param(), "itemId", "atividade")
    const apagou = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return repo.excluir(tx, tripId, itemId)
    })
    if (!apagou) throw naoEncontrado("Atividade")
    return c.json({ success: true })
  })

const filtroAgenda = z.object({
  desde: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limite: z.coerce.number().int().min(1).max(100).default(20),
})

/**
 * `/api/itinerary`: próximas atividades de todas as viagens do usuário, para a
 * tela de agenda. Sem viagem na URL, não há o que autorizar: o filtro é a
 * participação do próprio usuário, e a RLS filtra de novo por baixo.
 *
 * @RF05.4 visualizar itinerário
 */
export const rotasAgenda = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)
  .get("/", async (c) => {
    const analise = filtroAgenda.safeParse(c.req.query())
    if (!analise.success) return respostaInvalida(c, analise.error)
    const desde = analise.data.desde ?? new Date().toISOString().slice(0, 10)

    const itinerary = await comoUsuario(c.var.usuario, (tx) =>
      repo.proximasDoUsuario(tx, c.var.usuario.id, desde, analise.data.limite),
    )
    return c.json({ itinerary })
  })
