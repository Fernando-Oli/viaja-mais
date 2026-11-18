/**
 * Dublês dos clientes Supabase para a rota da capa do post
 * (`/api/social/viagens/[tripId]/post/capa`, S06-M-publicar-viagem, @RF09.7).
 *
 * - O da sessão responde ao que a rota e os helpers reais pedem: o papel em
 *   `trip_members` (`exigirMembro`), a função `social_meu_post_da_viagem` e o
 *   select do post (`postDaViagem`), e a leitura e a troca condicionada de
 *   `cover_path` (`definirCapa`). Qualquer outra tabela ou função lança: a rota
 *   não tem por que tocá-las.
 * - O de serviço só tem Storage: envio, remoção e assinatura.
 *
 * Os helpers de lib/social (posts.ts, capa.ts) rodam de verdade sobre estes
 * dublês: o teste prova a ligação da rota com eles, e não uma cópia deles.
 *
 * Como o builder real do supabase-js, as consultas são preguiçosas: só executam
 * (e só ficam registradas) no `await`. A troca de `cover_path` compara a
 * condição com o valor "no banco" (`estado.capaNoBanco`), e
 * `estado.outraAbaTrocouPara` simula outra aba gravando entre a leitura e a
 * troca — o 409 sai do helper real, não de uma flag.
 *
 * O estado mora em `estado`, que cada teste reinicia com `reiniciar()`.
 */

type Erro = { code?: string; message: string } | null
type Filtro = [string, unknown]

export type Pedido =
  | { tipo: "papel"; tabela: string; colunas: string; filtros: Filtro[] }
  | { tipo: "rpc"; funcao: string; argumentos: unknown }
  | { tipo: "post"; colunas: string; filtros: Filtro[] }
  | { tipo: "capa-atual"; filtros: Filtro[] }
  | { tipo: "troca"; valores: Record<string, unknown>; filtros: Filtro[]; retorno: string }

/** Um thenable que só executa `executar` quando alguém o espera. */
function preguicoso<T>(executar: () => T) {
  return {
    then(resolver: (r: T) => unknown, rejeitar?: (e: unknown) => unknown) {
      return Promise.resolve().then(executar).then(resolver, rejeitar)
    },
  }
}

export const DAVI = "44444444-4444-4444-8444-444444444444"
export const VIAGEM = "77777777-7777-4777-8777-777777777777"
export const POST_ID = "99999999-9999-4999-8999-999999999999"
export const URL_ASSINADA = "https://storage.teste/storage/v1/object/sign/capas-posts/"

export const estado = {
  usuario: null as { id: string } | null,
  /** Papel em trip_members; null = não é membro. */
  papel: "member" as "owner" | "member" | null,
  erroPapel: null as Erro,
  /** O que `social_meu_post_da_viagem` devolve: o id do post da sessão ou null. */
  postId: POST_ID as string | null,
  erroRpc: null as Erro,
  /** O `cover_path` gravado. */
  capaNoBanco: null as string | null,
  erroLeitura: null as Erro,
  erroEscrita: null as Erro,
  /** Se definido, outra aba grava este `cover_path` entre a leitura e a troca. */
  outraAbaTrocouPara: undefined as string | null | undefined,
  pedidos: [] as Pedido[],

  erroEnvio: null as Erro,
  erroRemocao: null as Erro,
  /** O Storage real responde sem erro e com lista vazia quando não apaga nada. */
  removeVazio: false,
  erroAssinatura: null as Erro,
  buckets: [] as string[],
  /** Cada envio ao Storage, com os bytes entregues (para conferir o que foi gravado). */
  envios: [] as { caminho: string; tipo: string; upsert: unknown; tamanho: number; bytes: Uint8Array }[],
  remocoes: [] as string[][],
  assinaturas: [] as { caminhos: string[]; validade: number }[],
  clientesDeServico: 0,
}

export function reiniciar() {
  estado.usuario = null
  estado.papel = "member"
  estado.erroPapel = null
  estado.postId = POST_ID
  estado.erroRpc = null
  estado.capaNoBanco = null
  estado.erroLeitura = null
  estado.erroEscrita = null
  estado.outraAbaTrocouPara = undefined
  estado.pedidos.length = 0
  estado.erroEnvio = null
  estado.erroRemocao = null
  estado.removeVazio = false
  estado.erroAssinatura = null
  estado.buckets.length = 0
  estado.envios.length = 0
  estado.remocoes.length = 0
  estado.assinaturas.length = 0
  estado.clientesDeServico = 0
}

/** Só as trocas de `cover_path`, na ordem. */
export const trocas = () => estado.pedidos.filter((p): p is Extract<Pedido, { tipo: "troca" }> => p.tipo === "troca")

/**
 * A linha que o select do post devolve. Traz `trip_id` e `author_id` de
 * propósito: o grant real não os entrega, mas, se a rota repassasse a linha, o
 * teste das chaves proibidas pegaria.
 */
