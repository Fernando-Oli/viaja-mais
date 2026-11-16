/**
 * Erro com código HTTP. Existe para que as checagens de autorização possam
 * simplesmente lançar, em vez de cada rota carregar um `if` com a resposta de
 * erro repetida.
 *
 * Mora aqui, sem nenhuma dependência do Next, porque é usado dos dois lados da
 * migração: pela API em Hono (`api/`) e pelas rotas do Next que ainda não foram
 * portadas (`lib/http.ts` reexporta daqui).
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

/** 8 caracteres hexadecimais: curto para ditar, único o bastante para um log. */
export function codigoDeErro(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 8)
}
