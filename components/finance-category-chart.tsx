"use client"

import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { PieChart } from "lucide-react"
import { formatarCentavos } from "@/lib/finance/rateio"
import { formatarPercentual, type LinhaCategoria, type RelatorioMoeda } from "@/lib/finance/categorias"

/**
 * Gastos por categoria: um gráfico de barras horizontais e uma tabela por moeda.
 *
 * Client Component só porque o Recharts mede o contêiner no navegador. A
 * consulta e o agrupamento ficam no servidor (`app/dashboard/finances/page.tsx`
 * e `lib/finance/categorias.ts`); aqui chega o relatório pronto.
 *
 * Barras horizontais em vez de pizza: o comprimento compara valores melhor que
 * o ângulo, e o rótulo da categoria cabe inteiro no eixo mesmo no celular. Cada
 * moeda tem o próprio gráfico, com escala própria — não há conversão cambial,
 * então barras de moedas diferentes nunca dividem um eixo.
 *
 * A tabela abaixo repete os números: quem não enxerga o gráfico, ou usa leitor
 * de tela, tem o relatório completo em texto.
 *
 * @RF06.5 visualizar gastos por categoria
 */

const ALTURA_BARRA = 44
const LARGURA_EIXO_CATEGORIA = 92

interface PontoGrafico extends LinhaCategoria {
  valor: number
  rotuloValor: string
}

function rotuloDaBarra(linha: LinhaCategoria, moeda: string) {
  return `${formatarCentavos(linha.centavos, moeda)} · ${formatarPercentual(linha.percentual)}`
}

/**
 * Rótulo "valor · %" logo depois da ponta da barra, numa linha só. O rótulo
 * padrão do Recharts quebra o texto na largura da barra, e no celular o valor
 * e o percentual iam parar em linhas diferentes.
 */
function RotuloDaBarra(props: {
  x?: number | string
  y?: number | string
  width?: number | string
  height?: number | string
  value?: number | string
}) {
  const x = Number(props.x ?? 0) + Number(props.width ?? 0) + 6
  const y = Number(props.y ?? 0) + Number(props.height ?? 0) / 2
  return (
    <text x={x} y={y} dominantBaseline="central" fill="var(--foreground)" fontSize={12}>
      {props.value}
    </text>
  )
}

function DicaDaBarra({
  active,
  payload,
  moeda,
}: {
  active?: boolean
  payload?: { payload: PontoGrafico }[]
  moeda: string
}) {
  const ponto = payload?.[0]?.payload
  if (!active || !ponto) return null
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-sm">
      <p className="font-medium text-foreground">{ponto.rotulo}</p>
      <p className="text-foreground">{formatarCentavos(ponto.centavos, moeda)}</p>
      <p className="text-muted-foreground">{formatarPercentual(ponto.percentual)} do total em {moeda}</p>
    </div>
  )
}

