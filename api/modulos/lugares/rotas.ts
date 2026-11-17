import { Hono } from "hono"
import { ErroHttp, naoEncontrado } from "../../../lib/erros"
import { resumirAvaliacoes } from "../../../lib/lugares/avaliacoes"
import { avaliacaoSchema } from "../../../lib/schemas/avaliacao"
import { atualizarLugarSchema, criarLugarSchema } from "../../../lib/schemas/lugar"
import { comoUsuario, type Tx } from "../../db/como-usuario"
import { respostaInvalida } from "../../http/erros"
import { lerCorpo, lerUuid } from "../../http/parametros"
import { exigirSessao, type VariaveisSessao } from "../../http/sessao"
import { exigirMembroNaTx } from "../viagens/acesso"
import * as repo from "./repositorio"

/**
 * Lugares salvos de uma viagem e suas avaliações, montados em
 * `/api/trips/:tripId/places`. Portados de `app/api/trips/[tripId]/places/**`,
 * no molde de `api/modulos/viagens/rotas.ts`.
 *
 * @RF08.2 salvar lugar · @RF08.3 notas no lugar · @RF08.4 marcar visitado · @RF08.6 excluir lugar
 * @RF11.1 avaliar · @RF11.2 ver avaliações de outros · @RF11.3 editar/excluir a própria
 */

/** Código do Postgres para violação de unicidade. */
const VIOLACAO_UNICA = "23505"

/**
 * A avaliação se prende ao identificador do Google do lugar, não ao `places.id`:
 * o mesmo lugar salvo em outra viagem mostra as mesmas avaliações (RF11.2). A
 * URL passa pela viagem porque é dela que sai a autorização — só avalia quem
 * tem o lugar numa viagem de que participa, a regra da policy `place_reviews_insert`.
 */
async function lugarAvaliavel(tx: Tx, tripId: string, placeId: string, userId: string) {
  await exigirMembroNaTx(tx, tripId, userId)
  const lugar = await repo.lugarDaViagem(tx, tripId, placeId)
  if (!lugar) throw naoEncontrado("Lugar")
  if (!lugar.place_id) throw new ErroHttp(400, "Este lugar não veio da busca e não pode ser avaliado")
  return { nome: lugar.name, googlePlaceId: lugar.place_id }
}

function ids(param: Record<string, string>) {
  return { tripId: lerUuid(param, "tripId", "viagem"), placeId: lerUuid(param, "placeId", "lugar") }
}

export const rotasLugares = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)

  .get("/", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const places = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return repo.listar(tx, tripId)
    })
    return c.json({ places })
  })

  .post("/", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const analise = criarLugarSchema.safeParse(await lerCorpo(c))

    const place = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return analise.success ? repo.criar(tx, tripId, c.var.usuario.id, analise.data) : null
    })
    if (!analise.success) return respostaInvalida(c, analise.error)
    return c.json({ place })
  })

  .patch("/:placeId", async (c) => {
    const { tripId, placeId } = ids(c.req.param())
    const analise = atualizarLugarSchema.safeParse(await lerCorpo(c))

    const place = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return analise.success ? repo.atualizar(tx, tripId, placeId, analise.data) : null
    })
    if (!analise.success) return respostaInvalida(c, analise.error)
    if (!place) throw naoEncontrado("Lugar")
    return c.json({ place })
  })

  .delete("/:placeId", async (c) => {
    const { tripId, placeId } = ids(c.req.param())
    const apagou = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return repo.excluir(tx, tripId, placeId)
    })
    if (!apagou) throw naoEncontrado("Lugar")
    return c.json({ success: true })
  })

  .get("/:placeId/reviews", async (c) => {
    const { tripId, placeId } = ids(c.req.param())
    const usuario = c.var.usuario

    const avaliacoes = await comoUsuario(usuario, async (tx) => {
      const lugar = await lugarAvaliavel(tx, tripId, placeId, usuario.id)
      return repo.avaliacoes(tx, lugar.googlePlaceId)
    })

    return c.json({
      reviews: avaliacoes.map(({ full_name, ...a }) => ({
        ...a,
        autor: full_name ?? null,
        minha: a.user_id === usuario.id,
      })),
      resumo: resumirAvaliacoes(avaliacoes),
    })
  })

  // Uma avaliação por pessoa por lugar: a primeira cria, as seguintes editam.
  .put("/:placeId/reviews", async (c) => {
    const { tripId, placeId } = ids(c.req.param())
    const usuario = c.var.usuario
    const analise = avaliacaoSchema.safeParse(await lerCorpo(c))

    const resultado = await comoUsuario(usuario, async (tx) => {
      const lugar = await lugarAvaliavel(tx, tripId, placeId, usuario.id)
      if (!analise.success) return null
      const rating = analise.data.rating
      const comment = analise.data.comment || null

      const existente = await repo.minhaAvaliacao(tx, lugar.googlePlaceId, usuario.id)
      if (existente) {
        return { criada: false, review: await repo.editarAvaliacao(tx, existente.id, usuario.id, rating, comment) }
      }
      try {
        const review = await repo.criarAvaliacao(tx, {
          googlePlaceId: lugar.googlePlaceId,
          nome: lugar.nome,
          userId: usuario.id,
          rating,
          comment,
        })
        return { criada: true, review }
      } catch (erro) {
        // Dois envios simultâneos da mesma pessoa: o primeiro já gravou.
        if ((erro as { code?: string }).code === VIOLACAO_UNICA) {
          throw new ErroHttp(409, "Sua avaliação já foi salva; recarregue a página")
        }
        throw erro
      }
    })

    if (!analise.success) return respostaInvalida(c, analise.error)
    if (!resultado) throw new ErroHttp(400, "Não foi possível salvar a avaliação")
    return c.json({ review: resultado.review }, resultado.criada ? 201 : 200)
  })

  .delete("/:placeId/reviews", async (c) => {
    const { tripId, placeId } = ids(c.req.param())
    const usuario = c.var.usuario
    const apagou = await comoUsuario(usuario, async (tx) => {
      const lugar = await lugarAvaliavel(tx, tripId, placeId, usuario.id)
      return repo.excluirAvaliacao(tx, lugar.googlePlaceId, usuario.id)
    })
    if (!apagou) throw naoEncontrado("Avaliação")
    return c.json({ success: true })
  })

/**
 * `/api/places`: lugares de todas as viagens do usuário, para a tela de
 * lugares. O filtro é a participação do próprio usuário; a RLS filtra de novo.
 *
 * @RF08.2 salvar lugar
 */
export const rotasLugaresDoUsuario = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)
  .get("/", async (c) => {
    const places = await comoUsuario(c.var.usuario, (tx) => repo.doUsuario(tx, c.var.usuario.id))
    return c.json({ places })
  })
