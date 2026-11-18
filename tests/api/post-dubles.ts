import { ErroHttp, semPermissao } from "@/lib/http"
import type { PessoaMarcada } from "@/lib/social/marcacoes"
import type { CopiaDoPost, PostDoAutor, ProjecaoComLugares } from "@/lib/social/posts"

/**
 * Dublês da rota do post de uma viagem (S06-M-publicar-viagem,
 * app/api/social/viagens/[tripId]/post): o cliente da sessão, o de serviço, a
 * autorização (`exigirMembro`), o username (`temUsername`), a projeção pública
 * da viagem, as funções de banco de lib/social/posts.ts e de
 * lib/social/marcacoes.ts, e as de Storage de lib/social/capa.ts.
 *
 * O `montarPost`, o `conferirMarcados`, o `conferirRecusas` e o `comRecusas`
 * NÃO são dublados: o teste usa os reais, para provar que a cópia passada ao
 * `publicar` sai da projeção, e não do corpo, e que o marcado inválido e o que
 * recusou são barrados antes de gravar. As funções de
 * banco já têm unit próprio (tests/lib/social-posts.test.ts,
 * tests/lib/marcacoes.test.ts, tests/lib/capa.test.ts) e o banco real é
 * provado em tests/rls/12-trip-posts.test.ts e 17-post-tags.test.ts; aqui
 * interessa a ordem, os argumentos e o que a rota faz com cada resposta.
 *
 * Toda chamada fica em `estado.chamadas`, em ordem, com os argumentos. O
 * cliente da sessão registra qualquer `from()` em `estado.consultasDiretas`:
 * a rota não pode ler tabela nenhuma direto (nem `trips`, nem
 * `itinerary_items`, nem `places`, nem `trip_posts`), e o teste confere que a
 * lista fica vazia.
 *
 * A projeção, o post e as pessoas do estado inicial trazem de propósito chaves
 * que nunca podem sair (`budget`, `notes`, `trip_id`, `author_id`, coordenadas,
 * e-mail...): a lib real não as devolve, e a rota precisa montar a resposta
 * campo a campo mesmo assim.
 *
 * Os arquivos de teste ligam os dublês pelo `vi.mock`, com `await import` deste
 * módulo dentro da fábrica; cada teste reinicia o estado com `reiniciar()`.
 */

type Chamada = { funcao: string; argumentos: unknown[] }

export const TRIP = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
export const ANA = "11111111-1111-4111-8111-111111111111"
export const BIA = "22222222-2222-4222-8222-222222222222"
export const CAIO = "33333333-3333-4333-8333-333333333333"
/** Membro que saiu da viagem: continua marcado, mas não é mais marcável. */
export const DORA = "44444444-4444-4444-8444-444444444444"
export const POST_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

export const LUGAR_PRAIA = "e0000000-0000-4000-8000-000000000001"
export const LUGAR_BAR = "e0000000-0000-4000-8000-000000000002"

export const CAPA = `${ANA}/dddddddd-dddd-4ddd-8ddd-dddddddddddd.webp`
export const URL_CAPA = `https://storage.teste/storage/v1/object/sign/capas-posts/${CAPA}?token=tk`
export const URL_FOTO_BIA = "https://storage.teste/storage/v1/object/sign/avatars/bia.webp?token=tk"

