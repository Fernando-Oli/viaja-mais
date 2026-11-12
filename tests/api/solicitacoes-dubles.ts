/**
 * Dublês dos clientes Supabase para as rotas das solicitações para seguir
 * (S05-M-solicitacoes): o da sessão, que lê `profiles` e lê, aprova e recusa em
 * `follows`, e o de serviço, que só assina fotos. Registram tudo o que a rota
 * pede, em ordem, para os testes provarem QUEM foi consultado e COM QUAIS
 * filtros.
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

export type Pedido =
  | { tipo: "perfil"; colunas: string; filtros: Filtro[] }
  | { tipo: "lista"; colunas: string; opcoes: unknown; filtros: Filtro[]; ordem: [string, unknown]; limite: number }
  | { tipo: "contagem"; colunas: string; opcoes: unknown; filtros: Filtro[] }
  | { tipo: "aprovar"; valores: Record<string, unknown>; filtros: Filtro[]; retorno: string }
  | { tipo: "recusar"; filtros: Filtro[]; retorno: string }

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
  pendentes: [] as { perfil: PerfilNoBanco }[],
  total: null as number | null,
  erroLista: null as Erro,
  /** Quantas linhas o UPDATE ou o DELETE acharam: 0 = não havia pendente. */
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
  estado.pendentes = []
  estado.total = null
  estado.erroLista = null
  estado.afetadas = 1
  estado.erroEscrita = null
  estado.pedidos.length = 0
  estado.assinaturas.length = 0
  estado.clientesDeServico = 0
}

/** Só os pedidos que mexem em `follows`, na ordem em que a rota os fez. */
export const escritas = () => estado.pedidos.filter((p) => p.tipo === "aprovar" || p.tipo === "recusar")

/** O UPDATE ou o DELETE com `.select()`: devolve as linhas afetadas. */
function escrita(registrar: (filtros: Filtro[], retorno: string) => Pedido) {
  const filtros: Filtro[] = []
  const cadeia = {
    eq(coluna: string, valor: unknown) {
      filtros.push([coluna, valor])
      return cadeia
    },
    select: (retorno: string) =>
      preguicoso(() => {
        estado.pedidos.push(registrar(filtros, retorno))
        return estado.erroEscrita
          ? { data: null, error: estado.erroEscrita }
          : { data: Array.from({ length: estado.afetadas }, () => ({ follower_id: "x" })), error: null }
      }),
  }
  return cadeia
}

/** O cliente da sessão (lib/supabase/server). */
export function clienteDaSessao() {
  return {
    auth: { getUser: async () => ({ data: { user: estado.usuario } }) },
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
        select(colunas: string, opcoes: unknown) {
          const filtros: Filtro[] = []
          let ordem: [string, unknown] = ["", null]
          const leitura = {
            // A contagem (head: true) termina nos filtros, sem ordem nem limite.
            ...preguicoso(() => {
              estado.pedidos.push({ tipo: "contagem", colunas, opcoes, filtros })
              return estado.erroLista ? { data: null, count: null, error: estado.erroLista } : { data: null, count: estado.total, error: null }
            }),
            eq(coluna: string, valor: unknown) {
              filtros.push([coluna, valor])
              return leitura
            },
            not(coluna: string, operador: string, valor: unknown) {
              filtros.push([`${coluna} not ${operador}`, valor])
              return leitura
            },
            order(coluna: string, opcoesDaOrdem: unknown) {
              ordem = [coluna, opcoesDaOrdem]
              return leitura
            },
            limit: (limite: number) =>
              preguicoso(() => {
                estado.pedidos.push({ tipo: "lista", colunas, opcoes, filtros, ordem, limite })
                return estado.erroLista
                  ? { data: null, count: null, error: estado.erroLista }
                  : { data: estado.pendentes, count: estado.total, error: null }
              }),
          }
          return leitura
        },
        update: (valores: Record<string, unknown>) =>
          escrita((filtros, retorno) => ({ tipo: "aprovar", valores, filtros, retorno })),
        delete: () => escrita((filtros, retorno) => ({ tipo: "recusar", filtros, retorno })),
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
