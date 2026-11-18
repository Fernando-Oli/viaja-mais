/**
 * Dublês dos clientes Supabase para a aba Marcações (S06-M-publicar-viagem,
 * RF09.14): o da sessão, que lê `profiles`, chama a `pode_ver_rede`, lê e
 * apaga em `post_tags`, e o de serviço, que só assina fotos e capas. Registram
 * tudo o que a lib pede, em ordem, para os testes provarem QUEM foi consultado
 * e COM QUAIS filtros.
 *
 * Como o builder real do supabase-js, as consultas são preguiçosas: só executam
 * (e só ficam registradas) no `await`.
 *
 * O estado mora em `estado`, que cada teste reinicia com `reiniciar()`. Os
 * arquivos de teste ligam os dublês pelo `vi.mock`, com `await import` deste
 * módulo dentro da fábrica, ou os passam direto à lib.
 *
 * @RF09.14
 */

type Erro = { code?: string; message: string } | null
type Filtro = [string, unknown]

export type PerfilNoBanco = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  is_public: boolean
}

export type Pedido =
  | { tipo: "perfil"; colunas: string; filtros: Filtro[] }
  | { tipo: "rpc"; funcao: string; argumentos: unknown }
  | { tipo: "marcacoes"; colunas: string; filtros: Filtro[]; ordens: [string, unknown][]; limite: number | null }
  | { tipo: "remover"; filtros: Filtro[]; retorno: string }

function preguicoso<T>(executar: () => T) {
  return {
    then(resolver: (r: T) => unknown, rejeitar?: (e: unknown) => unknown) {
      return Promise.resolve().then(executar).then(resolver, rejeitar)
    },
  }
}

export const estado = {
  usuario: null as { id: string } | null,
  perfil: null as PerfilNoBanco | null,
  erroPerfil: null as Erro,
  podeVer: true as unknown,
  erroRpc: null as Erro,
  linhas: [] as unknown[] | null,
  erroLeitura: null as Erro,
  /** Quantas marcas o DELETE achou: 0 = a sessão não está marcada no post. */
  afetadas: 1,
  erroRemocao: null as Erro,
  erroStorage: null as Erro,
  pedidos: [] as Pedido[],
  assinaturas: [] as { caminhos: string[]; validade: number }[],
  clientesDeServico: 0,
}

export const URL_ASSINADA = "https://storage.teste/storage/v1/object/sign/"

export function reiniciar() {
  estado.usuario = null
  estado.perfil = null
  estado.erroPerfil = null
  estado.podeVer = true
  estado.erroRpc = null
  estado.linhas = []
  estado.erroLeitura = null
  estado.afetadas = 1
  estado.erroRemocao = null
  estado.erroStorage = null
  estado.pedidos.length = 0
  estado.assinaturas.length = 0
  estado.clientesDeServico = 0
}

/** O cliente da sessão (lib/supabase/server). */
export function clienteDaSessao() {
  return {
    auth: { getUser: async () => ({ data: { user: estado.usuario } }) },
    rpc: (funcao: string, argumentos: unknown) =>
      preguicoso(() => {
        estado.pedidos.push({ tipo: "rpc", funcao, argumentos })
        return estado.erroRpc ? { data: null, error: estado.erroRpc } : { data: estado.podeVer, error: null }
      }),
    from(tabela: string) {
      if (tabela === "profiles") {
        const filtros: Filtro[] = []
        let colunas = ""
        const cadeia = {
          select(c: string) {
            colunas = c
            return cadeia
          },
          eq(coluna: string, valor: unknown) {
            filtros.push([coluna, valor])
            return cadeia
          },
          maybeSingle: () =>
            preguicoso(() => {
              estado.pedidos.push({ tipo: "perfil", colunas, filtros })
              return { data: estado.perfil, error: estado.erroPerfil }
            }),
        }
        return cadeia
      }
      if (tabela !== "post_tags") throw new Error(`a aba não deveria tocar ${tabela}`)

      return {
        select(colunas: string) {
          const filtros: Filtro[] = []
          const ordens: [string, unknown][] = []
          const leitura = {
            eq(coluna: string, valor: unknown) {
              filtros.push([coluna, valor])
              return leitura
            },
            order(coluna: string, opcoes: unknown) {
              ordens.push([coluna, opcoes])
              return leitura
            },
            limit: (limite: number) =>
              preguicoso(() => {
                estado.pedidos.push({ tipo: "marcacoes", colunas, filtros, ordens, limite })
                return estado.erroLeitura
                  ? { data: null, error: estado.erroLeitura }
                  : { data: estado.linhas, error: null }
              }),
          }
          return leitura
        },
        delete: () => {
          const filtros: Filtro[] = []
          const cadeia = {
            eq(coluna: string, valor: unknown) {
              filtros.push([coluna, valor])
              return cadeia
            },
            select: (retorno: string) =>
              preguicoso(() => {
                estado.pedidos.push({ tipo: "remover", filtros, retorno })
                return estado.erroRemocao
                  ? { data: null, error: estado.erroRemocao }
                  : { data: Array.from({ length: estado.afetadas }, () => ({ post_id: "x" })), error: null }
              }),
          }
          return cadeia
        },
      }
    },
  }
}

/** O cliente de serviço (lib/supabase/admin): só assina, no Storage. */
export function clienteDeServico() {
  estado.clientesDeServico++
  return {
    storage: {
      from: (bucket: string) => ({
        async createSignedUrls(caminhos: string[], validade: number) {
          estado.assinaturas.push({ caminhos, validade })
          if (estado.erroStorage) return { data: null, error: estado.erroStorage }
          return {
            data: caminhos.map((path) => ({ path, signedUrl: `${URL_ASSINADA}${bucket}/${path}?token=tk`, error: null })),
            error: null,
          }
        },
      }),
    },
  }
}
