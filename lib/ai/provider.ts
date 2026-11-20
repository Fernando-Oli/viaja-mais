import { envServidor } from "@/lib/env"
import type { GerarRoteiro } from "@/lib/schemas/roteiro"
import type { Roteiro } from "@/lib/ai/roteiro"
import { provedorIndisponivel } from "@/lib/ai/erros"
import { geradorFake } from "@/lib/ai/fake"
import { criarGeradorGemini } from "@/lib/ai/gemini"

/**
 * Ponto único de troca do provedor de IA (P5 do plano norte).
 *
 * A rota só conhece `GeradorDeRoteiro`. Qual implementação responde é decidido
 * por `AI_PROVIDER`, lido de `lib/env.ts`:
 *
 * - `fake` (padrão): determinístico, sem rede. Dev, CI e E2E — custo zero e o
 *   mesmo resultado em toda execução.
 * - `gemini`: free tier do Google, por `fetch` (lib/ai/gemini.ts).
 * - `anthropic`: previsto no `lib/env.ts`, ainda sem implementação. Trocar para
 *   Claude é escrever `lib/ai/anthropic.ts` com a mesma interface e um `case` aqui.
 *
 * A chave nunca sai do servidor: `envServidor()` lança se for chamada no
 * navegador, e nenhuma variável de IA tem o prefixo `NEXT_PUBLIC_`.
 *
 * @RF12.1 gerar roteiro por IA
 */

export type OpcoesDeGeracao = {
  /** Aborta a chamada ao provedor. A rota passa `AbortSignal.timeout(TEMPO_MAXIMO_MS)`. */
  sinal?: AbortSignal
}

export interface GeradorDeRoteiro {
  readonly nome: "fake" | "gemini"
  /** Devolve um roteiro já normalizado e validado, ou lança `ErroHttp`. */
  gerar(pedido: GerarRoteiro, opcoes?: OpcoesDeGeracao): Promise<Roteiro>
}

export function escolherGerador(): GeradorDeRoteiro {
  const { AI_PROVIDER, GEMINI_API_KEY } = envServidor()
  switch (AI_PROVIDER) {
    case "fake":
      return geradorFake
    case "gemini":
      if (!GEMINI_API_KEY) {
        // A mensagem é para quem configura o deploy; a pessoa vê só "indisponível".
        console.error("[ia] AI_PROVIDER=gemini sem GEMINI_API_KEY")
        throw provedorIndisponivel()
      }
      return criarGeradorGemini(GEMINI_API_KEY)
    default:
      console.error(`[ia] AI_PROVIDER=${AI_PROVIDER} ainda não tem implementação em lib/ai/`)
      throw provedorIndisponivel()
  }
}
