import { Hono } from "hono"
import { naoEncontrado } from "../../../lib/erros"
import { atualizarReservaSchema, criarReservaSchema } from "../../../lib/schemas/reserva"
import { comoUsuario } from "../../db/como-usuario"
import { respostaInvalida } from "../../http/erros"
import { lerCorpo, lerUuid } from "../../http/parametros"
import { exigirSessao, type VariaveisSessao } from "../../http/sessao"
import { exigirMembroNaTx } from "../viagens/acesso"
import * as repo from "./repositorio"

/**
 * Reservas de uma viagem, montadas em `/api/trips/:tripId/bookings`. Portadas
 * de `app/api/trips/[tripId]/bookings/**`, no molde de `api/modulos/viagens/rotas.ts`.
 *
 * Qualquer membro cadastra e edita: a reserva é do grupo.
 *
 * @RF07.7 visualizar reservas · @RF07.1 @RF07.2 @RF07.3 @RF07.4 adicionar reserva
 * @RF07.5 editar reserva · @RF07.6 excluir reserva
 */
export const rotasReservas = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)

  .get("/", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const bookings = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return repo.listar(tx, tripId)
    })
    return c.json({ bookings })
  })

  .post("/", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const analise = criarReservaSchema.safeParse(await lerCorpo(c))

    const booking = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return analise.success ? repo.criar(tx, tripId, c.var.usuario.id, analise.data) : null
    })
    if (!analise.success) return respostaInvalida(c, analise.error)
    return c.json({ booking })
  })

  .get("/:bookingId", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const bookingId = lerUuid(c.req.param(), "bookingId", "reserva")
    const booking = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return repo.buscar(tx, tripId, bookingId)
    })
    if (!booking) throw naoEncontrado("Reserva")
    return c.json({ booking })
  })

  .patch("/:bookingId", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const bookingId = lerUuid(c.req.param(), "bookingId", "reserva")
    const analise = atualizarReservaSchema.safeParse(await lerCorpo(c))

    const booking = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return analise.success ? repo.atualizar(tx, tripId, bookingId, analise.data) : null
    })
    if (!analise.success) return respostaInvalida(c, analise.error)
    if (!booking) throw naoEncontrado("Reserva")
    return c.json({ booking })
  })

  .delete("/:bookingId", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const bookingId = lerUuid(c.req.param(), "bookingId", "reserva")
    const apagou = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return repo.excluir(tx, tripId, bookingId)
    })
    if (!apagou) throw naoEncontrado("Reserva")
    return c.json({ success: true })
  })

/**
 * `/api/bookings`: reservas de todas as viagens do usuário, para a tela de
 * reservas. O filtro é a participação do próprio usuário; a RLS filtra de novo.
 *
 * @RF07.7 visualizar reservas
 */
export const rotasReservasDoUsuario = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)
  .get("/", async (c) => {
    const bookings = await comoUsuario(c.var.usuario, (tx) => repo.doUsuario(tx, c.var.usuario.id))
    return c.json({ bookings })
  })
