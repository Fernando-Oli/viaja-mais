import { Hono } from "hono"
import { ErroHttp } from "../../../lib/erros"
import { registrarTransferenciaSchema } from "../../../lib/schemas/transferencia"
import { reaisParaCentavos } from "../../../lib/finance/rateio"
import { ErroTransferencia, validarTransferencia } from "../../../lib/finance/transferencia"
import { comoUsuario } from "../../db/como-usuario"
import { respostaInvalida } from "../../http/erros"
import { lerCorpo, lerUuid } from "../../http/parametros"
import { exigirSessao, type VariaveisSessao } from "../../http/sessao"
import { exigirMembroNaTx } from "../viagens/acesso"
import * as repo from "./repositorio"

/**
 * Acerto de contas de uma viagem, montado em `/api/trips/:tripId/acerto`.
 * Portado de `app/api/trips/[tripId]/acerto/**`.
 *
 * Sob RLS, sem service role: `expenses_select`, `expense_shares_select` e
 * `settlements_select`/`settlements_insert` são a segunda linha de defesa. A
 * conta é de `lib/finance/`; a rota só lê, confere e grava.
 *
 * @RF06.11 visualizar o saldo por membro (quem deve a quem)
 * @RF06.13 sugerir transferências e registrar como paga uma transferência
 * @RNF02.9 settlements visíveis e graváveis só por membros da viagem
 */
export const rotasAcerto = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)

  .get("/", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const acerto = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, c.var.usuario.id)
      return repo.carregarAcerto(tx, tripId, c.var.usuario.id)
    })
    return c.json(acerto)
  })

  /**
   * Registra um pagamento: `de` já pagou `valor` para `para`.
   *
   * - o pagador tem de ser quem está na sessão (403) — a policy exige o mesmo;
   * - o acerto é recalculado no servidor e o pedido conferido contra ele (422):
   *   o que o navegador mostrou não é aceito como verdade;
   * - `chave` é única por pagador: reenviar a mesma chave devolve 200 com o
   *   pagamento que já existe, em vez de gravar outro.
   *
   * A trava por viagem (`travarAcertoDaViagem`) vem antes da busca pela chave e
   * da conferência de saldo: dois envios simultâneos são atendidos um depois
   * do outro, e o segundo já enxerga o primeiro.
   */
  .post("/transferencias", async (c) => {
    const tripId = lerUuid(c.req.param(), "tripId", "viagem")
    const analise = registrarTransferenciaSchema.safeParse(await lerCorpo(c))
    if (!analise.success) return respostaInvalida(c, analise.error)

    // Campo a campo: nada do corpo além destes chega ao banco.
    const { de, para, valor, moeda, chave } = analise.data
    const valorCentavos = reaisParaCentavos(valor) as number
    const eu = c.var.usuario.id

    const { transferencia, nova } = await comoUsuario(c.var.usuario, async (tx) => {
      await exigirMembroNaTx(tx, tripId, eu)
      if (de !== eu) throw new ErroHttp(403, "Só quem pagou pode registrar o próprio pagamento")

      await repo.travarAcertoDaViagem(tx, tripId)

      // Reenvio: o saldo já inclui este pagamento, e conferir de novo daria
      // "acima da dívida". Responde com o que já existe.
      const anterior = await repo.pagamentoPorChave(tx, tripId, eu, chave)
      if (anterior) return { transferencia: anterior, nova: false }

      const acerto = await repo.carregarAcerto(tx, tripId, eu)
      try {
        validarTransferencia(acerto, { de, para, valorCentavos, moeda })
      } catch (erro) {
        if (erro instanceof ErroTransferencia) throw new ErroHttp(422, erro.message)
        throw erro
      }

      return { transferencia: await repo.registrarPagamento(tx, tripId, eu, { para, valorCentavos, moeda, chave }), nova: true }
    })
    return c.json({ transferencia }, nova ? 201 : 200)
  })
