/**
 * Resumo das avaliações de um lugar: média com uma casa decimal e total.
 *
 * Nota fora de 1 a 5 (ou não inteira) é ignorada em vez de distorcer a média.
 * O banco já recusa esses valores; a checagem aqui protege a tela contra uma
 * linha antiga ou uma mudança futura da constraint.
 *
 * Sem nenhuma nota válida, `media` é `null`: "0,0" sugeriria que alguém deu
 * nota zero.
 *
 * @RF11.2 ver avaliações de outros usuários
 */
export function resumirAvaliacoes(avaliacoes: readonly { rating: number }[]): {
  media: number | null
  total: number
} {
  const validas = avaliacoes.map((a) => a.rating).filter((n) => Number.isInteger(n) && n >= 1 && n <= 5)
  if (validas.length === 0) return { media: null, total: 0 }

  const soma = validas.reduce((acc, n) => acc + n, 0)
  return { media: Math.round((soma / validas.length) * 10) / 10, total: validas.length }
}