/** A projeção como a rota a recebe, com o que a lib real jamais traria (para provar a cópia campo a campo). */
export function projecaoPadrao(): ProjecaoComLugares {
  return {
    title: "Lisboa em família",
    destination: "Lisboa, Portugal",
    start_date: "2026-12-10",
    end_date: "2026-12-17",
    budget: 9000,
    currency: "EUR",
    description: "descrição privada da viagem",
    status: "planning",
    trip_id: TRIP,
    members: [{ email: "b@x.local" }],
    itens: [
      {
        id: "c0000000-0000-4000-8000-000000000001",
        title: "Check-in no hotel",
        date: "2026-12-10",
        start_time: "14:00:00",
        end_time: null,
        category: "accommodation",
        location: "Av. da Liberdade",
        description: "quarto 12",
        notes: "código da porta 4321",
        latitude: 38.72,
        longitude: -9.14,
        status: "confirmed",
      },
      {
        id: "c0000000-0000-4000-8000-000000000002",
        title: "Museu dos Coches",
        date: "2026-12-11",
        start_time: "10:00:00",
        end_time: "12:00:00",
        category: "activity",
        location: "Belém",
        description: "ingresso na bilheteria",
        notes: "levar o cartão do Abner",
      },
    ],
    lugares: [
      {
        id: LUGAR_PRAIA,
        name: "Praia da Ursa",
        category: "beach",
        address: "Sintra, Portugal",
        notes: "estacionar no km 2",
        latitude: 38.79,
        longitude: -9.49,
        rating: 4.9,
        visited: false,
        place_id: "ChIJ-segredo",
        user_id: ANA,
      },
      { id: LUGAR_BAR, name: "Bar do Largo", category: null, address: null, notes: "fiado" },
    ],
  } as unknown as ProjecaoComLugares
}

/** O post da sessão como a rota o recebe, também com chaves que não podem sair. */
export function postPadrao(sobre: Partial<PostDoAutor> = {}): PostDoAutor {
  return {
    id: POST_ID,
    title: "Lisboa em família",
    destination: "Lisboa, Portugal",
    start_date: "2026-12-10",
    end_date: "2026-12-17",
    caption: "Que viagem!",
    items: [{ title: "Museu dos Coches", location: "Belém", notes: "x" } as never],
    places: [{ name: "Praia da Ursa", address: "Sintra", latitude: 38.79, place_id: "ChIJ" } as never],
    cover_path: null,
    created_at: "2026-11-16T12:00:00.000Z",
    updated_at: "2026-11-16T12:00:00.000Z",
    trip_id: TRIP,
    author_id: ANA,
    ...sobre,
  } as PostDoAutor
}

/** Uma pessoa como a lib a devolve, com o e-mail que a rota não pode repassar. */
export function pessoa(id: string, username: string, avatar_url: string | null = null): PessoaMarcada {
  return { id, username, full_name: username.toUpperCase(), avatar_url, email: `${username}@x.local` } as PessoaMarcada
}

export const estado = {
  usuario: null as { id: string } | null,
  /** `false` = não participa (ou saiu) da viagem: o `exigirMembro` lança 403. */
  membro: true,
  /** O que o `exigirMembro` lança no lugar do 403 (ex.: o ErroHttp 500 com a mensagem do banco). */
  erroMembro: null as unknown,
  username: true,
  projecao: null as ProjecaoComLugares | null,
  erroProjecao: null as unknown,
  post: null as PostDoAutor | null,
  erroPost: null as unknown,
  /** O que `membrosMarcaveis` devolve. */
  marcaveis: [] as PessoaMarcada[],
  erroMarcaveis: null as unknown,
  /** As marcas gravadas do post: o que `marcadosDoPost` devolve, e o que `sincronizarMarcacoes` troca. */
  marcados: [] as PessoaMarcada[],
  /** Quem removeu a própria marca num post da sessão nesta viagem: o que `recusasDaViagem` devolve. */
  recusas: [] as string[],
  erroRecusas: null as unknown,
  erroSincronizar: null as unknown,
  /** O que `publicar` devolve; nulo = devolve o post montado da cópia recebida. */
  publicado: null as PostDoAutor | null,
  erroPublicar: null as unknown,
  /** `undefined` = devolve o post montado da cópia recebida; `null` = nenhuma linha mudou. */
  atualizado: undefined as PostDoAutor | null | undefined,
  erroAtualizar: null as unknown,
  /** O que `despublicar` devolve; `null` = nada foi apagado. */
  despublicado: { capaAnterior: null } as { capaAnterior: string | null } | null,
  erroDespublicar: null as unknown,
  capaRemovida: true,
  erroRemoverCapa: null as unknown,
  /** URL que `assinarCapa` devolve; nula = a assinatura falhou. */
  urlCapa: URL_CAPA as string | null,
  chamadas: [] as Chamada[],
  consultasDiretas: [] as string[],
  clientesDaSessao: [] as object[],
  clientesDeServico: [] as object[],
}

