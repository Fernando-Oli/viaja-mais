/**
 * Acerto de contas de uma viagem: saldo por membro e transferências sugeridas.
 *
 * Função pura, sem I/O. Recebe as linhas que a rota leu do banco e devolve o
 * que a tela exibe. A matemática NÃO mora aqui: o saldo vem de
 * `calcularSaldos()` e as transferências de `minimizarTransferencias()`, ambos
 * de `lib/finance/balances.ts`. Este módulo só adapta a entrada, separa por
 * moeda e dá nome a cada participante.
 *
 * @RF06.11 visualizar o saldo por membro (quem deve a quem)
 * @RF06.13 sugerir transferências para acerto de contas
 */

import { calcularSaldos, minimizarTransferencias, type DespesaDividida } from "@/lib/finance/balances"

/** Moeda usada quando a viagem ainda não tem despesa nenhuma para dizer qual é. */
const MOEDA_PADRAO = "BRL"

/** Despesa como a rota lê de `expenses`. */
export interface DespesaLida {
  id: string
  paid_by: string
  currency: string | null
}

/** Parte como a rota lê de `expense_shares`. `amount` é numeric: pode chegar como texto. */
export interface ParteLida {
  expense_id: string
  user_id: string
  amount: number | string
  settled_at: string | null
}

/** Membro como a rota lê de `trip_members`. */
export interface MembroLido {
  user_id: string
  role: string
}

/** `ex`: tem parte ou pagou despesa em aberto, mas já não está em `trip_members`. */
export type PapelAcerto = "owner" | "member" | "ex"

export interface ParticipanteAcerto {
  userId: string
  rotulo: string
  papel: PapelAcerto
}

/** Saldo em reais: positivo tem a receber, negativo deve, zero está quite. */
export interface SaldoAcerto extends ParticipanteAcerto {
  valor: number
}

export interface TransferenciaAcerto {
  de: ParticipanteAcerto
  para: ParticipanteAcerto
  valor: number
}

export interface GrupoMoeda {
  moeda: string
  saldos: SaldoAcerto[]
  transferencias: TransferenciaAcerto[]
}

export interface Acerto {
  /** Um grupo por moeda: saldo em real e saldo em dólar não se somam. */
  grupos: GrupoMoeda[]
  totalDespesas: number
  /** Despesas sem nenhuma parte: não geram dívida e ficam fora do cálculo. */
  despesasSemRateio: number
  /** Há despesa rateada e ninguém deve nada a ninguém. */
  tudoAcertado: boolean
}

/**
 * Ordem e rótulos na mesma convenção da tela de nova despesa (S06): quem
 * consulta primeiro, depois o dono, depois os demais por id. "Participante N"
 * é a posição na lista, então o mesmo membro recebe o mesmo número nas duas
 * telas para quem as abre. Os nomes reais não vêm daqui: não há helper de
 * `profiles` que os exponha para membros de uma viagem.
 *
 * Quem saiu da viagem mas ainda tem dívida ou crédito em aberto continua no
 * acerto, depois dos membros: a dívida não some porque a pessoa saiu.
 */
function rotularParticipantes(
  membros: MembroLido[],
  exParticipantes: string[],
  usuarioAtualId: string,
): Map<string, ParticipanteAcerto> {
  const ordenados = [...membros].sort((a, b) => {
    if (a.user_id === usuarioAtualId) return -1
    if (b.user_id === usuarioAtualId) return 1
    if (a.role !== b.role) return a.role === "owner" ? -1 : 1
    return a.user_id.localeCompare(b.user_id)
  })

  const participantes = new Map<string, ParticipanteAcerto>()
  ordenados.forEach((m, i) => {
    participantes.set(m.user_id, {
      userId: m.user_id,
      rotulo: m.user_id === usuarioAtualId ? "Você" : `Participante ${i + 1}`,
      papel: m.role === "owner" ? "owner" : "member",
    })
  })

  const ex = [...exParticipantes].sort((a, b) => a.localeCompare(b))
  ex.forEach((userId, i) => {
    participantes.set(userId, {
      userId,
      rotulo: ex.length === 1 ? "Ex-participante" : `Ex-participante ${i + 1}`,
      papel: "ex",
    })
  })

  return participantes
}

