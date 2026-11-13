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
    /** Cabeçalhos da resposta — ex.: `Retry-After` no 429. */
    readonly headers?: Record<string, string>,
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
    return NextResponse.json({ error: erro.message }, { status: erro.status, headers: erro.headers })
  }
  // O código vai no log e no cabeçalho da resposta: quem relata um problema
  // informa o código, e ele acha a linha exata no log da Vercel (S09-F). Fica
  // fora do corpo, que continua com a mensagem genérica de sempre.
  const codigo = codigoDeErro()
  console.error(`[erro não tratado] codigo=${codigo}`, erro)
  return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500, headers: { "X-Codigo-Erro": codigo } })
}

/** 8 caracteres hexadecimais: curto para ditar, único o bastante para um log. */
function codigoDeErro(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8)
}

/** Resposta de payload inválido, com o detalhe do zod para o cliente corrigir. */
export function respostaInvalida(detalhes: unknown): NextResponse {
  return NextResponse.json({ error: "Dados inválidos", detalhes }, { status: 400 })
}
