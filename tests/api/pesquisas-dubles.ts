/**
 * Dublês dos clientes Supabase para as rotas do histórico de pesquisa
 * (S05-M-pesquisa): o da sessão, que lê `profiles` e lê/grava/apaga em
 * `search_history`, e o de serviço, que só assina fotos. Registram tudo o que a
 * rota pede, em ordem, para os testes provarem QUEM foi consultado, COM QUAIS
 * filtros e EM QUE ORDEM (apagar a entrada antiga antes de gravar a nova).
 *
 * Como o builder real do supabase-js, as consultas são preguiçosas: só executam
 * (e só ficam registradas) no `await`. Uma rota que esquecesse o `await` não
 * gravaria nada, e o teste perceberia.
 *
 * O estado mora em `estado`, que cada teste reinicia com `reiniciar()`. Os
 * arquivos de teste ligam os dublês pelo `vi.mock`, com `await import` deste
 * módulo dentro da fábrica.
 */

type Erro = { code?: string; message: string } | null
type Resolver<T> = (r: T) => unknown

export type PerfilNoBanco = {
  id: string
  username: string | null
  full_name: string | null
  avatar_url: string | null
  bio?: string | null
  is_public: boolean
  [extra: string]: unknown
}

export type Pedido =
  | { tipo: "perfil"; colunas: string; filtros: [string, unknown][] }
  | { tipo: "historico"; colunas: string; filtros: [string, unknown][]; ordem: [string, unknown]; limite: number }
  | { tipo: "apagar"; filtros: [string, unknown][] }
  | { tipo: "gravar"; valores: Record<string, unknown>; opcoes: unknown }

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
  historico: [] as { perfil: PerfilNoBanco | null }[],
  erroHistorico: null as Erro,
  erroApagar: null as Erro,
  erroGravar: null as Erro,
  semChave: false,
  pedidos: [] as Pedido[],
  assinaturas: [] as { caminhos: string[]; validade: number }[],
  clientesDeServico: 0,
}

export const URL_ASSINADA = "https://storage.teste/storage/v1/object/sign/avatars/"

export function reiniciar() {
  estado.usuario = null
  estado.perfil = null
  estado.erroPerfil = null
  estado.historico = []
  estado.erroHistorico = null
  estado.erroApagar = null
  estado.erroGravar = null
  estado.semChave = false
  estado.pedidos.length = 0
  estado.assinaturas.length = 0
  estado.clientesDeServico = 0
}

/** Só os pedidos que mexem no histórico, na ordem em que a rota os fez. */
export const escritas = () => estado.pedidos.filter((p) => p.tipo === "apagar" || p.tipo === "gravar")

/** O cliente da sessão (lib/supabase/server). */
export function clienteDaSessao() {
  return {
    auth: { getUser: async () => ({ data: { user: estado.usuario } }) },
    from(tabela: string) {
      if (tabela === "profiles") {
        const filtros: [string, unknown][] = []
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
      if (tabela !== "search_history") throw new Error(`a rota não deveria tocar ${tabela}`)

      return {
        select(colunas: string) {
          const filtros: [string, unknown][] = []
          let ordem: [string, unknown] = ["", null]
          const leitura = {
            eq(coluna: string, valor: unknown) {
              filtros.push([coluna, valor])
              return leitura
            },
            gt(coluna: string, valor: unknown) {
              filtros.push([`${coluna} >`, valor])
              return leitura
            },
            order(coluna: string, opcoes: unknown) {
              ordem = [coluna, opcoes]
              return leitura
            },
            limit: (limite: number) =>
              preguicoso(() => {
                estado.pedidos.push({ tipo: "historico", colunas, filtros, ordem, limite })
                return estado.erroHistorico
                  ? { data: null, error: estado.erroHistorico }
                  : { data: estado.historico, error: null }
              }),
          }
          return leitura
        },
        delete() {
          const filtros: [string, unknown][] = []
          const remocao = {
            eq(coluna: string, valor: unknown) {
              filtros.push([coluna, valor])
              return remocao
            },
            ...preguicoso(() => {
              estado.pedidos.push({ tipo: "apagar", filtros })
              return { error: estado.erroApagar }
            }),
          }
          return remocao
        },
        upsert: (valores: Record<string, unknown>, opcoes: unknown) =>
          preguicoso(() => {
            estado.pedidos.push({ tipo: "gravar", valores, opcoes })
            return { error: estado.erroGravar }
          }),
      }
    },
  }
}

/** O cliente de serviço (lib/supabase/admin): só assina fotos, no Storage. */
export function clienteDeServico() {
  if (estado.semChave) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada")
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
