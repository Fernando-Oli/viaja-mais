import { describe, it, expect, vi, beforeEach } from "vitest"
import { ErroHttp } from "@/lib/http"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"
import { VALIDADE_URL_AVATAR_S } from "@/lib/social/foto"
import {
  COLUNAS_MARCACAO,
  LIMITE_MARCACOES,
  marcacoesDoPerfil,
  removerMinhaMarcacao,
} from "@/lib/social/aba-marcacoes"
import { clienteDaSessao, clienteDeServico, estado, reiniciar, URL_ASSINADA, type PerfilNoBanco } from "../api/marcacoes-dubles"

/**
 * @RF09.14 — a aba Marcações (lib/social/aba-marcacoes.ts): quem vê a aba, o
 * que cada cartão leva e remover a própria marca.
 *
 * As regras de banco (a RLS de `post_tags` e de `trip_posts`) são provadas com
 * contas reais em tests/rls/17-post-tags.test.ts; aqui, o que a lib faz com o
 * que o banco devolve.
 */

const ANA = "11111111-1111-4111-8111-111111111111"
const BRUNO = "22222222-2222-4222-8222-222222222222"
const CARLA = "33333333-3333-4333-8333-333333333333"
const POST_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const POST_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const FOTO_DO_BRUNO = `${BRUNO}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`
const CAPA_DO_BRUNO = `${BRUNO}/1c7f3d5f-6e8b-4b9f-8c2d-3f4e5d6a7b8c.jpg`
const MOMENTO_1 = "2026-11-18T12:00:00.000000+00:00"
const MOMENTO_2 = "2026-11-17T09:30:00.000000+00:00"

const carla: PerfilNoBanco = { id: CARLA, username: "carla", full_name: "Carla Teste", avatar_url: null, bio: null, is_public: false }
const bruno = { id: BRUNO, username: "bruno", full_name: "Bruno Teste", avatar_url: FOTO_DO_BRUNO }

const postVisivel = {
  title: "Férias em Lisboa",
  destination: "Lisboa, Portugal",
  start_date: "2026-06-12",
  end_date: "2026-06-18",
  caption: "Sete dias entre Alfama e Belém",
  cover_path: CAPA_DO_BRUNO,
}

const sessao = () => clienteDaSessao() as never
const aba = (quemVe = CARLA, username = "carla") => marcacoesDoPerfil(sessao(), username, quemVe, clienteDeServico as never)

function silenciarLog() {
  return vi.spyOn(console, "error").mockImplementation(() => {})
}

beforeEach(() => {
  reiniciar()
  esquecerLinksEmitidos()
  estado.perfil = carla
})

