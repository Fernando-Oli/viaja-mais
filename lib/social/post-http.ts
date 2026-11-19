import { NextResponse } from "next/server"
import { ErroHttp, respostaDeErro } from "@/lib/http"
import { SEM_CACHE_COMPARTILHADO } from "./avatar"

/**
 * O que as rotas de post (app/api/social/posts/**, a rota do post de viagem e
 * a da grade) fazem com um erro, num lugar só: o formato `{ error, codigo? }`
 * do contrato de 18/11 (noite) e o `Cache-Control: private, no-store` em toda
 * resposta, inclusive a de erro (as de sucesso levam URLs assinadas, que valem
 * como senha).
 *
 * `lib/http.ts` (Plataforma) não carrega `codigo`; quem precisa dele lança
 * `ErroComCodigo`, que é um `ErroHttp` e por isso continua valendo em qualquer
 * `respostaDeErro`.
 *
 * @RF09.15 post com fotos · @RF09.17 detalhe · @RNF02.11 erro do banco não vaza
 */

/**
 * Um `ErroHttp` com o `codigo` que a tela usa para decidir o que mostrar e,
 * no `marcado_recusou`, os `recusados` que causaram o erro (a tela os tira e
 * avisa quem foi).
 */
export class ErroComCodigo extends ErroHttp {
  constructor(
    status: number,
    mensagem: string,
    readonly codigo: string,
    readonly recusados?: string[],
  ) {
    super(status, mensagem)
    this.name = "ErroComCodigo"
  }
}

/** Aplica o cabeçalho sem cache compartilhado. */
export function semCache(resposta: NextResponse): NextResponse {
  for (const [nome, valor] of Object.entries(SEM_CACHE_COMPARTILHADO)) resposta.headers.set(nome, valor)
  return resposta
}

/**
 * Erro em resposta. `ErroComCodigo` sai com o código; `ErroHttp` 5xx (o de
 * `papelNaViagem` carrega a mensagem do Postgres) vira o 500 genérico; o resto
 * segue `respostaDeErro`.
 */
export function respostaDaFalha(erro: unknown): NextResponse {
  if (erro instanceof ErroHttp && erro.status >= 500) {
    return respostaDeErro(new Error("[post] erro interno", { cause: erro }))
  }
  if (erro instanceof ErroComCodigo) {
    const corpo =
      erro.recusados === undefined
        ? { error: erro.message, codigo: erro.codigo }
        : { error: erro.message, codigo: erro.codigo, recusados: erro.recusados }
    return NextResponse.json(corpo, { status: erro.status, headers: erro.headers })
  }
  return respostaDeErro(erro)
}

/** Executa o método e devolve a resposta (ou a da falha) sempre sem cache. */
export async function responder(executar: () => Promise<NextResponse>): Promise<NextResponse> {
  let resposta: NextResponse
  try {
    resposta = await executar()
  } catch (erro) {
    resposta = respostaDaFalha(erro)
  }
  return semCache(resposta)
}

/** 403 de quem ainda não escolheu um username: sem ele, não há perfil onde o post apareça. */
export const semUsername = (acao: string) =>
  new ErroComCodigo(403, `Escolha um nome de usuário para ${acao}`, "sem_username")
