import { ErroHttp } from "@/lib/http"

/**
 * Erros da geração de roteiro, em português e sem detalhe interno.
 *
 * Ficam fora de `provider.ts` porque os geradores também os lançam, e o
 * `provider.ts` importa os geradores: aqui não há ciclo.
 *
 * @RF12.1 gerar roteiro por IA · @RNF07.3 resposta em até 15 s ou erro claro
 */

/** RNF07.3: 15 s é o máximo que a pessoa espera olhando "Montando um roteiro…". */
export const TEMPO_MAXIMO_MS = 15_000

export const tempoEsgotado = () =>
  new ErroHttp(504, "A Avori demorou demais para responder. Tente de novo em instantes.")

export const provedorIndisponivel = () =>
  new ErroHttp(503, "A Avori está indisponível agora. Tente de novo em alguns minutos.")

/** 502: quem falhou foi o provedor, não a pessoa nem o nosso servidor. */
export const roteiroInvalido = () =>
  new ErroHttp(502, "A Avori respondeu algo que não conseguimos usar. Tente gerar de novo.")

/** Aborto pelo `AbortSignal.timeout` chega como `TimeoutError`; aborto manual, como `AbortError`. */
export function ehTempoEsgotado(erro: unknown): boolean {
  return erro instanceof Error && (erro.name === "TimeoutError" || erro.name === "AbortError")
}