function linhaDoPost() {
  return {
    id: POST_ID,
    trip_id: VIAGEM,
    author_id: DAVI,
    title: "Chapada",
    destination: "Alto Paraíso",
    start_date: "2026-12-10",
    end_date: "2026-12-14",
    items: [{ title: "Trilha" }],
    cover_path: estado.capaNoBanco,
    created_at: "2026-11-16T12:00:00.000Z",
    updated_at: "2026-11-16T12:00:00.000Z",
  }
}

/** Cadeia de filtros que termina em `maybeSingle()`. */
function leitura(registrar: (colunas: string, filtros: Filtro[]) => { data: unknown; error: Erro }) {
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
    maybeSingle: () => preguicoso(() => registrar(colunas, filtros)),
  }
  return cadeia
}

/** UPDATE com filtros `eq`/`is`, `.select()` e `.maybeSingle()`: aplica a condição sobre `capaNoBanco`. */
function troca(valores: Record<string, unknown>) {
  const filtros: Filtro[] = []
  let retorno = ""
  const cadeia = {
    eq(coluna: string, valor: unknown) {
      filtros.push([coluna, valor])
      return cadeia
    },
    is(coluna: string, valor: null) {
      filtros.push([`${coluna} is`, valor])
      return cadeia
    },
    select(r: string) {
      retorno = r
      return cadeia
    },
    maybeSingle: () =>
      preguicoso(() => {
        estado.pedidos.push({ tipo: "troca", valores, filtros, retorno })
        if (estado.erroEscrita) return { data: null, error: estado.erroEscrita }
        if (estado.outraAbaTrocouPara !== undefined) estado.capaNoBanco = estado.outraAbaTrocouPara

        const casa = filtros.every(([coluna, valor]) => {
          if (coluna === "id") return valor === POST_ID && estado.postId === POST_ID
          if (coluna === "cover_path") return estado.capaNoBanco === valor
          if (coluna === "cover_path is") return estado.capaNoBanco === null
          throw new Error(`filtro inesperado na troca: ${coluna}`)
        })
        if (!casa) return { data: null, error: null }
        estado.capaNoBanco = valores.cover_path as string | null
        return { data: { id: POST_ID }, error: null }
      }),
  }
  return cadeia
}

/** O cliente da sessão (lib/supabase/server). */
export function clienteDaSessao() {
  return {
    auth: { getUser: async () => ({ data: { user: estado.usuario } }) },
    rpc(funcao: string, argumentos: unknown) {
      if (funcao !== "social_meu_post_da_viagem") throw new Error(`a rota não deveria chamar ${funcao}`)
      return preguicoso(() => {
        estado.pedidos.push({ tipo: "rpc", funcao, argumentos })
        return estado.erroRpc ? { data: null, error: estado.erroRpc } : { data: estado.postId, error: null }
      })
    },
    from(tabela: string) {
      if (tabela === "trip_members") {
        return leitura((colunas, filtros) => {
          estado.pedidos.push({ tipo: "papel", tabela, colunas, filtros })
          if (estado.erroPapel) return { data: null, error: estado.erroPapel }
          return { data: estado.papel ? { role: estado.papel } : null, error: null }
        })
      }
      if (tabela !== "trip_posts") throw new Error(`a rota não deveria tocar ${tabela}`)

      return {
        select: (colunas: string) =>
          leitura((_c, filtros) => {
            const existe = estado.postId !== null && filtros.some(([c, v]) => c === "id" && v === estado.postId)
            if (colunas === "cover_path") {
              estado.pedidos.push({ tipo: "capa-atual", filtros })
              if (estado.erroLeitura) return { data: null, error: estado.erroLeitura }
              return { data: existe ? { cover_path: estado.capaNoBanco } : null, error: null }
            }
            estado.pedidos.push({ tipo: "post", colunas, filtros })
            return { data: existe ? linhaDoPost() : null, error: null }
          }).select(colunas),
        update: (valores: Record<string, unknown>) => troca(valores),
      }
    },
  }
}

/** O cliente de serviço (lib/supabase/admin): só o Storage. */
export function clienteDeServico() {
  estado.clientesDeServico++
  return {
    storage: {
      from(bucket: string) {
        estado.buckets.push(bucket)
        return {
          async upload(caminho: string, corpo: Uint8Array, opcoes: { contentType: string; upsert?: boolean }) {
            estado.envios.push({
              caminho,
              tipo: opcoes.contentType,
              upsert: opcoes.upsert,
              tamanho: corpo.byteLength,
              bytes: new Uint8Array(corpo),
            })
            return estado.erroEnvio ? { data: null, error: estado.erroEnvio } : { data: { path: caminho }, error: null }
          },
          async remove(caminhos: string[]) {
            estado.remocoes.push(caminhos)
            if (estado.erroRemocao) return { data: null, error: estado.erroRemocao }
            return { data: estado.removeVazio ? [] : caminhos.map((name) => ({ name })), error: null }
          },
          async createSignedUrls(caminhos: string[], validade: number) {
            estado.assinaturas.push({ caminhos, validade })
            if (estado.erroAssinatura) return { data: null, error: estado.erroAssinatura }
            return {
              data: caminhos.map((path) => ({ path, signedUrl: `${URL_ASSINADA}${path}?token=tk`, error: null })),
              error: null,
            }
          },
        }
      },
    },
  }
}