describe("marcacoesDoPerfil", () => {
  it("acha o perfil pelo username, pergunta à pode_ver_rede e lê as marcas dele, das mais recentes", async () => {
    await aba(ANA)

    expect(estado.pedidos).toEqual([
      { tipo: "perfil", colunas: "id, username, full_name, avatar_url, bio, is_public", filtros: [["username", "carla"]] },
      { tipo: "rpc", funcao: "pode_ver_rede", argumentos: { perfil: CARLA } },
      {
        tipo: "marcacoes",
        colunas: COLUNAS_MARCACAO,
        filtros: [["tagged_id", CARLA]],
        ordens: [
          ["created_at", { ascending: false }],
          ["post_id", { ascending: true }],
        ],
        limite: LIMITE_MARCACOES,
      },
    ])
  })

  it("a consulta nunca pede trip_id, author_id do post, itens, lugares nem e-mail", () => {
    expect(COLUNAS_MARCACAO).not.toMatch(/trip_id|items|places|email|\*/)
    expect(COLUNAS_MARCACAO).toContain("post:trip_posts!post_tags_post_id_fkey(")
    expect(COLUNAS_MARCACAO).toContain("autor:profiles!post_tags_author_id_fkey(")
  })

  it("username que ninguém usa: 404, sem perguntar a visibilidade nem ler marcas", async () => {
    estado.perfil = null
    const erro = await aba().catch((e) => e)
    expect(erro).toBeInstanceOf(ErroHttp)
    expect(erro.status).toBe(404)
    expect(estado.pedidos.map((p) => p.tipo)).toEqual(["perfil"])
  })

  it("perfil cuja rede a sessão não vê: 403, sem ler marcas", async () => {
    estado.podeVer = false
    const erro = await aba(ANA).catch((e) => e)
    expect(erro).toBeInstanceOf(ErroHttp)
    expect(erro.status).toBe(403)
    expect(estado.pedidos.map((p) => p.tipo)).toEqual(["perfil", "rpc"])
  })

  it("post visível: o resumo campo a campo, com a capa e a foto do autor assinadas", async () => {
    estado.linhas = [
      { post_id: POST_1, created_at: MOMENTO_1, autor: bruno, post: { ...postVisivel, trip_id: "nao-sai", items: [{ title: "x" }] } },
    ]

    const resultado = await aba(ANA)

    expect(resultado).toEqual({
      proprio: false,
      marcacoes: [
        {
          post_id: POST_1,
          marcado_em: MOMENTO_1,
          autor: { username: "bruno", full_name: "Bruno Teste", avatar_url: `${URL_ASSINADA}avatars/${FOTO_DO_BRUNO}?token=tk` },
          post: {
            title: "Férias em Lisboa",
            destination: "Lisboa, Portugal",
            start_date: "2026-06-12",
            end_date: "2026-06-18",
            caption: "Sete dias entre Alfama e Belém",
            cover_url: `${URL_ASSINADA}capas-posts/${CAPA_DO_BRUNO}?token=tk`,
          },
        },
      ],
    })
    expect(estado.assinaturas).toEqual([
      { caminhos: [FOTO_DO_BRUNO], validade: VALIDADE_URL_AVATAR_S },
      { caminhos: [CAPA_DO_BRUNO], validade: VALIDADE_URL_AVATAR_S },
    ])
  })

  it("na própria aba, o post que a sessão não enxerga vira o cartão só com quem marcou", async () => {
    estado.linhas = [{ post_id: POST_2, created_at: MOMENTO_2, autor: { ...bruno, avatar_url: null }, post: null }]

    const resultado = await aba(CARLA)

    expect(resultado).toEqual({
      proprio: true,
      marcacoes: [
        { post_id: POST_2, marcado_em: MOMENTO_2, autor: { username: "bruno", full_name: "Bruno Teste", avatar_url: null }, post: null },
      ],
    })
    // Sem foto nem capa, o cliente de serviço nem é criado.
    expect(estado.clientesDeServico).toBe(0)
  })

  it("na aba de outra pessoa, o post que a sessão não enxerga não sai", async () => {
    estado.linhas = [
      { post_id: POST_1, created_at: MOMENTO_1, autor: bruno, post: postVisivel },
      { post_id: POST_2, created_at: MOMENTO_2, autor: bruno, post: null },
    ]

    const { marcacoes } = await aba(ANA)

    expect(marcacoes.map((m) => m.post_id)).toEqual([POST_1])
  })

  it("linha sem autor legível ou sem username fica de fora", async () => {
    estado.linhas = [
      { post_id: POST_1, created_at: MOMENTO_1, autor: null, post: postVisivel },
      { post_id: POST_2, created_at: MOMENTO_2, autor: { ...bruno, username: null }, post: postVisivel },
    ]
    expect((await aba(CARLA)).marcacoes).toEqual([])
  })

  it("legenda vazia, só de espaços ou que não é texto vira nula", async () => {
    estado.linhas = [
      { post_id: POST_1, created_at: MOMENTO_1, autor: bruno, post: { ...postVisivel, caption: "   " } },
      { post_id: POST_2, created_at: MOMENTO_2, autor: bruno, post: { ...postVisivel, caption: 42 } },
    ]
    const { marcacoes } = await aba(ANA)
    expect(marcacoes.map((m) => m.post?.caption)).toEqual([null, null])
  })

  it("capa nula ou fora do formato não vai ao Storage e sai nula", async () => {
    estado.linhas = [
      { post_id: POST_1, created_at: MOMENTO_1, autor: { ...bruno, avatar_url: null }, post: { ...postVisivel, cover_path: null } },
      {
        post_id: POST_2,
        created_at: MOMENTO_2,
        autor: { ...bruno, avatar_url: null },
        post: { ...postVisivel, cover_path: "../outro/arquivo.webp" },
      },
    ]
    const { marcacoes } = await aba(ANA)
    expect(marcacoes.map((m) => m.post?.cover_url)).toEqual([null, null])
    expect(estado.clientesDeServico).toBe(0)
  })

  it("foto de autor fora da pasta dele não é assinada", async () => {
    estado.linhas = [
      { post_id: POST_1, created_at: MOMENTO_1, autor: { ...bruno, avatar_url: `${ANA}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp` }, post: null },
    ]
    const { marcacoes } = await aba(CARLA)
    expect(marcacoes[0].autor.avatar_url).toBeNull()
  })

  it("Storage fora do ar: foto e capa nulas, e a aba continua", async () => {
    const log = silenciarLog()
    estado.erroStorage = { message: "fora do ar" }
    estado.linhas = [{ post_id: POST_1, created_at: MOMENTO_1, autor: bruno, post: postVisivel }]

    const { marcacoes } = await aba(ANA)

    expect(marcacoes[0].autor.avatar_url).toBeNull()
    expect(marcacoes[0].post?.cover_url).toBeNull()
    log.mockRestore()
  })

  it("o banco sem linhas (data nula): lista vazia", async () => {
    estado.linhas = null
    expect(await aba(CARLA)).toEqual({ proprio: true, marcacoes: [] })
  })

  it("erro do banco ao ler as marcas lança um Error comum, com o original em cause", async () => {
    const original = { code: "42501", message: "permission denied for column trip_id" }
    estado.erroLeitura = original
    const erro = await aba(ANA).catch((e) => e)
    expect(erro).not.toBeInstanceOf(ErroHttp)
    expect(erro.message).not.toContain("trip_id")
    expect(erro.cause).toBe(original)
  })

  it("erro do banco ao achar o perfil ou ao perguntar a visibilidade se propaga", async () => {
    estado.erroPerfil = { message: "falhou" }
    await expect(aba()).rejects.toEqual({ message: "falhou" })

    reiniciar()
    estado.perfil = carla
    estado.erroRpc = { message: "rpc falhou" }
    await expect(aba()).rejects.toEqual({ message: "rpc falhou" })
  })
})

describe("removerMinhaMarcacao", () => {
  it("apaga só a marca da sessão no post e devolve verdadeiro", async () => {
    expect(await removerMinhaMarcacao(sessao(), POST_1, CARLA)).toBe(true)
    expect(estado.pedidos).toEqual([
      {
        tipo: "remover",
        filtros: [
          ["post_id", POST_1],
          ["tagged_id", CARLA],
        ],
        retorno: "post_id",
      },
    ])
  })

  it("sem a marca (nunca houve, já saiu, ou o post não existe): falso", async () => {
    estado.afetadas = 0
    expect(await removerMinhaMarcacao(sessao(), POST_1, CARLA)).toBe(false)
  })

  it("erro do banco lança um Error comum, com o original em cause", async () => {
    const original = { message: "falhou" }
    estado.erroRemocao = original
    const erro = await removerMinhaMarcacao(sessao(), POST_1, CARLA).catch((e) => e)
    expect(erro).not.toBeInstanceOf(ErroHttp)
    expect(erro.cause).toBe(original)
  })
})