function GraficoMoeda({ relatorio }: { relatorio: RelatorioMoeda }) {
  const { moeda, categorias } = relatorio
  const dados: PontoGrafico[] = categorias.map((c) => ({
    ...c,
    valor: c.centavos / 100,
    rotuloValor: rotuloDaBarra(c, moeda),
  }))
  // Espaço à direita para o rótulo "R$ 1.234,56 · 66,7%" caber fora da barra.
  const maiorRotulo = Math.max(...dados.map((p) => p.rotuloValor.length))
  const margemDireita = Math.min(150, maiorRotulo * 7 + 8)
  const resumo = categorias
    .map((c) => `${c.rotulo}: ${formatarCentavos(c.centavos, moeda)}, ${formatarPercentual(c.percentual)}`)
    .join("; ")

  return (
    <div
      role="img"
      aria-label={`Gráfico de gastos por categoria em ${moeda}. ${resumo}`}
      data-testid="grafico-categoria"
      style={{ height: dados.length * ALTURA_BARRA + 16 }}
      className="w-full"
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={dados}
          layout="vertical"
          margin={{ top: 8, right: margemDireita, bottom: 8, left: 0 }}
          barCategoryGap={8}
        >
          <XAxis type="number" dataKey="valor" hide domain={[0, "dataMax"]} />
          <YAxis
            type="category"
            dataKey="rotulo"
            width={LARGURA_EIXO_CATEGORIA}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--foreground)", fontSize: 13 }}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={<DicaDaBarra moeda={moeda} />}
            isAnimationActive={false}
          />
          <Bar dataKey="valor" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={24} isAnimationActive={false}>
            <LabelList dataKey="rotuloValor" content={RotuloDaBarra} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function TabelaMoeda({ relatorio }: { relatorio: RelatorioMoeda }) {
  const { moeda, categorias, totalCentavos, quantidade } = relatorio
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">Relatório por categoria em {moeda}</caption>
      <thead>
        <tr className="border-b border-border text-left text-muted-foreground">
          <th scope="col" className="py-2 pr-2 font-medium">
            Categoria
          </th>
          <th scope="col" className="hidden py-2 pr-2 text-right font-medium sm:table-cell">
            Despesas
          </th>
          <th scope="col" className="py-2 pr-2 text-right font-medium">
            Valor
          </th>
          <th scope="col" className="py-2 text-right font-medium">
            Participação
          </th>
        </tr>
      </thead>
      <tbody>
        {categorias.map((c) => (
          <tr key={c.categoria} data-testid="linha-categoria" className="border-b border-border last:border-0">
            <th scope="row" className="py-2 pr-2 text-left font-medium text-foreground">
              {c.rotulo}
            </th>
            <td className="hidden py-2 pr-2 text-right text-muted-foreground tabular-nums sm:table-cell">
              {c.quantidade}
            </td>
            <td className="py-2 pr-2 text-right font-semibold text-foreground tabular-nums">
              {formatarCentavos(c.centavos, moeda)}
            </td>
            <td className="py-2 text-right text-muted-foreground tabular-nums">{formatarPercentual(c.percentual)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-border">
          <th scope="row" className="py-2 pr-2 text-left font-semibold text-foreground">
            Total
          </th>
          <td className="hidden py-2 pr-2 text-right text-muted-foreground tabular-nums sm:table-cell">{quantidade}</td>
          <td className="py-2 pr-2 text-right font-semibold text-foreground tabular-nums">
            {formatarCentavos(totalCentavos, moeda)}
          </td>
          <td className="py-2 text-right text-muted-foreground tabular-nums">{formatarPercentual(100)}</td>
        </tr>
      </tfoot>
    </table>
  )
}

export function FinanceCategoryChart({ relatorios }: { relatorios: RelatorioMoeda[] }) {
  if (relatorios.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <PieChart className="mb-4 h-12 w-12 text-muted-foreground" />
        <h3 className="mb-2 text-lg font-semibold text-foreground">Nenhuma despesa por categoria</h3>
        <p className="text-center text-muted-foreground">Registre despesas para ver a distribuição</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {relatorios.length > 1 && (
        <p className="text-sm text-muted-foreground">
          Valores separados por moeda: não há conversão entre moedas, então cada uma tem o próprio relatório.
        </p>
      )}
      {relatorios.map((relatorio) => (
        <section
          key={relatorio.moeda}
          aria-labelledby={`categorias-${relatorio.moeda}`}
          data-testid="relatorio-moeda"
          className="space-y-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={`categorias-${relatorio.moeda}`} className="text-base font-semibold text-foreground">
              {relatorio.moeda}
            </h3>
            <p className="text-sm text-muted-foreground">
              Total{" "}
              <span className="font-semibold text-foreground">
                {formatarCentavos(relatorio.totalCentavos, relatorio.moeda)}
              </span>{" "}
              · {relatorio.quantidade} {relatorio.quantidade === 1 ? "despesa" : "despesas"}
            </p>
          </div>
          <GraficoMoeda relatorio={relatorio} />
          <TabelaMoeda relatorio={relatorio} />
        </section>
      ))}
    </div>
  )
}
