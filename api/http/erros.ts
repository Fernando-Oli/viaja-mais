import type { Context } from "hono"
import type { ZodError } from "zod"
import { ErroHttp, codigoDeErro } from "../../lib/erros"

/**
 * Converte qualquer erro lançado numa rota em resposta, num lugar só
 * (`app.onError`). Mesmo contrato de `lib/http.ts`, que as telas já conhecem:
 *
 * - `ErroHttp` → o status e a mensagem dele;
 * - qualquer outra coisa → 500 genérico. A mensagem do Postgres revela coluna,
 *   constraint e às vezes dado de outro usuário; ela vai para o log, com um
 *   código curto que também vai no cabeçalho `X-Codigo-Erro`.
 *
 * @RNF02.11 erro não revela detalhe interno do banco
 */
export function tratarErro(erro: unknown, c: Context) {
  if (erro instanceof ErroHttp) {
    for (const [nome, valor] of Object.entries(erro.headers ?? {})) c.header(nome, valor)
    return c.json({ error: erro.message }, erro.status as 400)
  }
  const codigo = codigoDeErro()
  console.error(`[erro não tratado] codigo=${codigo} ${c.req.method} ${c.req.path}`, erro)
  c.header("X-Codigo-Erro", codigo)
  return c.json({ error: "Erro interno do servidor" }, 500)
}

/** 400 com o detalhe do zod, para o cliente corrigir o campo. */
export function respostaInvalida(c: Context, erro: ZodError) {
  return c.json({ error: "Dados inválidos", detalhes: erro.flatten() }, 400)
}
