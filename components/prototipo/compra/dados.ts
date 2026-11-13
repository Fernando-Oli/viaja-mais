/**
 * Dados de exemplo do fluxo de compra de voos e hotéis (PRÉVIA VISUAL).
 *
 * Nada aqui vem de um fornecedor: a busca, os preços e os códigos são fixos.
 * Quando houver parceiro (busca real com reserva no site dele, ou checkout
 * em sandbox), estes tipos viram o contrato da resposta da rota de busca.
 */

export type Voo = {
  id: string
  sigla: string
  companhia: string
  saida: string
  chegada: string
  diaSeguinte: boolean
  duracao: string
  paradas: number
  escala?: string
  precoPessoa: number
  selo?: "Melhor equilíbrio" | "Mais barato" | "Mais rápido"
  voos: [string, string]
}

export const VOOS: Voo[] = [
  { id: "tp", sigla: "TP", companhia: "TAP Air Portugal", saida: "22:40", chegada: "12:55", diaSeguinte: true, duracao: "10h 15min", paradas: 0, precoPessoa: 4960, selo: "Melhor equilíbrio", voos: ["TP 82", "TP 81"] },
  { id: "ib", sigla: "IB", companhia: "Iberia", saida: "16:50", chegada: "13:40", diaSeguinte: true, duracao: "15h 50min", paradas: 1, escala: "MAD", precoPessoa: 4190, selo: "Mais barato", voos: ["IB 268", "IB 267"] },
  { id: "la", sigla: "LA", companhia: "LATAM", saida: "18:05", chegada: "10:30", diaSeguinte: true, duracao: "11h 25min", paradas: 0, precoPessoa: 5380, selo: "Mais rápido", voos: ["LA 8146", "LA 8147"] },
  { id: "af", sigla: "AF", companhia: "Air France", saida: "17:20", chegada: "15:05", diaSeguinte: true, duracao: "16h 45min", paradas: 1, escala: "CDG", precoPessoa: 4420, voos: ["AF 459", "AF 1024"] },
  { id: "tp2", sigla: "TP", companhia: "TAP Air Portugal", saida: "09:10", chegada: "23:30", diaSeguinte: false, duracao: "10h 20min", paradas: 0, precoPessoa: 5210, voos: ["TP 88", "TP 87"] },
]

export type Tarifa = { id: string; nome: string; acrescimo: number; itens: [boolean, string][] }

export const TARIFAS: Tarifa[] = [
  { id: "basica", nome: "Básica", acrescimo: 0, itens: [[true, "Mochila de até 10 kg"], [false, "Sem mala despachada"], [false, "Sem alteração nem reembolso"]] },
  { id: "classica", nome: "Clássica", acrescimo: 680, itens: [[true, "Mochila e 1 mala de 23 kg"], [true, "Alteração com taxa de R$ 450"], [false, "Sem reembolso"]] },
  { id: "flex", nome: "Flex", acrescimo: 1930, itens: [[true, "Mochila e 2 malas de 23 kg"], [true, "Alteração sem taxa"], [true, "Reembolso até 24 h antes"]] },
]

export type Passageiro = { id: string; nome: string; iniciais: string; completo: boolean }

export const PASSAGEIROS: Passageiro[] = [
  { id: "mc", nome: "Marina Costa", iniciais: "MC", completo: true },
  { id: "fo", nome: "Felipe Ortiz", iniciais: "FO", completo: false },
  { id: "ab", nome: "Ana Beatriz", iniciais: "AB", completo: true },
  { id: "rl", nome: "Rafael Lima", iniciais: "RL", completo: true },
]

export type Hotel = {
  id: string
  nome: string
  tipo: string
  estrelas: number
  nota: string
  avaliacao: string
  bairro: string
  destaque?: string
  noite: number
  cafe?: boolean
  cancelamento?: boolean
}

export const HOTEIS: Hotel[] = [
  { id: "alfama", nome: "Casa em Alfama", tipo: "Apartamento inteiro · 2 quartos", estrelas: 0, nota: "9,2", avaliacao: "Excelente · 412 avaliações", bairro: "Alfama · 600 m do Castelo", destaque: "Cancelamento grátis até 5 jun", noite: 1020, cancelamento: true },
  { id: "baixa", nome: "Hotel Baixa Lisboa", tipo: "Hotel · 2 quartos duplos", estrelas: 4, nota: "8,7", avaliacao: "Muito bom · 1.208 avaliações", bairro: "Baixa · 200 m do Rossio", destaque: "Café da manhã incluso", noite: 1380, cafe: true },
  { id: "chiado", nome: "Lisboa Chiado Suites", tipo: "Hotel · 2 suítes", estrelas: 4, nota: "9,0", avaliacao: "Excelente · 655 avaliações", bairro: "Chiado", destaque: "Cancelamento grátis até 10 jun", noite: 1560, cancelamento: true },
  { id: "belem", nome: "Pousada Belém", tipo: "Pousada · 2 quartos", estrelas: 3, nota: "8,4", avaliacao: "Muito bom · 389 avaliações", bairro: "Belém · perto da Torre", noite: 890 },
]

export const NOITES = 6
export const PESSOAS = 4
export const TAXA_EMBARQUE_PESSOA = 309

export const reais = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: n % 1 ? 2 : 0 }).format(n)
