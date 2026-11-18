import { ErroHttp } from "@/lib/erros"

/**
 * Limite de requisições por usuário, contado no Postgres por
 * `public.consumir_limite()` (migration `plataforma_rate_limit`). Aqui ficam as
 * regras e o erro; quem conta é `exigirLimiteNaTx()` (`api/http/limite.ts`),
 * logo depois de identificar o usuário e antes de qualquer efeito.
 *
 * Por usuário, e não por IP: quem troca de rede não escapa do limite, e uma NAT
 * inteira (a rede da faculdade) não é bloqueada por causa de uma pessoa.
 *
 * @RNF02.8 limite por usuário e por janela de tempo
 */

export type RegraLimite = {
  /** Identificador da regra no banco: `[a-z0-9-]{1,64}`. */
  chave: string
  maximo: number
  janelaSegundos: number
}

/**
 * As regras da aplicação. Mudar um número aqui muda o limite, sem migration.
 *
 * - `convite` dispara e-mail real. 10, e não 5: uma viagem de 8 pessoas tem de
 *   caber numa rodada.
 * - `trocar-senha` confere a senha atual: é o oráculo de quem tem uma sessão
 *   roubada.
 * - `foto-perfil` grava no armazenamento S3.
 * - `seguir` gera notificação para a outra pessoa.
 * - `roteiro-ia` é para `/api/roteiros/gerar` (S10-M), que custa dinheiro por
 *   chamada.
 */
export const LIMITES = {
  convite: { chave: "convite", maximo: 10, janelaSegundos: 600 },
  trocarSenha: { chave: "trocar-senha", maximo: 5, janelaSegundos: 900 },
  fotoPerfil: { chave: "foto-perfil", maximo: 10, janelaSegundos: 600 },
  seguir: { chave: "seguir", maximo: 30, janelaSegundos: 60 },
  roteiroIa: { chave: "roteiro-ia", maximo: 10, janelaSegundos: 3600 },
} as const satisfies Record<string, RegraLimite>

export const limiteExcedido = (retryAfter: number) =>
  new ErroHttp(429, "Muitas tentativas. Aguarde um pouco e tente de novo.", {
    "Retry-After": String(retryAfter),
  })
