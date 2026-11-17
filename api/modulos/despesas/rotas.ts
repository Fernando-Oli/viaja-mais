import { Hono } from "hono"
import { ErroHttp, naoEncontrado, semPermissao } from "../../../lib/erros"
import { atualizarDespesaSchema, criarDespesaSchema, type Rateio } from "../../../lib/schemas/despesa"
import { calcularRateio, ErroRateio, type Parte } from "../../../lib/finance/rateio"
import type { PapelNaViagem } from "../../../lib/authz/trip"
import { comoUsuario, type Tx } from "../../db/como-usuario"
import { respostaInvalida } from "../../http/erros"
import { lerCorpo, lerUuid } from "../../http/parametros"
import { exigirSessao, type VariaveisSessao } from "../../http/sessao"
import { exigirMembroNaTx, papelNaViagemTx } from "../viagens/acesso"
import * as repo from "./repositorio"

/**
 * Despesas de uma viagem, montadas em `/api/trips/:tripId/expenses`. Portadas
 * de `app/api/trips/[tripId]/expenses/**`, no molde de `api/modulos/reservas/rotas.ts`.
 *
 * Diferença em relação à reserva: qualquer membro **lança** despesa, mas só
 * quem a registrou, ou o dono da viagem, a lê sozinha, edita ou exclui —
 * despesa é dinheiro de alguém específico.
 *
 * Despesa e partes agora são gravadas na mesma transação. A rota do Next fazia
 * duas chamadas ao PostgREST e, se as partes falhassem, desfazia a despesa à
 * mão; aqui o rollback é do banco.
 *
 * @RF06.1 adicionar despesa · @RF04.6 membros podem adicionar despesas
 * @RF06.2 editar despesa · @RF06.3 excluir despesa
 * @RF06.9 tipo de rateio · @RF06.10 valor devido por membro (`expense_shares`)
 * @RNF08.1 a soma das partes iguala o valor da despesa
 */
export const rotasDespesas = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)

  .get("/", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const expenses = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return repo.listar(tx, tripId)
    })
    return c.json({ expenses })
  })

  .post("/", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const analise = criarDespesaSchema.safeParse(await lerCorpo(c))

    const criada = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      if (!analise.success) return null

      // Campo a campo. `id`, `trip_id` e `user_id` não estão no schema.
      const { rateio, amount, ...campos } = analise.data
      // O total vai a centavos uma vez só; é esse inteiro que vai para o banco
      // e para o rateio, e por isso a soma das partes fecha.
      const totalCentavos = Math.round(amount * 100)
      // Rateio validado antes de qualquer escrita.
      const partes = rateio ? await calcularPartes(tx, tripId, totalCentavos, rateio) : null

      const expense = await repo.criar(tx, tripId, c.var.usuario.id, campos, totalCentavos, rateio?.tipo)
      if (!partes) return { expense }
      const shares = await repo.gravarPartes(tx, expense.id, partes)
      return { expense, shares }
    })
    if (!analise.success) return respostaInvalida(c, analise.error)
    return c.json(criada)
  })

  .get("/:expenseId", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const expenseId = lerUuid(c.req.param(), "expenseId", "despesa")
    const expense = await comoUsuario(c.var.usuario, (tx) => despesaAlteravel(tx, tripId, expenseId, c.var.usuario.id))
    return c.json({ expense })
  })

  .patch("/:expenseId", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const expenseId = lerUuid(c.req.param(), "expenseId", "despesa")
    const analise = atualizarDespesaSchema.safeParse(await lerCorpo(c))

    const expense = await comoUsuario(c.var.usuario, async (tx) => {
      const despesa = await despesaAlteravel(tx, tripId, expenseId, c.var.usuario.id)
      if (!analise.success) return null

      const { amount, ...campos } = analise.data
      const totalCentavos = amount === undefined ? undefined : Math.round(amount * 100)
      const mudouValor = totalCentavos !== undefined && totalCentavos !== Math.round(Number(despesa.amount) * 100)
      const partes = mudouValor ? await partesParaNovoTotal(tx, despesa, totalCentavos) : null

      const atualizada = await repo.atualizar(tx, tripId, expenseId, campos, totalCentavos)
      if (!atualizada) throw naoEncontrado("Despesa")
      if (partes) await repo.gravarPartes(tx, expenseId, partes)
      return atualizada
    })
    if (!analise.success) return respostaInvalida(c, analise.error)
    return c.json({ expense })
  })

  .delete("/:expenseId", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const expenseId = lerUuid(c.req.param(), "expenseId", "despesa")
    await comoUsuario(c.var.usuario, async (tx) => {
      await despesaAlteravel(tx, tripId, expenseId, c.var.usuario.id)
      if (!(await repo.excluir(tx, tripId, expenseId))) throw naoEncontrado("Despesa")
    })
    return c.json({ success: true })
  })