export function reiniciar() {
  estado.usuario = { id: ANA }
  estado.membro = true
  estado.erroMembro = null
  estado.username = true
  estado.projecao = projecaoPadrao()
  estado.erroProjecao = null
  estado.post = null
  estado.erroPost = null
  estado.marcaveis = [pessoa(BIA, "bia", URL_FOTO_BIA), pessoa(CAIO, "caio")]
  estado.erroMarcaveis = null
  estado.marcados = []
  estado.recusas = []
  estado.erroRecusas = null
  estado.erroSincronizar = null
  estado.publicado = null
  estado.erroPublicar = null
  estado.atualizado = undefined
  estado.erroAtualizar = null
  estado.despublicado = { capaAnterior: null }
  estado.erroDespublicar = null
  estado.capaRemovida = true
  estado.erroRemoverCapa = null
  estado.urlCapa = URL_CAPA
  estado.chamadas.length = 0
  estado.consultasDiretas.length = 0
  estado.clientesDaSessao.length = 0
  estado.clientesDeServico.length = 0
}

/** Nomes das funções chamadas, em ordem. */
export const funcoesChamadas = () => estado.chamadas.map((c) => c.funcao)
/** Os argumentos da primeira chamada de `funcao`. */
export const argumentosDe = (funcao: string) => estado.chamadas.find((c) => c.funcao === funcao)?.argumentos

function registrar(funcao: string, ...argumentos: unknown[]) {
  estado.chamadas.push({ funcao, argumentos })
}

function falharSe(erro: unknown) {
  if (erro) throw erro
}

/** O post que o banco devolveria para uma cópia: o que a rota recebeu de volta. */
function postDaCopia(copia: CopiaDoPost): PostDoAutor {
  return postPadrao({ ...copia, created_at: "2026-11-16T13:00:00.000Z", updated_at: "2026-11-16T13:00:00.000Z" })
}

/** O cliente da sessão (lib/supabase/server). */
export function clienteDaSessao() {
  const cliente = {
    auth: { getUser: async () => ({ data: { user: estado.usuario } }) },
    from(tabela: string) {
      estado.consultasDiretas.push(tabela)
      throw new Error(`a rota consultou a tabela ${tabela} direto`)
    },
    rpc(funcao: string) {
      estado.consultasDiretas.push(`rpc:${funcao}`)
      throw new Error(`a rota chamou a função ${funcao} direto`)
    },
  }
  estado.clientesDaSessao.push(cliente)
  return cliente
}

/** O cliente de serviço (lib/supabase/admin): só passa adiante, para `removerCapa`. */
export function clienteDeServico() {
  const cliente = { storage: { servico: true } }
  estado.clientesDeServico.push(cliente)
  return cliente
}

/** `exigirMembro` de lib/authz/trip.ts. */
export async function exigirMembro(supabase: unknown, tripId: string, userId: string | undefined) {
  registrar("exigirMembro", supabase, tripId, userId)
  falharSe(estado.erroMembro)
  if (!estado.membro) throw semPermissao("esta viagem")
  return "member" as const
}

/** `temUsername` de lib/social/perfil-visto.ts. */
export async function temUsername(supabase: unknown, id: string) {
  registrar("temUsername", supabase, id)
  return estado.username
}

/** `projecaoPublicaDaViagem` de lib/trips/publico.ts. */
export async function projecaoPublicaDaViagem(supabase: unknown, tripId: string) {
  registrar("projecaoPublicaDaViagem", supabase, tripId)
  falharSe(estado.erroProjecao)
  return estado.projecao
}

