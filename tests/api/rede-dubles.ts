/**
 * Dublês dos clientes Supabase para as rotas da rede de um perfil
 * (S05-M-listas): o da sessão, que lê `profiles`, chama a `pode_ver_rede`, lê e
 * apaga em `follows`, e o de serviço, que só assina fotos. Registram tudo o que
 * a rota pede, em ordem, para os testes provarem QUEM foi consultado e COM
 * QUAIS filtros.
 *
 * Como o builder real do supabase-js, as consultas são preguiçosas: só executam
 * (e só ficam registradas) no `await`. Uma rota que esquecesse o `await` não
 * gravaria nada, e o teste perceberia.
 *
 * As leituras de `follows` respondem pela fila `estado.leituras`, na ordem em
 * que a lib as faz (a primeira página faz uma; uma página com cursor faz até
 * três: o vínculo do cursor, os empatados e os mais antigos). Fila vazia
 * responde vazio.
 *
 * O estado mora em `estado`, que cada teste reinicia com `reiniciar()`. Os
 * arquivos de teste ligam os dublês pelo `vi.mock`, com `await import` deste
 * módulo dentro da fábrica.
 */

type Erro = { code?: string; message: string } | null
type Resolver<T> = (r: T) => unknown
type Filtro = [string, unknown]

export type PerfilNoBanco = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  bio?: string | null
  is_public: boolean
  [extra: string]: unknown
}

export type Leitura = { data: unknown; error: Erro }

export type Pedido =
  | { tipo: "perfil"; colunas: string; filtros: Filtro[] }
  | { tipo: "rpc"; funcao: string; argumentos: unknown }
  | { tipo: "leitura"; colunas: string; filtros: Filtro[]; ordens: [string, unknown][]; limite: number | null; unica: boolean }
  | { tipo: "remover"; filtros: Filtro[]; retorno: string }

/** Um thenable que só executa `executar` quando alguém o espera. */
function preguicoso<T>(executar: () => T) {
  return {
    then(resolver: Resolver<T>, rejeitar?: (e: unknown) => unknown) {
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
  leituras: [] as Leitura[],
  /** Quantas linhas o DELETE achou: 0 = a pessoa não seguia a sessão. */
  afetadas: 1,
  erroEscrita: null as Erro,
  pedidos: [] as Pedido[],
  assinaturas: [] as { caminhos: string[]; validade: number }[],
  clientesDeServico: 0,
}

export const URL_ASSINADA = "https://storage.teste/storage/v1/object/sign/avatars/"

export function reiniciar() {
  estado.usuario = null
  estado.perfil = null
  estado.erroPerfil = null
  estado.podeVer = true
  estado.erroRpc = null
  estado.leituras = []
  estado.afetadas = 1
  estado.erroEscrita = null
  estado.pedidos.length = 0
  estado.assinaturas.length = 0
  estado.clientesDeServico = 0
}

/** Só as leituras de `follows`, na ordem em que a rota as fez. */
export const leiturasFeitas = () => estado.pedidos.filter((p) => p.tipo === "leitura")

/** A próxima resposta da fila, ou vazio. */
function proxima(unica: boolean): Leitura {
  return estado.leituras.shift() ?? { data: unica ? null : [], error: null }
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
      if (tabela !== "follows") throw new Error(`a rota não deveria tocar ${tabela}`)

      return {
        select(colunas: string) {
          const filtros: Filtro[] = []
          const ordens: [string, unknown][] = []
          const terminar = (limite: number | null, unica: boolean) =>
            preguicoso(() => {
              estado.pedidos.push({ tipo: "leitura", colunas, filtros, ordens, limite, unica })
              return proxima(unica)
            })
          const leitura = {
            eq(coluna: string, valor: unknown) {
              filtros.push([coluna, valor])
              return leitura
            },
            gt(coluna: string, valor: unknown) {
              filtros.push([`${coluna} >`, valor])
              return leitura
            },
            lt(coluna: string, valor: unknown) {
              filtros.push([`${coluna} <`, valor])
              return leitura
            },
            not(coluna: string, operador: string, valor: unknown) {
              filtros.push([`${coluna} not ${operador}`, valor])
              return leitura
            },
            order(coluna: string, opcoes: unknown) {
              ordens.push([coluna, opcoes])
              return leitura
            },
            limit: (limite: number) => terminar(limite, false),
            maybeSingle: () => terminar(null, true),
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
                return estado.erroEscrita
                  ? { data: null, error: estado.erroEscrita }
                  : { data: Array.from({ length: estado.afetadas }, () => ({ follower_id: "x" })), error: null }
              }),
          }
          return cadeia
        },
      }
    },
  }
}

/** O cliente de serviço (lib/supabase/admin): só assina fotos, no Storage. */
export function clienteDeServico() {
  estado.clientesDeServico++
  return {
    storage: {
      from: () => ({
        async createSignedUrls(caminhos: string[], validade: number) {
          estado.assinaturas.push({ caminhos, validade })
          return {
            data: caminhos.map((path) => ({ path, signedUrl: `${URL_ASSINADA}${path}?token=tk`, error: null })),
            error: null,
          }
        },
      }),
    },
  }
}