/**
 * `/api/expenses`: despesas de todas as viagens do usuário, para a tela de
 * finanças. O filtro é a participação do próprio usuário; a RLS filtra de novo.
 *
 * @RF06.4 visualizar total de gastos · @RF06.5 gastos por categoria
 */
export const rotasDespesasDoUsuario = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)
  .get("/", async (c) => {
    const expenses = await comoUsuario(c.var.usuario, (tx) => repo.doUsuario(tx, c.var.usuario.id))
    return c.json({ expenses })
  })

/**
 * A despesa da viagem da URL, se quem pede pode alterá-la: membro da viagem
 * (403), despesa desta viagem (404) e autor dela ou dono da viagem (403).
 */
async function despesaAlteravel(tx: Tx, tripId: string, expenseId: string, userId: string): Promise<repo.Despesa> {
  const papel: PapelNaViagem = await exigirMembroNaTx(tx, tripId, userId)
  const despesa = await repo.buscar(tx, tripId, expenseId)
  if (!despesa) throw naoEncontrado("Despesa")
  if (despesa.user_id !== userId && papel !== "owner") {
    throw semPermissao("esta despesa, restrita a quem a registrou ou ao dono da viagem")
  }
  return despesa
}

/**
 * Confere que todo participante é membro da viagem e calcula as partes.
 *
 * A RLS de `expense_shares` só pergunta se **quem grava** participa da viagem —
 * não se a pessoa a quem a parte é atribuída participa. Sem esta checagem, um
 * membro lançaria dívida em nome de qualquer conta do sistema.
 */
async function calcularPartes(tx: Tx, tripId: string, totalCentavos: number, rateio: Rateio): Promise<Parte[]> {
  const papeis = await Promise.all(rateio.participantes.map((p) => papelNaViagemTx(tx, tripId, p.user_id)))
  if (papeis.some((papel) => papel === null)) {
    throw new ErroHttp(400, "Todo participante do rateio precisa ser membro da viagem")
  }
  return comoErroHttp(() => calcularRateio(totalCentavos, rateio))
}

/**
 * Partes recalculadas para o novo total, com os mesmos participantes e pesos.
 * A constraint trigger da soma só dispara quando as partes mudam, não quando
 * `expenses.amount` muda — por isso a rota refaz as partes junto com o valor.
 */
async function partesParaNovoTotal(tx: Tx, despesa: repo.Despesa, totalCentavos: number): Promise<Parte[] | null> {
  const partes = await repo.partesDa(tx, despesa.id)
  if (partes.length === 0) return null

  if (partes.some((p) => p.settled_at)) {
    throw new ErroHttp(409, "Parte desta despesa já foi quitada: o valor não pode mais mudar")
  }
  if (despesa.split_type === "weight") {
    return comoErroHttp(() =>
      calcularRateio(totalCentavos, {
        tipo: "weight",
        participantes: partes.map((p) => ({ user_id: p.user_id, peso: Number(p.weight) })),
      }),
    )
  }
  if (despesa.split_type === "equal") {
    return comoErroHttp(() =>
      calcularRateio(totalCentavos, { tipo: "equal", participantes: partes.map((p) => ({ user_id: p.user_id })) }),
    )
  }
  // Valor exato: não há como adivinhar quanto cabe a cada um no total novo.
  throw new ErroHttp(409, "O rateio desta despesa é por valor exato: exclua e lance de novo com o valor certo")
}

function comoErroHttp<T>(fn: () => T): T {
  try {
    return fn()
  } catch (erro) {
    if (erro instanceof ErroRateio) throw new ErroHttp(400, erro.message)
    throw erro
  }
}
