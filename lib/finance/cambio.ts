/**
 * Conversão monetária pura.
 *
 * Todos os valores monetários entram e saem em centavos inteiros.
 *
 * Convenção da cotação:
 *   1 unidade da moeda de origem = taxa unidades da moeda de destino.
 *
 * Exemplo:
 *   origem USD, destino BRL, taxa 5,25
 *   USD 10,00 -> BRL 52,50
 *
 * A obtenção da cotação fica fora deste módulo. Não há I/O, HTTP ou banco.
 */

export type MotivoErroCambio =
  | "valor-invalido"
  | "moeda-invalida"
  | "taxa-ausente"
  | "taxa-invalida"
  | "resultado-fora-do-limite"

export class ErroCambio extends Error {
  constructor(
    readonly motivo: MotivoErroCambio,
    message: string,
  ) {
    super(message)
    this.name = "ErroCambio"
  }
}

export interface Conversao {
  valorCentavos: number
  moedaOrigem: string
  moedaDestino: string
  taxa?: string | number
}

export interface ValorEmMoeda {
  valorCentavos: number
  moeda: string
}

const CODIGO_MOEDA = /^[A-Z]{3}$/
const TAXA_DECIMAL = /^\d+(?:[.,]\d{1,8})?$/

function normalizarMoeda(moeda: string): string {
  const normalizada = moeda.trim().toUpperCase()

  if (!CODIGO_MOEDA.test(normalizada)) {
    throw new ErroCambio("moeda-invalida", "Use um código de moeda ISO com 3 letras")
  }

  return normalizada
}

function exigirValor(valorCentavos: number): void {
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos < 0) {
    throw new ErroCambio(
      "valor-invalido",
      "O valor deve ser um número inteiro de centavos maior ou igual a zero",
    )
  }
}

function textoDaTaxa(taxa: string | number): string {
  if (typeof taxa === "number") {
    if (!Number.isFinite(taxa)) return ""
    return String(taxa)
  }

  return taxa.trim()
}

/**
 * Transforma uma taxa decimal em uma fração inteira.
 *
 * 5,25 -> 525 / 100
 * 0,12345678 -> 12345678 / 100000000
 */
function taxaComoFracao(taxa: string | number): {
  numerador: bigint
  denominador: bigint
} {
  const texto = textoDaTaxa(taxa)

  if (!TAXA_DECIMAL.test(texto)) {
    throw new ErroCambio(
      "taxa-invalida",
      "A cotação deve ser maior que zero e ter no máximo 8 casas decimais",
    )
  }

  const [inteiro, fracao = ""] = texto.replace(",", ".").split(".")
  const denominador = BigInt(10 ** fracao.length)
  const numerador = BigInt(inteiro + fracao)

  if (numerador <= BigInt(0)) {
    throw new ErroCambio("taxa-invalida", "A cotação deve ser maior que zero")
  }

  return { numerador, denominador }
}

/**
 * Divide dois inteiros arredondando para o inteiro mais próximo.
 * Em empate exato de meio centavo, arredonda para cima.
 */
function dividirArredondando(numerador: bigint, denominador: bigint): bigint {
  const inteiro = numerador / denominador
  const resto = numerador % denominador

  return resto * BigInt(2) >= denominador
  ? inteiro + BigInt(1)
  : inteiro
}

export function converterCentavos(entrada: Conversao): number {
  const { valorCentavos } = entrada

  exigirValor(valorCentavos)

  const origem = normalizarMoeda(entrada.moedaOrigem)
  const destino = normalizarMoeda(entrada.moedaDestino)

  if (origem === destino) {
    return valorCentavos
  }

  if (entrada.taxa === undefined) {
    throw new ErroCambio(
      "taxa-ausente",
      `Informe a cotação de ${origem} para ${destino}`,
    )
  }

  const { numerador, denominador } = taxaComoFracao(entrada.taxa)

  const convertido = dividirArredondando(
    BigInt(valorCentavos) * numerador,
    denominador,
  )

  if (convertido > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new ErroCambio(
      "resultado-fora-do-limite",
      "O valor convertido ultrapassa o limite seguro",
    )
  }

  return Number(convertido)
}

/**
 * Converte valores de várias moedas para uma única moeda e só então soma.
 *
 * `taxasPorOrigem` segue a mesma convenção de `converterCentavos`:
 * cada taxa informa quantas unidades da moeda destino equivalem a
 * uma unidade da moeda de origem.
 *
 * Exemplo para totalizar em BRL:
 * { USD: "5.25", EUR: "6.10" }
 *
 * BRL não precisa aparecer no mapa, pois valores já na moeda destino
 * não passam por conversão.
 */
export function totalizarEmMoeda(
  valores: readonly ValorEmMoeda[],
  moedaDestino: string,
  taxasPorOrigem: Readonly<Record<string, string | number>>,
): number {
  const destino = normalizarMoeda(moedaDestino)

  const taxas = new Map<string, string | number>()
  for (const [moeda, taxa] of Object.entries(taxasPorOrigem)) {
    taxas.set(normalizarMoeda(moeda), taxa)
  }

  let total = BigInt(0)

  for (const item of valores) {
    exigirValor(item.valorCentavos)
    const origem = normalizarMoeda(item.moeda)

    const convertido =
      origem === destino
        ? item.valorCentavos
        : converterCentavos({
            valorCentavos: item.valorCentavos,
            moedaOrigem: origem,
            moedaDestino: destino,
            taxa: taxas.get(origem),
          })

    total += BigInt(convertido)

    if (total > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new ErroCambio(
        "resultado-fora-do-limite",
        "O total convertido ultrapassa o limite seguro",
      )
    }
  }

  return Number(total)
}