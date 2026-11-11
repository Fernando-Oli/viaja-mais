/**
 * Rateio de uma despesa entre os participantes da viagem.
 *
 * Tudo aqui trabalha em **centavos inteiros**. Em ponto flutuante,
 * 0.1 + 0.2 = 0.30000000000000004, e a constraint trigger de `expense_shares`
 * exige que a soma das partes feche com o valor da despesa no centavo
 * (RNF-08.1). Por isso a regra é: converter para centavos na entrada, calcular
 * em inteiros, e só voltar para reais na hora de gravar ou exibir.
 *
 * As funções são puras e são usadas nos dois lados: a tela mostra a prévia com
 * elas, e o route handler **recalcula** com elas — o servidor não aceita as
 * partes que o navegador calculou.
 *
 * @RF06.9 tipo de rateio: igual, por peso ou por valor exato
 * @RF06.10 cálculo do valor devido por membro
 */

/** Os mesmos valores do CHECK de `expenses.split_type`. */
export const TIPOS_RATEIO = ["equal", "weight", "exact"] as const
export type TipoRateio = (typeof TIPOS_RATEIO)[number]

export const ROTULO_TIPO_RATEIO: Record<TipoRateio, string> = {
  equal: "Igual",
  weight: "Por peso",
  exact: "Valor exato",
}

/** Teto de `numeric(6,2)`, o tipo de `expense_shares.weight`. */
export const PESO_MAXIMO = 9999.99

/** Parte de um participante, já em centavos. */
export interface Parte {
  userId: string
  centavos: number
  /** Só no rateio por peso; nulo nos outros, como na coluna. */
  peso: number | null
}

export class ErroRateio extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ErroRateio"
  }
}

// ---------------------------------------------------------------------------
// Conversão
// ---------------------------------------------------------------------------

const DECIMAL = /^\d+([.,]\d{1,2})?$/

/**
 * Converte um valor em reais para centavos sem passar por multiplicação em
 * float: "10,05" vira 1005 lendo os dígitos, não fazendo 10.05 * 100.
 *
 * Devolve `null` para o que não é um valor monetário válido: vazio, negativo,
 * texto, ou mais de duas casas decimais (que o banco arredondaria em silêncio,
 * e aí a soma deixaria de fechar).
 */
export function reaisParaCentavos(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined) return null
  const texto = (typeof valor === "number" ? formatarNumero(valor) : valor).trim()
  if (!texto || !DECIMAL.test(texto)) return null

  const [inteiro, fracao = ""] = texto.replace(",", ".").split(".")
  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"))
  return Number.isSafeInteger(centavos) ? centavos : null
}

/** `number` para texto sem notação científica; `NaN`/infinito viram inválido. */
function formatarNumero(n: number): string {
  if (!Number.isFinite(n)) return ""
  // Um número com até duas casas sobrevive a `toFixed(2)` sem mudar; um com mais
  // casas não — e é isso que a comparação detecta.
  const fixo = n.toFixed(2)
  return Number(fixo) === n ? fixo : String(n)
}

export function centavosParaReais(centavos: number): number {
  return centavos / 100
}

export function formatarCentavos(centavos: number, moeda = "BRL"): string {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: moeda }).format(centavos / 100)
  } catch {
    // Código de moeda que o Intl não conhece: mostra o número, sem quebrar a tela.
    return `${moeda} ${(centavos / 100).toFixed(2)}`
  }
}

/** Peso em centésimos inteiros (2 → 200, 1,5 → 150), ou `null` se inválido. */
export function pesoParaCentesimos(peso: string | number | null | undefined): number | null {
  const centesimos = reaisParaCentavos(peso)
  if (centesimos === null || centesimos <= 0) return null
  if (centesimos > Math.round(PESO_MAXIMO * 100)) return null
  return centesimos
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

function exigirTotal(totalCentavos: number): void {
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos <= 0) {
    throw new ErroRateio("O valor da despesa deve ser maior que zero")
  }
}

function exigirParticipantes(ids: string[]): void {
  if (ids.length === 0) throw new ErroRateio("Selecione ao menos um participante")
  if (new Set(ids).size !== ids.length) throw new ErroRateio("Participante repetido no rateio")
}

/**
 * Ordem de desempate do rateio: `user_id` crescente, por comparação simples de
 * string. Não usa `localeCompare`, que depende do locale e do ICU de cada
 * ambiente e poderia ordenar diferente no navegador e no servidor. Para UUID
 * em minúsculas, é a mesma ordem do `order by user_id` do Postgres.
 */
function compararIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Divisão igual. O resto da divisão inteira é distribuído um centavo por vez,
 * seguindo os participantes em ordem crescente de `user_id`:
 * R$ 10,00 / 3 = 3,34 + 3,33 + 3,33, e o 3,34 fica com o menor id.
 * Ninguém paga mais de um centavo acima de outro, e a soma fecha sempre.
 *
 * A ordem de entrada não muda o valor de ninguém, só a ordem da lista
 * devolvida. Sem isso, a criação (ordem do formulário) e a edição (partes
 * lidas do banco) davam o centavo a pessoas diferentes (Issue #36).
 *
 * @RNF08.1 cálculo do rateio determinístico
 */
export function dividirIgual(totalCentavos: number, userIds: string[]): Parte[] {
  exigirTotal(totalCentavos)
  exigirParticipantes(userIds)

  const base = Math.floor(totalCentavos / userIds.length)
  const resto = totalCentavos - base * userIds.length
  const comCentavoExtra = new Set([...userIds].sort(compararIds).slice(0, resto))

  return userIds.map((userId) => ({ userId, centavos: base + (comCentavoExtra.has(userId) ? 1 : 0), peso: null }))
}

/**
 * Divisão proporcional ao peso, pelo método do maior resto: cada um recebe a
 * parte inteira da sua cota, e os centavos que sobram vão para quem teve a
 * maior fração descartada. Empate de fração: `user_id` crescente, a mesma
 * ordem da divisão igual, para o resultado não depender da ordem de entrada.
 *
 * Em `BigInt` porque total (até ~10¹⁰ centavos) × peso (até ~10⁶ centésimos)
 * passa de `Number.MAX_SAFE_INTEGER`.
 *
 * @RNF08.1 cálculo do rateio determinístico
 */
export function dividirPorPeso(totalCentavos: number, entradas: { userId: string; peso: number }[]): Parte[] {
  exigirTotal(totalCentavos)
  exigirParticipantes(entradas.map((e) => e.userId))

  const centesimos = entradas.map((e) => {
    const c = pesoParaCentesimos(e.peso)
    if (c === null) {
      throw new ErroRateio(`Peso inválido: use um número maior que zero e até ${PESO_MAXIMO}, com até duas casas`)
    }
    return BigInt(c)
  })

  const total = BigInt(totalCentavos)
  const somaPesos = centesimos.reduce((a, b) => a + b, BigInt(0))

  const cotas = centesimos.map((p, i) => {
    const bruto = total * p
    return { i, userId: entradas[i].userId, inteiro: bruto / somaPesos, resto: bruto % somaPesos }
  })

  let sobra = total - cotas.reduce((a, c) => a + c.inteiro, BigInt(0))
  const porResto = [...cotas].sort((a, b) =>
    a.resto === b.resto ? compararIds(a.userId, b.userId) : a.resto > b.resto ? -1 : 1,
  )
  const extra = new Array<number>(entradas.length).fill(0)
  for (const cota of porResto) {
    if (sobra <= BigInt(0)) break
    extra[cota.i] = 1
    sobra -= BigInt(1)
  }

  return entradas.map((e, i) => ({
    userId: e.userId,
    centavos: Number(cotas[i].inteiro) + extra[i],
    peso: Number(centesimos[i]) / 100,
  }))
}

export interface ConferenciaValorExato {
  somaCentavos: number
  /** Positivo: falta distribuir. Negativo: excedeu o total. Zero: fecha. */
  diferencaCentavos: number
  fecha: boolean
}

export function conferirValorExato(totalCentavos: number, partesCentavos: number[]): ConferenciaValorExato {
  const somaCentavos = partesCentavos.reduce((a, b) => a + b, 0)
  const diferencaCentavos = totalCentavos - somaCentavos
  return { somaCentavos, diferencaCentavos, fecha: diferencaCentavos === 0 }
}

/** Divisão por valor exato: cada um informa a própria parte, e a soma tem de fechar. */
export function dividirPorValorExato(
  totalCentavos: number,
  entradas: { userId: string; centavos: number }[],
): Parte[] {
  exigirTotal(totalCentavos)
  exigirParticipantes(entradas.map((e) => e.userId))

  for (const e of entradas) {
    if (!Number.isSafeInteger(e.centavos) || e.centavos < 0) {
      throw new ErroRateio("Valor inválido: informe um valor maior ou igual a zero, com até duas casas")
    }
  }

  const conferencia = conferirValorExato(totalCentavos, entradas.map((e) => e.centavos))
  if (!conferencia.fecha) {
    throw new ErroRateio(
      conferencia.diferencaCentavos > 0
        ? `A soma das partes não fecha: faltam ${formatarCentavos(conferencia.diferencaCentavos)}`
        : `A soma das partes não fecha: excede em ${formatarCentavos(-conferencia.diferencaCentavos)}`,
    )
  }

  return entradas.map((e) => ({ userId: e.userId, centavos: e.centavos, peso: null }))
}

/** Entrada do rateio no formato do contrato da API (`lib/schemas/despesa.ts`). */
export type EntradaRateio =
  | { tipo: "equal"; participantes: { user_id: string }[] }
  | { tipo: "weight"; participantes: { user_id: string; peso: number }[] }
  | { tipo: "exact"; participantes: { user_id: string; valor: string | number }[] }

/** Ponto único usado pelo route handler. Lança `ErroRateio` se não fechar. */
export function calcularRateio(totalCentavos: number, entrada: EntradaRateio): Parte[] {
  switch (entrada.tipo) {
    case "equal":
      return dividirIgual(
        totalCentavos,
        entrada.participantes.map((p) => p.user_id),
      )
    case "weight":
      return dividirPorPeso(
        totalCentavos,
        entrada.participantes.map((p) => ({ userId: p.user_id, peso: p.peso })),
      )
    case "exact":
      return dividirPorValorExato(
        totalCentavos,
        entrada.participantes.map((p) => ({ userId: p.user_id, centavos: reaisParaCentavos(p.valor) ?? -1 })),
      )
  }
}

// ---------------------------------------------------------------------------
// Avaliação do formulário
// ---------------------------------------------------------------------------

export interface ParticipanteFormulario {
  userId: string
  selecionado: boolean
  /** Texto do campo, como o usuário digitou. */
  peso: string
  valor: string
}

export interface AvaliacaoRateio {
  valido: boolean
  /** Motivo de o rateio não poder ser enviado; `null` quando válido. */
  erro: string | null
  /** Parte calculada de cada selecionado; vazio quando não há o que calcular. */
  partes: Parte[]
  /** Ids dos selecionados cujo peso/valor está inválido, para marcar o campo. */
  invalidos: string[]
  somaCentavos: number
  diferencaCentavos: number
}

/**
 * Lê o estado do formulário e diz se o rateio pode ser enviado, com a prévia de
 * cada parte. Não lança: a tela precisa de uma resposta a cada tecla digitada.
 */
export function avaliarRateio(
  totalTexto: string,
  tipo: TipoRateio,
  participantes: ParticipanteFormulario[],
  moeda = "BRL",
): AvaliacaoRateio {
  const selecionados = participantes.filter((p) => p.selecionado)
  const total = reaisParaCentavos(totalTexto)
  const vazio = { partes: [], invalidos: [], somaCentavos: 0, diferencaCentavos: total ?? 0 }

  if (total === null || total <= 0) {
    return { ...vazio, valido: false, erro: "Informe o valor da despesa" }
  }
  if (selecionados.length === 0) {
    return { ...vazio, valido: false, erro: "Selecione ao menos um participante" }
  }

  if (tipo === "equal") {
    const partes = dividirIgual(total, selecionados.map((p) => p.userId))
    return { valido: true, erro: null, partes, invalidos: [], somaCentavos: total, diferencaCentavos: 0 }
  }

  if (tipo === "weight") {
    const invalidos = selecionados.filter((p) => pesoParaCentesimos(p.peso) === null).map((p) => p.userId)
    if (invalidos.length > 0) {
      return {
        ...vazio,
        invalidos,
        valido: false,
        erro: `Informe um peso maior que zero (até ${PESO_MAXIMO.toLocaleString("pt-BR")}) para cada participante`,
      }
    }
    const partes = dividirPorPeso(
      total,
      selecionados.map((p) => ({ userId: p.userId, peso: (pesoParaCentesimos(p.peso) as number) / 100 })),
    )
    return { valido: true, erro: null, partes, invalidos: [], somaCentavos: total, diferencaCentavos: 0 }
  }

  // Valor exato: campo em branco conta como zero na soma, mas texto inválido ou
  // negativo bloqueia o envio.
  const invalidos = selecionados
    .filter((p) => p.valor.trim() !== "" && reaisParaCentavos(p.valor) === null)
    .map((p) => p.userId)
  const partes = selecionados.map((p) => ({
    userId: p.userId,
    centavos: reaisParaCentavos(p.valor) ?? 0,
    peso: null,
  }))
  const conferencia = conferirValorExato(
    total,
    partes.map((p) => p.centavos),
  )

  let erro: string | null = null
  if (invalidos.length > 0) {
    erro = "Valor inválido: use um número maior ou igual a zero, com até duas casas"
  } else if (conferencia.diferencaCentavos > 0) {
    erro = `Faltam ${formatarCentavos(conferencia.diferencaCentavos, moeda)} para fechar o total`
  } else if (conferencia.diferencaCentavos < 0) {
    erro = `A soma excede o total em ${formatarCentavos(-conferencia.diferencaCentavos, moeda)}`
  }

  return {
    valido: erro === null,
    erro,
    partes,
    invalidos,
    somaCentavos: conferencia.somaCentavos,
    diferencaCentavos: conferencia.diferencaCentavos,
  }
}
