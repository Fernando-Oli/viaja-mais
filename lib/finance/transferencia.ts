/**
 * Validação de um pagamento do acerto de contas contra o saldo atual.
 *
 * Função pura, sem I/O. Recebe o acerto já montado por `montarAcerto()` — que
 * delega o cálculo a `lib/finance/balances.ts` — e o pagamento pedido. Não
 * calcula saldo nenhum: só compara o pedido com o saldo que já foi calculado,
 * sempre em centavos inteiros.
 *
 * O que fica de fora daqui, de propósito: *quem* pode registrar. Isso é
 * autorização (a rota responde 403 quando o pagador não é quem está na
 * sessão), não regra de saldo.
 *
 * @RF06.13 registrar como paga uma transferência do acerto
 */

import { paraCentavos } from "@/lib/finance/balances"
import { formatarCentavos } from "@/lib/finance/rateio"
import type { Acerto } from "@/lib/finance/acerto"

/** O pagamento pedido. Valor em centavos inteiros, como todo cálculo de `lib/finance/`. */
export interface PedidoTransferencia {
  de: string
  para: string
  valorCentavos: number
  moeda: string
}

export type MotivoRecusa =
  | "mesma-pessoa"
  | "valor-invalido"
  | "moeda-sem-saldo"
  | "pagador-fora-do-acerto"
  | "recebedor-fora-do-acerto"
  | "pagador-sem-divida"
  | "recebedor-sem-credito"
  | "acima-da-divida"
  | "acima-do-credito"

export class ErroTransferencia extends Error {
  constructor(
    readonly motivo: MotivoRecusa,
    message: string,
  ) {
    super(message)
    this.name = "ErroTransferencia"
  }
}

/**
 * Confere o pagamento e devolve o saldo de cada lado (em centavos) depois dele.
 * Lança `ErroTransferencia` no primeiro motivo de recusa.
 *
 * Regras, nesta ordem:
 *   1. pagador e recebedor diferentes;
 *   2. valor inteiro e maior que zero (em centavos: duas casas no máximo já
 *      foram garantidas na conversão);
 *   3. a moeda é a de um grupo de saldo do acerto;
 *   4. os dois estão no acerto daquela moeda — membro da viagem, ou quem saiu
 *      dela com movimento em aberto;
 *   5. o pagador deve e o recebedor tem a receber;
 *   6. o valor não passa da dívida do pagador nem do crédito do recebedor.
 *
 * Pagamento parcial é permitido: qualquer valor até o menor dos dois limites.
 */
export function validarTransferencia(
  acerto: Acerto,
  pedido: PedidoTransferencia,
): { saldoPagadorCentavos: number; saldoRecebedorCentavos: number } {
  const { de, para, valorCentavos, moeda } = pedido

  if (de === para) {
    throw new ErroTransferencia("mesma-pessoa", "Pagador e recebedor precisam ser pessoas diferentes")
  }
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) {
    throw new ErroTransferencia("valor-invalido", "O valor do pagamento deve ser maior que zero, com até duas casas")
  }

  const grupo = acerto.grupos.find((g) => g.moeda === moeda)
  if (!grupo) {
    throw new ErroTransferencia("moeda-sem-saldo", `Não há saldo em ${moeda} nesta viagem`)
  }

  const saldoDe = grupo.saldos.find((s) => s.userId === de)
  if (!saldoDe) {
    throw new ErroTransferencia("pagador-fora-do-acerto", "O pagador não participa do acerto desta viagem")
  }
  const saldoPara = grupo.saldos.find((s) => s.userId === para)
  if (!saldoPara) {
    throw new ErroTransferencia("recebedor-fora-do-acerto", "O recebedor não participa do acerto desta viagem")
  }

  // Saldo negativo é dívida; positivo, crédito. Em centavos, para comparar exato.
  const dividaCentavos = -paraCentavos(saldoDe.valor)
  const creditoCentavos = paraCentavos(saldoPara.valor)

  if (dividaCentavos <= 0) {
    throw new ErroTransferencia("pagador-sem-divida", "O pagador não tem dívida em aberto nesta moeda")
  }
  if (creditoCentavos <= 0) {
    throw new ErroTransferencia("recebedor-sem-credito", "O recebedor não tem valor a receber nesta moeda")
  }
  if (valorCentavos > dividaCentavos) {
    throw new ErroTransferencia(
      "acima-da-divida",
      `O valor passa da dívida atual do pagador (${formatarCentavos(dividaCentavos, moeda)})`,
    )
  }
  if (valorCentavos > creditoCentavos) {
    throw new ErroTransferencia(
      "acima-do-credito",
      `O valor passa do que o recebedor tem a receber (${formatarCentavos(creditoCentavos, moeda)})`,
    )
  }

  return {
    saldoPagadorCentavos: -dividaCentavos + valorCentavos,
    saldoRecebedorCentavos: creditoCentavos - valorCentavos,
  }
}
