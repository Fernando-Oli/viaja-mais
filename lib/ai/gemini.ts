import type { GeradorDeRoteiro } from "@/lib/ai/provider"
import { normalizarRoteiro } from "@/lib/ai/roteiro"
import { ehTempoEsgotado, provedorIndisponivel, roteiroInvalido, tempoEsgotado } from "@/lib/ai/erros"
import { INSTRUCAO_DE_SISTEMA, esquemaDaResposta, mensagemDoPedido } from "@/lib/ai/prompt"

/**
 * Gerador real: Gemini, free tier do Google (P5 do plano norte), por `fetch`.
 *
 * Sem `@google/genai`: a chamada é um POST com JSON, e uma dependência a menos
 * é uma revisão a menos no `package.json`.
 *
 * - A chave vai no cabeçalho `x-goog-api-key`, nunca na URL (URL vai para log
 *   de proxy e de plataforma).
 * - A resposta é pedida em JSON com schema (`responseFormat.text`), mas é
 *   tratada como texto hostil mesmo assim: `JSON.parse` + `normalizarRoteiro`.
 * - Nada do erro do Google volta para a pessoa; o status vai para o log, sem a
 *   chave e sem o corpo.
 *
 * **Novas tentativas (20/11):** o free tier recusa pedidos ao acaso com 503
 * ("high demand") — na mesma sequência de 4 chamadas, 2 passaram e 2 não. Por
 * isso o gerador tenta de novo, alternando os dois flash-lite, até
 * `TENTATIVAS_MAXIMAS` ou até o sinal de 15 s da rota (RNF07.3) estourar. Só
 * vale tentar de novo quando o problema é do lado de lá e passageiro: 429 (a
 * cota é por modelo), 5xx e falha de rede. Chave recusada e resposta inválida
 * desistem na hora.
 *
 * Cada tentativa tem um teto próprio (`tempoPorTentativaMs`): uma chamada
 * pendurada é cortada e a seguinte ainda cabe no prazo da rota.
 *
 * Mapa de erros:
 * - prazo da rota esgotado (o `sinal`), inclusive durante a pausa → 504;
 * - todas as tentativas estouraram o próprio teto, a última por tempo → 504;
 * - 429, 5xx ou rede em todas as tentativas; 401/403 (chave) → 503 indisponível;
 * - qualquer outro status, JSON quebrado, resposta vazia ou bloqueada → 502.
 *
 * @RF12.1 gerar roteiro por IA · @RNF07.3 resposta em até 15 s ou erro claro
 */

/**
 * Free tier, com saída estruturada, na ordem de tentativa. O 3.1 respondeu em
 * 0,9 a 3,8 s nas medições de 20/11; o 3.5 em 3 a 9 s. Os `gemini-2.5-*` já
 * respondem 404 para chaves novas, e o `gemini-3.6-flash` passou de 15 s.
 */
export const MODELOS_GEMINI = ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"] as const

export const TENTATIVAS_MAXIMAS = 4

/** Pausa antes da tentativa n (n ≥ 1): n × isto. 250, 500, 750 ms. */
const PAUSA_PADRAO_MS = 250

/**
 * Teto de cada tentativa. Em 20/11 o `gemini-3.5-flash-lite` ficou pendurado,
 * sem responder, até consumir sozinho os 15 s da rota. O 3.1 gerou 3 dias em
 * 3,3 a 3,8 s; com 7 s por tentativa, a seguinte ainda cabe no prazo.
 */
const TEMPO_POR_TENTATIVA_PADRAO_MS = 7_000

export type AjustesGemini = { pausaMs?: number; tempoPorTentativaMs?: number }

const URL_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

type RespostaGemini = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>
}

const vaiDeNovo = (status: number) => status === 429 || status >= 500

/** Espera `ms`, mas rejeita assim que o sinal abortar: a pausa nunca passa do prazo. */
function esperar(ms: number, sinal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abortou = () => reject(sinal?.reason ?? new DOMException("abortado", "AbortError"))
    if (sinal?.aborted) return abortou()
    const relogio = setTimeout(() => {
      sinal?.removeEventListener("abort", aoAbortar)
      resolve()
    }, ms)
    const aoAbortar = () => {
      clearTimeout(relogio)
      abortou()
    }
    sinal?.addEventListener("abort", aoAbortar, { once: true })
  })
}

