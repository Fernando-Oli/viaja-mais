import { NextResponse } from "next/server"

/**
 * Erro com código HTTP. Existe para que as checagens de autorização possam
 * simplesmente lançar, em vez de cada route handler carregar um `if` com
 * `return NextResponse.json(...)` repetido.
 */
export class ErroHttp extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ErroHttp"
  }
}

export const naoAutenticado = () => new ErroHttp(401, "Não autenticado")
export const semPermissao = (o = "este recurso") => new ErroHttp(403, `Sem permissão para acessar ${o}`)
export const naoEncontrado = (o = "Recurso") => new ErroHttp(404, `${o} não encontrado`)

/**
 * Converte um erro em resposta. Erros conhecidos preservam o status; qualquer
 * outra coisa vira 500 com mensagem genérica — a mensagem original do Postgres
 * pode revelar nome de coluna, constraint e até dado de outro usuário.
 */
export function respostaDeErro(erro: unknown): NextResponse {
  if (erro instanceof ErroHttp) {
    return NextResponse.json({ error: erro.message }, { status: erro.status })
  }
  console.error("[erro não tratado]", erro)
  return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
}

/** Resposta de payload inválido, com o detalhe do zod para o cliente corrigir. */
export function respostaInvalida(detalhes: unknown): NextResponse {
  return NextResponse.json({ error: "Dados inválidos", detalhes }, { status: 400 })
}
