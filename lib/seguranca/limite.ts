import type { createClient } from "@/lib/supabase/server"
import { ErroHttp } from "@/lib/http"

/**
 * Limite de requisições por usuário, contado no Postgres por
 * `public.consumir_limite()` (migration `plataforma_rate_limit`).
 *
 * Uso, logo depois de identificar o usuário e antes de qualquer efeito:
 *
 *     await exigirLimite(supabase, LIMITES.convite)
 *
 * Por usuário, e não por IP: quem troca de rede não escapa do limite, e uma NAT
 * inteira (a rede da faculdade) não é bloqueada por causa de uma pessoa.
 *
 * @RNF02.8 limite por usuário e por janela de tempo
 */

type Supabase = Awaited<ReturnType<typeof createClient>>

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
 * - `foto-perfil` grava no Storage com a chave de serviço.
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

/**
 * Conta a requisição e lança 429 quando ela passa do limite.
 *
 * **Fail-open:** se a contagem falhar (banco fora, função ausente), a requisição
 * segue e o erro vai para o log. O limitador protege contra abuso; ele não pode
 * ser o motivo de um convite ou de uma troca de senha legítimos falharem. O
 * risco residual está em `docs/pfc/evidencias/seguranca/S06-F-rate-limit-csp.md`.
 */
export async function exigirLimite(supabase: Supabase, regra: RegraLimite): Promise<void> {
  let resultado: { permitido: boolean; retry_after: number } | undefined
  try {
    const { data, error } = await supabase.rpc("consumir_limite", {
      p_chave: regra.chave,
      p_maximo: regra.maximo,
      p_janela_segundos: regra.janelaSegundos,
    })
    if (error) throw error
    resultado = Array.isArray(data) ? data[0] : undefined
  } catch (erro) {
    // Exceção de rede e erro do PostgREST seguem o mesmo caminho: liberar.
    console.error(`[limite] contagem de "${regra.chave}" falhou; requisição liberada:`, mensagemDe(erro))
    return
  }

  if (!resultado) {
    console.error(`[limite] contagem de "${regra.chave}" voltou vazia; requisição liberada`)
    return
  }

  if (!resultado.permitido) throw limiteExcedido(resultado.retry_after)
}

function mensagemDe(erro: unknown): string {
  if (erro instanceof Error) return erro.message
  if (erro && typeof erro === "object" && "message" in erro) return String((erro as { message: unknown }).message)
  return String(erro)
}
