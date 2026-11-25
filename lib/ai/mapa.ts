/**
 * Link para ver um lugar do roteiro no Google Maps.
 *
 * Usa o endereço público de busca do Google Maps (Maps URLs), que não exige
 * chave nem tem custo: o navegador abre o Maps em nova aba, e nada passa pelo
 * nosso servidor. A versão com mapa e fotos dentro do app, pela API de lugares
 * do Google, exige conta de faturamento e fica para depois da entrega.
 *
 * Roda no navegador (tela "Nova viagem com a Avori"): função pura, sem I/O.
 *
 * @RF12.2 revisar o roteiro gerado antes de gravá-lo
 */

const BUSCA = "https://www.google.com/maps/search/?api=1&query="

/** "São Paulo" e "sao paulo" contam como o mesmo destino. */
const comparavel = (texto: string) => texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()

export type LugarNoMapa = {
  /** Nome do lugar e do bairro, como a IA informou; o gerador de testes não informa. */
  local: string | null
  /** Título atual da atividade, já com a edição da pessoa. */
  titulo: string
  destino: string
}

/**
 * Busca pelo lugar que a IA informou e, sem ele, pelo título da atividade. O
 * destino entra no fim quando ainda não está no texto: "Mercado da Ribeira"
 * sozinho pode cair em outra cidade. Sem lugar nem título, não há link.
 */
export function linkDoMapa({ local, titulo, destino }: LugarNoMapa): string | null {
  const lugar = local?.trim() || titulo.trim()
  if (!lugar) return null
  const cidade = destino.trim()
  const consulta = cidade && !comparavel(lugar).includes(comparavel(cidade)) ? `${lugar}, ${cidade}` : lugar
  return BUSCA + encodeURIComponent(consulta)
}