/**
 * Monta o acerto de contas a partir do que foi lido do banco.
 *
 * Só partes em aberto (`settled_at` nulo) entram: uma parte quitada sai dos
 * dois lados de uma vez, porque `calcularSaldos()` lança cada parte como
 * crédito do pagador e débito do participante. A rota pode já ter filtrado;
 * filtrar de novo aqui deixa a função correta para qualquer chamador.
 */
export function montarAcerto(entrada: {
  despesas: DespesaLida[]
  partes: ParteLida[]
  membros: MembroLido[]
  usuarioAtualId: string
}): Acerto {
  const { despesas, partes, membros, usuarioAtualId } = entrada

  const despesaPorId = new Map(despesas.map((d) => [d.id, d]))
  const comAlgumaParte = new Set<string>()
  const abertasPorDespesa = new Map<string, ParteLida[]>()

  for (const parte of partes) {
    if (!despesaPorId.has(parte.expense_id)) continue
    comAlgumaParte.add(parte.expense_id)
    if (parte.settled_at) continue
    const lista = abertasPorDespesa.get(parte.expense_id) ?? []
    lista.push(parte)
    abertasPorDespesa.set(parte.expense_id, lista)
  }

  // Formato de `calcularSaldos()`, separado por moeda.
  const porMoeda = new Map<string, DespesaDividida[]>()
  for (const despesa of despesas) {
    const abertas = abertasPorDespesa.get(despesa.id)
    if (!abertas) continue
    const moeda = despesa.currency || MOEDA_PADRAO
    const lista = porMoeda.get(moeda) ?? []
    lista.push({
      pagadorId: despesa.paid_by,
      partes: abertas.map((p) => ({ participanteId: p.user_id, valor: Number(p.amount) })),
    })
    porMoeda.set(moeda, lista)
  }

  const calculos = [...porMoeda.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moeda, lista]) => {
      const saldos = calcularSaldos(lista)
      return { moeda, saldos, transferencias: minimizarTransferencias(saldos) }
    })

  const idsMembros = new Set(membros.map((m) => m.user_id))
  const exParticipantes = new Set<string>()
  for (const { saldos } of calculos) {
    for (const s of saldos) if (!idsMembros.has(s.participanteId)) exParticipantes.add(s.participanteId)
  }
  const participantes = rotularParticipantes(membros, [...exParticipantes], usuarioAtualId)
  const ordem = [...participantes.keys()]

  // Sem nenhuma despesa rateada, ainda assim a tela mostra cada membro com zero.
  const grupos = calculos.length
    ? calculos
    : [{ moeda: despesas[0]?.currency || MOEDA_PADRAO, saldos: [], transferencias: [] }]

  const resultado: GrupoMoeda[] = grupos.map(({ moeda, saldos, transferencias }) => {
    const valorPorId = new Map(saldos.map((s) => [s.participanteId, s.valor]))
    // Todo membro aparece em todo grupo; ex-participante, só onde tem movimento.
    const ids = ordem.filter((id) => idsMembros.has(id) || valorPorId.has(id))
    return {
      moeda,
      saldos: ids.map((id) => ({ ...(participantes.get(id) as ParticipanteAcerto), valor: valorPorId.get(id) ?? 0 })),
      transferencias: transferencias.map((t) => ({
        de: participantes.get(t.de) as ParticipanteAcerto,
        para: participantes.get(t.para) as ParticipanteAcerto,
        valor: t.valor,
      })),
    }
  })

  return {
    grupos: resultado,
    totalDespesas: despesas.length,
    despesasSemRateio: despesas.filter((d) => !comAlgumaParte.has(d.id)).length,
    // Quem já quitou tudo também está acertado: conta a despesa rateada, não a parte em aberto.
    tudoAcertado: comAlgumaParte.size > 0 && resultado.every((g) => g.transferencias.length === 0),
  }
}
