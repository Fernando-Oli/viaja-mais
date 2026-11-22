/**
 * Relatório de gastos por categoria, separado por moeda.
 *
 * Não existe conversão cambial no sistema, então real e dólar não se somam:
 * cada moeda vira um grupo próprio, com total, categorias e percentuais
 * calculados só sobre as despesas daquela moeda. A moeda de uma despesa é a
 * coluna `expenses.currency`, com o mesmo padrão do acerto de contas
 * (`lib/finance/acerto.ts`): nula vira BRL.
 *
 * As somas são feitas em centavos inteiros — somar `0.1 + 0.2` em ponto
 * flutuante dá `0.30000000000000004`, e o total exibido deixaria de bater com
 * a soma das linhas.
 *
 * @RF06.5 visualizar gastos por categoria
 */

export const MOEDA_PADRAO = "BRL"

/** Rótulos pt-BR das categorias do CHECK de `expenses.category`. */
export const ROTULOS_CATEGORIA: Record<string, string> = {
  accommodation: "Hospedagem",
  transport: "Transporte",
  food: "Alimentação",
  activities: "Atividades",
  shopping: "Compras",
  other: "Outros",
}

/** Rótulo da categoria; uma chave fora da lista aparece como veio, em vez de sumir. */
export function rotuloCategoria(categoria: string): string {
  return ROTULOS_CATEGORIA[categoria] ?? categoria
}

export interface DespesaParaRelatorio {
  amount: number | string
  category: string
  currency: string | null
}

export interface LinhaCategoria {
  categoria: string
  rotulo: string
  centavos: number
  /** Participação no total da moeda, de 0 a 100, sem arredondar. */
  percentual: number
  quantidade: number
}

export interface RelatorioMoeda {
  moeda: string
  totalCentavos: number
  quantidade: number
  /** Maior gasto primeiro; empate pelo rótulo, em ordem alfabética. */
  categorias: LinhaCategoria[]
}

function paraCentavos(valor: number | string): number {
  const n = Number(valor)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/**
 * Agrupa as despesas por moeda e, dentro de cada moeda, por categoria. Moedas
 * em ordem alfabética do código, para a tela não mudar de ordem entre visitas.
 * Lista vazia devolve `[]`.
 */
export function relatorioPorCategoria(despesas: readonly DespesaParaRelatorio[]): RelatorioMoeda[] {
  const porMoeda = new Map<string, Map<string, { centavos: number; quantidade: number }>>()

  for (const despesa of despesas) {
    const moeda = despesa.currency || MOEDA_PADRAO
    const categorias = porMoeda.get(moeda) ?? new Map<string, { centavos: number; quantidade: number }>()
    const atual = categorias.get(despesa.category) ?? { centavos: 0, quantidade: 0 }
    atual.centavos += paraCentavos(despesa.amount)
    atual.quantidade += 1
    categorias.set(despesa.category, atual)
    porMoeda.set(moeda, categorias)
  }

  return [...porMoeda.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([moeda, categorias]) => {
      const totalCentavos = [...categorias.values()].reduce((soma, c) => soma + c.centavos, 0)
      const quantidade = [...categorias.values()].reduce((soma, c) => soma + c.quantidade, 0)

      const linhas: LinhaCategoria[] = [...categorias.entries()]
        .map(([categoria, { centavos, quantidade: qtd }]) => ({
          categoria,
          rotulo: rotuloCategoria(categoria),
          centavos,
          percentual: totalCentavos > 0 ? (centavos / totalCentavos) * 100 : 0,
          quantidade: qtd,
        }))
        .sort((a, b) => b.centavos - a.centavos || a.rotulo.localeCompare(b.rotulo, "pt-BR"))

      return { moeda, totalCentavos, quantidade, categorias: linhas }
    })
}

/** Percentual com uma casa, no formato pt-BR: `66,7%`. */
export function formatarPercentual(percentual: number): string {
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(percentual)}%`
}
