import { z } from "zod"

/**
 * Contrato de entrada de `POST /api/roteiros/gerar`: as respostas da conversa
 * "Nova viagem com a Avori" (app/dashboard/trips/criar/ia).
 *
 * Tudo aqui vai para o modelo de IA, então os limites são também de custo:
 * cada caractere a mais é token pago e mais espaço para injeção de instrução.
 * Ritmo e orçamento são listas fechadas porque mudam a forma do roteiro (o
 * fake decide a quantidade de itens pelo ritmo); destino, "quem vai" e os
 * interesses aceitam texto livre, como o campo "Ou escreva com suas palavras".
 *
 * Não há data aqui: o modelo pensa em "dia 1, dia 2…", e a tela converte em
 * datas reais a partir do início que a pessoa escolheu.
 *
 * @RF12.1 gerar roteiro por IA a partir de destino, datas e interesses
 */

export const RITMOS = ["tranquilo", "equilibrado", "intenso"] as const
export const ORCAMENTOS = ["economico", "moderado", "confortavel"] as const

/**
 * Teto de dias que a Avori monta. Decisão do Micael em 20/11, depois da fumaça
 * com o Gemini real: 3 dias saíram em ~9 s, mas 7 dias (ritmo equilibrado) e 14
 * (intenso) passaram dos 15 s do RNF07.3. Com 5 o roteiro cabe no tempo; viagem
 * mais longa é criada por "Criar do meu jeito".
 */
export const DIAS_MAXIMOS = 5

export const gerarRoteiroSchema = z
  .object({
    destino: z.string().trim().min(2, "informe o destino").max(160),
    dias: z.coerce.number().int("use um número inteiro de dias").min(1).max(DIAS_MAXIMOS),
    quem: z.string().trim().min(1, "diga quem vai").max(60),
    ritmo: z.enum(RITMOS),
    orcamento: z.enum(ORCAMENTOS),
    interesses: z.array(z.string().trim().min(1).max(40)).max(8).default([]),
  })
  .strict()

export type GerarRoteiro = z.infer<typeof gerarRoteiroSchema>