/** `postDaViagem` de lib/social/posts.ts. */
export async function postDaViagem(supabase: unknown, tripId: string) {
  registrar("postDaViagem", supabase, tripId)
  falharSe(estado.erroPost)
  return estado.post
}

/** `publicar` de lib/social/posts.ts. */
export async function publicar(supabase: unknown, dados: { tripId: string; autorId: string; copia: CopiaDoPost }) {
  registrar("publicar", supabase, dados)
  falharSe(estado.erroPublicar)
  return estado.publicado ?? postDaCopia(dados.copia)
}

/** `atualizar` de lib/social/posts.ts. */
export async function atualizar(supabase: unknown, postId: string, copia: CopiaDoPost) {
  registrar("atualizar", supabase, postId, copia)
  falharSe(estado.erroAtualizar)
  return estado.atualizado === undefined ? postDaCopia(copia) : estado.atualizado
}

/** `despublicar` de lib/social/posts.ts. */
export async function despublicar(supabase: unknown, postId: string) {
  registrar("despublicar", supabase, postId)
  falharSe(estado.erroDespublicar)
  return estado.despublicado
}

/** `membrosMarcaveis` de lib/social/marcacoes.ts. */
export async function membrosMarcaveis(supabase: unknown, tripId: string, criarAdmin: unknown) {
  registrar("membrosMarcaveis", supabase, tripId, criarAdmin)
  falharSe(estado.erroMarcaveis)
  return estado.marcaveis
}

/** `marcadosDoPost` de lib/social/marcacoes.ts. */
export async function marcadosDoPost(supabase: unknown, postId: string, criarAdmin: unknown) {
  registrar("marcadosDoPost", supabase, postId, criarAdmin)
  return estado.marcados
}

/** `recusasDaViagem` de lib/social/marcacoes.ts. */
export async function recusasDaViagem(supabase: unknown, tripId: string) {
  registrar("recusasDaViagem", supabase, tripId)
  falharSe(estado.erroRecusas)
  return new Set(estado.recusas)
}

/**
 * `sincronizarMarcacoes` de lib/social/marcacoes.ts: troca as marcas pelas
 * pessoas pedidas (das marcáveis ou das já marcadas). Repete a conferência da
 * lib real: marcado que recusou ou fora dos permitidos lança o 400 sem trocar nada.
 */
export async function sincronizarMarcacoes(
  supabase: unknown,
  postId: string,
  autorId: string,
  marcados: readonly string[],
  permitidos: Iterable<string>,
  recusas: Iterable<string> = [],
) {
  const lista = [...permitidos]
  const recusados = [...recusas]
  registrar("sincronizarMarcacoes", supabase, postId, autorId, [...marcados], lista, recusados)
  falharSe(estado.erroSincronizar)
  if (marcados.some((id) => recusados.includes(id))) throw new ErroHttp(400, "marcado_recusou")
  if (marcados.some((id) => !lista.includes(id))) throw new ErroHttp(400, "marcado_invalido")
  const conhecidas = new Map([...estado.marcados, ...estado.marcaveis].map((p) => [p.id, p]))
  estado.marcados = marcados.flatMap((id) => conhecidas.get(id) ?? [])
}

/** `assinarCapa` de lib/social/capa.ts: nunca lança. */
export async function assinarCapa(criarAdmin: unknown, caminho: string | null | undefined) {
  registrar("assinarCapa", criarAdmin, caminho)
  return caminho ? estado.urlCapa : null
}

/** `removerCapa` de lib/social/capa.ts. */
export async function removerCapa(admin: unknown, coverPath: string | null | undefined, authorId: string) {
  registrar("removerCapa", admin, coverPath, authorId)
  falharSe(estado.erroRemoverCapa)
  return estado.capaRemovida
}
