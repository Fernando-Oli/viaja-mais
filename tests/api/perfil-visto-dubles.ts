/**
 * Dublês dos clientes Supabase para as rotas do perfil de outra pessoa
 * (S05-M-seguir): o da sessão, que lê `profiles`, lê/grava/apaga em `follows` e
 * chama a função `contar_rede`, e o de serviço, que só assina fotos. Registram
 * tudo o que a rota pede, para os testes provarem QUEM foi consultado e COM
 * QUAIS filtros.
 *
 * Como o builder real do supabase-js, a gravação, a remoção e a chamada da
 * função são preguiçosas: só executam (e só ficam registradas) no `await`. Uma
 * rota que esquecesse o `await` não gravaria nada, e o teste perceberia.
 *
 * O estado mora em `estado`, que cada teste reinicia com `reiniciar()`. Os
 * arquivos de teste ligam os dublês pelo `vi.mock`, com `await import` deste
 * módulo dentro da fábrica (o vi.mock sobe para o topo do arquivo).
 */

export type PerfilNoBanco = {
  id: string
  username: string
  full_name: string | null
  avatar_url: string | null
  bio: string | null
  is_public: boolean
  [extra: string]: unknown
}

type Erro = { code?: string; message: string } | null
type Consulta = { tabela: string; colunas?: string; filtros: [string, unknown][] }
type Resolver<T> = (r: T) => unknown

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
  vinculo: null as { status: "pending" | "accepted" } | null,
  erroVinculo: null as Erro,
  erroGravacao: null as Erro,
  erroRemocao: null as Erro,
  contagem: { seguidores: 0, seguindo: 0 },
  erroContagem: null as Erro,
  semChave: false,
  consultas: [] as Consulta[],
  gravacoes: [] as { valores: Record<string, unknown>; opcoes: unknown }[],
  remocoes: [] as [string, unknown][][],
  chamadas: [] as { funcao: string; argumentos: unknown }[],
  assinaturas: [] as { caminhos: string[]; validade: number }[],
  clientesDeServico: 0,
}

export const URL_ASSINADA = "https://storage.teste/storage/v1/object/sign/avatars/"

export function reiniciar() {
  estado.usuario = null
  estado.perfil = null
  estado.erroPerfil = null
  estado.vinculo = null
  estado.erroVinculo = null
  estado.erroGravacao = null
  estado.erroRemocao = null
  estado.contagem = { seguidores: 0, seguindo: 0 }
  estado.erroContagem = null
  estado.semChave = false
  estado.consultas.length = 0
  estado.gravacoes.length = 0
  estado.remocoes.length = 0
  estado.chamadas.length = 0
  estado.assinaturas.length = 0
  estado.clientesDeServico = 0
}

/** O cliente da sessão (lib/supabase/server). */
export function clienteDaSessao() {
  return {
    auth: { getUser: async () => ({ data: { user: estado.usuario } }) },
    from(tabela: string) {
      const consulta: Consulta = { tabela, filtros: [] }
      estado.consultas.push(consulta)
      const cadeia = {
        select(colunas: string) {
          consulta.colunas = colunas
          return cadeia
        },
        eq(coluna: string, valor: unknown) {
          consulta.filtros.push([coluna, valor])
          return cadeia
        },
        async maybeSingle() {
          if (tabela === "profiles") return { data: estado.perfil, error: estado.erroPerfil }
          return { data: estado.vinculo, error: estado.erroVinculo }
        },
        upsert(valores: Record<string, unknown>, opcoes: unknown) {
          return preguicoso(() => {
            estado.gravacoes.push({ valores, opcoes })
            return { error: estado.erroGravacao }
          })
        },
        delete() {
          const filtros: [string, unknown][] = []
          const remocao = {
            eq(coluna: string, valor: unknown) {
              filtros.push([coluna, valor])
              return remocao
            },
            ...preguicoso(() => {
              estado.remocoes.push(filtros)
              return { error: estado.erroRemocao }
            }),
          }
          return remocao
        },
      }
      return cadeia
    },
    rpc(funcao: string, argumentos: unknown) {
      return {
        single: () =>
          preguicoso(() => {
            estado.chamadas.push({ funcao, argumentos })
            return estado.erroContagem
              ? { data: null, error: estado.erroContagem }
              : { data: { ...estado.contagem }, error: null }
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
