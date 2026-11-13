/**
 * Teto de registros de toda listagem (S09-F, RNF06.4): o tamanho de uma
 * resposta nunca depende do volume de dados no banco.
 *
 * 500, e não os 20 de uma página: as listas de uma viagem (itinerário,
 * despesas, reservas, lugares) são lidas inteiras de propósito — a pessoa quer
 * ver a viagem toda, e uma viagem tem tamanho natural limitado. O teto é a rede
 * de proteção para o caso anormal, não a paginação. A paginação de 20 por vez
 * (RNF01.4) existe onde a lista cresce sem limite natural: a rede social.
 *
 * Não se aplica ao acerto de contas nem aos totais de finanças: eles somam
 * despesas, e cortar a lista em silêncio deixaria o saldo errado.
 *
 * @RNF06.4 limite explícito de registros
 */
export const LIMITE_LISTAGEM = 500
