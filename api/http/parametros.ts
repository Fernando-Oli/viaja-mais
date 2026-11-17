import { z } from "zod"
import { ErroHttp } from "../../lib/erros"

const uuid = z.string().uuid()

/**
 * Lê um parâmetro de rota que precisa ser UUID. Id malformado é 400 com
 * mensagem clara, e não 500 vindo do Postgres (`invalid input syntax for type uuid`).
 */
export function lerUuid(param: Record<string, string>, nome: string, rotulo: string): string {
  const analise = uuid.safeParse(param[nome])
  if (!analise.success) throw new ErroHttp(400, `id de ${rotulo} inválido`)
  return analise.data
}

/** Corpo JSON da requisição, ou `null` se não for JSON — o zod responde 400 em seguida. */
export function lerCorpo(c: { req: { json(): Promise<unknown> } }): Promise<unknown> {
  return c.req.json().catch(() => null)
}
