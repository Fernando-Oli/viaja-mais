import { NextResponse } from "next/server"
import { ErroHttp, codigoDeErro } from "@/lib/erros"

/**
 * Respostas de erro para as rotas do Next que ainda não migraram para a API.
 *
 * `ErroHttp` e os construtores de erro moram em `lib/erros.ts`, sem Next, porque
 * a API em Hono também os usa. Este arquivo os reexporta para que os imports
 * existentes continuem funcionando.
 */
export { ErroHttp, naoAutenticado, semPermissao, naoEncontrado } from "@/lib/erros"

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
  // informa o código, e ele acha a linha exata no log (S09-F). Fica fora do
  // corpo, que continua com a mensagem genérica de sempre.
  const codigo = codigoDeErro()
  console.error(`[erro não tratado] codigo=${codigo}`, erro)
  return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500, headers: { "X-Codigo-Erro": codigo } })
}

/** Resposta de payload inválido, com o detalhe do zod para o cliente corrigir. */
export function respostaInvalida(detalhes: unknown): NextResponse {
  return NextResponse.json({ error: "Dados inválidos", detalhes }, { status: 400 })
}