export function criarGeradorGemini(
  chave: string,
  fazerFetch: typeof fetch = fetch,
  { pausaMs = PAUSA_PADRAO_MS, tempoPorTentativaMs = TEMPO_POR_TENTATIVA_PADRAO_MS }: AjustesGemini = {},
): GeradorDeRoteiro {
  return {
    nome: "gemini",
    async gerar(pedido, opcoes = {}) {
      // Prazo da rota (15 s) estourado → 504 já. Teto de uma tentativa → a próxima.
      const prazoDaRotaEstourou = () => opcoes.sinal?.aborted === true
      let ultimaFoiTempo = false
      const corpoDoPedido = JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCAO_DE_SISTEMA }] },
        contents: [{ role: "user", parts: [{ text: mensagemDoPedido(pedido) }] }],
        generationConfig: {
          responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: esquemaDaResposta() } },
        },
      })

      for (let tentativa = 1; tentativa <= TENTATIVAS_MAXIMAS; tentativa++) {
        const modelo = MODELOS_GEMINI[(tentativa - 1) % MODELOS_GEMINI.length]
        const sinalDaTentativa = opcoes.sinal
          ? AbortSignal.any([opcoes.sinal, AbortSignal.timeout(tempoPorTentativaMs)])
          : AbortSignal.timeout(tempoPorTentativaMs)

        // Tempo: o prazo da rota encerra tudo (504); o teto da tentativa passa para a próxima.
        const tratarTempo = (onde: string) => {
          if (prazoDaRotaEstourou()) {
            console.error(`[ia] prazo da rota esgotado ${onde} na tentativa ${tentativa} (${modelo})`)
            throw tempoEsgotado()
          }
          console.error(`[ia] ${modelo} passou de ${tempoPorTentativaMs} ms ${onde} na tentativa ${tentativa}`)
          ultimaFoiTempo = true
        }

        let resposta: Response
        try {
          if (tentativa > 1) await esperar(pausaMs * (tentativa - 1), opcoes.sinal)
          resposta = await fazerFetch(`${URL_BASE}/${modelo}:generateContent`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-goog-api-key": chave },
            body: corpoDoPedido,
            signal: sinalDaTentativa,
            cache: "no-store",
          })
        } catch (erro) {
          if (ehTempoEsgotado(erro)) {
            tratarTempo("esperando a resposta")
            continue
          }
          console.error(`[ia] falha de rede na tentativa ${tentativa} (${modelo}):`, erro instanceof Error ? erro.name : typeof erro)
          ultimaFoiTempo = false
          continue
        }

        if (!resposta.ok) {
          console.error(`[ia] ${modelo} respondeu HTTP ${resposta.status} na tentativa ${tentativa}`)
          ultimaFoiTempo = false
          if (vaiDeNovo(resposta.status)) continue
          if (resposta.status === 401 || resposta.status === 403) throw provedorIndisponivel()
          throw roteiroInvalido()
        }

        let corpo: RespostaGemini
        try {
          corpo = (await resposta.json()) as RespostaGemini
        } catch (erro) {
          if (ehTempoEsgotado(erro)) {
            tratarTempo("lendo o corpo")
            continue
          }
          throw roteiroInvalido()
        }

        const texto = corpo.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("")
        if (!texto) {
          // Sem candidato ou bloqueado (finishReason SAFETY, por exemplo).
          console.error(`[ia] ${modelo} sem texto; finishReason=${corpo.candidates?.[0]?.finishReason ?? "nenhum"}`)
          throw roteiroInvalido()
        }

        let bruto: unknown
        try {
          bruto = JSON.parse(texto)
        } catch {
          throw roteiroInvalido()
        }
        return normalizarRoteiro(bruto, pedido.dias)
      }

      console.error(`[ia] Gemini sem roteiro depois de ${TENTATIVAS_MAXIMAS} tentativas`)
      throw ultimaFoiTempo ? tempoEsgotado() : provedorIndisponivel()
    },
  }
}
