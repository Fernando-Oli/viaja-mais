/**
 * Saldo por membro e minimização de transferências do acerto de contas.
 *
 * Funções puras, sem I/O: nada de Supabase, nada de `fetch`, nada que dependa
 * de React ou de ambiente de execução. `calcularSaldos` responde "quem deve a
 * quem" (RF-06.11); `minimizarTransferencias` sugere como fechar a conta com
 * poucas transferências (RF-06.13). Vivem no mesmo arquivo porque a segunda
 * consome exatamente o formato que a primeira devolve.
 *
 * Dinheiro é tratado em centavos (inteiro) por dentro: soma de float em reais
 * acumula erro (0.1 + 0.2 = 0.30000000000000004 em JS), e aqui a soma dos
 * saldos TEM que fechar em zero, exato — não "aproximadamente zero". A API
 * pública continua em reais, igual ao resto do código (`expenses.amount`, os
 * schemas de zod em `lib/schemas/`); a conversão para centavos é só uma borda
 * interna.
 *
 * Decisão de nomes e de arquivo vêm de `docs/plans/00-plano-norte.md` §T2 —
 * não são invenção desta atividade.
 */

/**
 * Converte reais (o formato de `expenses.amount` e dos schemas de zod) para
 * centavos inteiros.
 *
 * `toFixed(2)` primeiro, e só depois `* 100`: multiplicar direto carrega o
 * ruído de ponto flutuante do valor original para dentro da multiplicação
 * (`1.005 * 100` não é 100.5 em double). Arredondar a entrada para duas casas
 * decimais ainda como texto resolve o double correto antes de qualquer conta —
 * depois disso, o `* 100` é exato a menos de ruído muito menor que 0.5, que o
 * `Math.round` final absorve sem risco.
 */
export function paraCentavos(valorEmReais: number): number {
  return Math.round(Number(valorEmReais.toFixed(2)) * 100)
}

/** Converte centavos de volta para reais, para devolver no mesmo formato de sempre. */
export function paraReais(centavos: number): number {
  return centavos / 100
}

/** A parte de um participante numa despesa dividida. `valor` é a parte dele, em reais. */
export interface ParteDespesa {
  participanteId: string
  valor: number
}

/**
 * Uma despesa paga por alguém e dividida entre participantes. `partes` pode
 * incluir a parte do próprio pagador (quando ele também consumiu a despesa) —
 * `calcularSaldos` sabe ignorar essa parte, porque pagar a própria parte não
 * gera dívida com ninguém.
 */
export interface DespesaDividida {
  pagadorId: string
  partes: ParteDespesa[]
}

/**
 * Saldo de um participante: positivo é credor (o grupo deve a ele), negativo é
 * devedor (ele deve ao grupo). A soma de todos os saldos devolvidos por
 * `calcularSaldos` é sempre zero — toda dívida lançada tem um credor do outro lado.
 */
export interface Saldo {
  participanteId: string
  valor: number
}

/** Uma transferência sugerida para fechar a conta: `de` paga `valor` para `para`. */
export interface Transferencia {
  de: string
  para: string
  valor: number
}

/**
 * Saldo de cada participante a partir das despesas divididas de uma viagem.
 *
 * Para cada parte que não é do próprio pagador: o pagador fica credor daquele
 * valor (adiantou o dinheiro), e o participante da parte fica devedor dele. A
 * função não sabe nada sobre `expense_shares` quitado (`settled_at`) nem sobre
 * tipo de rateio — quem chama já filtra o que entra aqui.
 *
 * @RF06.11 visualizar o saldo por membro (quem deve a quem)
 */
export function calcularSaldos(despesas: DespesaDividida[]): Saldo[] {
  const saldosCentavos = new Map<string, number>()

  const ajustar = (participanteId: string, deltaCentavos: number) => {
    saldosCentavos.set(participanteId, (saldosCentavos.get(participanteId) ?? 0) + deltaCentavos)
  }

  for (const despesa of despesas) {
    // Garante que o pagador apareça no saldo mesmo que a despesa seja só dele
    // (ninguém deve nada a ele, mas ele existe como participante).
    ajustar(despesa.pagadorId, 0)

    for (const parte of despesa.partes) {
      if (parte.participanteId === despesa.pagadorId) continue

      const centavos = paraCentavos(parte.valor)
      ajustar(despesa.pagadorId, centavos)
      ajustar(parte.participanteId, -centavos)
    }
  }

  return Array.from(saldosCentavos, ([participanteId, centavos]) => ({
    participanteId,
    valor: paraReais(centavos),
  }))
}

/**
 * Transferências que fecham os saldos recebidos, com poucas movimentações: a
 * cada passo casa o maior credor com o maior devedor e transfere o quanto
 * couber dos dois — o algoritmo guloso clássico do problema de "min cash
 * flow". Isso não é prova de que o número de transferências é o mínimo global
 * possível (esse problema é NP-difícil em geral — é equivalente a partição de
 * subconjuntos), mas evita o caso ruim óbvio de "todo mundo acerta com todo
 * mundo" e colapsa cadeias de dívida (A deve a B, B deve a C vira A paga C
 * direto).
 *
 * Assume que `saldos` fecha em zero — exatamente o que `calcularSaldos`
 * devolve. Com entrada que não fecha, o lado que sobra fica sem par e
 * simplesmente não gera transferência para a diferença; a função não lança
 * erro nem inventa dinheiro para fechar a conta de quem chamou errado.
 *
 * @RF06.13 sugerir transferências para acerto de contas
 */
export function minimizarTransferencias(saldos: Saldo[]): Transferencia[] {
  type Pendencia = { participanteId: string; centavos: number }

  const credores: Pendencia[] = []
  const devedores: Pendencia[] = []

  for (const saldo of saldos) {
    const centavos = paraCentavos(saldo.valor)
    if (centavos > 0) credores.push({ participanteId: saldo.participanteId, centavos })
    else if (centavos < 0) devedores.push({ participanteId: saldo.participanteId, centavos: -centavos })
    // centavos === 0: já está quite, não entra em nenhuma das duas listas.
  }

  // Maior valor primeiro: casar sempre os dois extremos reduz o número de
  // transferências na prática (é a heurística padrão do "min cash flow").
  credores.sort((a, b) => b.centavos - a.centavos)
  devedores.sort((a, b) => b.centavos - a.centavos)

  const transferencias: Transferencia[] = []
  let i = 0
  let j = 0

  while (i < devedores.length && j < credores.length) {
    const devedor = devedores[i]
    const credor = credores[j]
    // Positivo sempre: as duas listas só guardam pendências com centavos > 0 e
    // um item só some de sua lista quando chega a exatamente zero, então nunca
    // se chega aqui com um dos dois já zerado.
    const centavosTransferidos = Math.min(devedor.centavos, credor.centavos)

    transferencias.push({
      de: devedor.participanteId,
      para: credor.participanteId,
      valor: paraReais(centavosTransferidos),
    })

    devedor.centavos -= centavosTransferidos
    credor.centavos -= centavosTransferidos

    if (devedor.centavos === 0) i++
    if (credor.centavos === 0) j++
  }

  return transferencias
}
