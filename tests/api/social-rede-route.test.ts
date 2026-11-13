import { describe, it, expect, vi, beforeEach } from "vitest"
import { estado, leiturasFeitas, reiniciar, URL_ASSINADA, type PerfilNoBanco } from "./rede-dubles"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"
import { VALIDADE_URL_AVATAR_S } from "@/lib/social/foto"
import { POR_PAGINA } from "@/lib/social/rede"

/**
 * @RF09.6 @RF09.9 @RNF02.11 — as listas da rede de um perfil (GET
 * /api/social/perfis/[username]/seguidores e /seguindo) e remover seguidor
 * (DELETE /api/social/seguidores/[username]).
 *
 * O que prova a autorização:
 *   - as listas só saem se a função `pode_ver_rede` do banco, chamada com a
 *     sessão, disser sim; senão, 403 sem listar ninguém;
 *   - remover é sempre em nome da sessão, como followee: o dono vem de
 *     getUser(), e a URL só diz quem sai. Não há 403 aí: ninguém alcança os
 *     seguidores de outra pessoa nem para ser recusado.
 * Quem garante as mesmas regras pela Data API é o banco
 * (tests/rls/10-listas.test.ts), onde também se prova a paginação real.
 */

vi.mock("@/lib/supabase/server", async () => {
  const { clienteDaSessao } = await import("./rede-dubles")
  return { createClient: async () => clienteDaSessao() }
})
vi.mock("@/lib/supabase/admin", async () => {
  const { clienteDeServico } = await import("./rede-dubles")
  return { criarClienteAdmin: clienteDeServico }
})

import { GET as seguidoresRota } from "@/app/api/social/perfis/[username]/seguidores/route"
import { GET as seguindoRota } from "@/app/api/social/perfis/[username]/seguindo/route"
import { DELETE as removerRota } from "@/app/api/social/seguidores/[username]/route"

const ANA = "11111111-1111-4111-8111-111111111111"
const CARLA = "33333333-3333-4333-8333-333333333333"
const DAVI = "44444444-4444-4444-8444-444444444444"
const FOTO_DO_DAVI = `${DAVI}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`
const MOMENTO = "2026-11-10T12:00:00.123456+00:00"

const carla: PerfilNoBanco = { id: CARLA, username: "carla", full_name: "Carla Teste", avatar_url: null, bio: null, is_public: true }
const davi: PerfilNoBanco = { id: DAVI, username: "davi", full_name: "Davi Teste", avatar_url: null, bio: "não sai", is_public: true }

const SEGUIDORES = "created_at, perfil:profiles!follows_follower_id_fkey!inner(id, username, full_name, avatar_url, is_public)"
const SEGUINDO = "created_at, perfil:profiles!follows_followee_id_fkey!inner(id, username, full_name, avatar_url, is_public)"
const ORDEM = [
  ["created_at", { ascending: false }],
  ["perfil(username)", { ascending: true }],
]
const BASE_SEGUIDORES = [
  ["followee_id", CARLA],
  ["status", "accepted"],
  ["perfil.username not is", null],
]

const contexto = (username: string) => ({ params: Promise.resolve({ username }) })
const url = (username: string, lado: string, consulta = "") =>
  `http://localhost/api/social/perfis/${encodeURIComponent(username)}/${lado}${consulta}`
const seguidores = (username = "carla", consulta = "") =>
  seguidoresRota(new Request(url(username, "seguidores", consulta)), contexto(username))
const seguindo = (username = "carla", consulta = "") =>
  seguindoRota(new Request(url(username, "seguindo", consulta)), contexto(username))
const remover = (username: string) =>
  removerRota(
    new Request(`http://localhost/api/social/seguidores/${encodeURIComponent(username)}`, { method: "DELETE" }),
    contexto(username),
  )

/** N vínculos com o mesmo momento, de pessoas chamadas p01, p02... */
function vinculos(n: number, inicio = 1, created_at = MOMENTO) {
  return Array.from({ length: n }, (_, i) => {
    const nome = `p${String(inicio + i).padStart(2, "0")}`
    return { created_at, perfil: { id: `id-${nome}`, username: nome, full_name: null, avatar_url: null, is_public: true } }
  })
}

function silenciarLog() {
  return vi.spyOn(console, "error").mockImplementation(() => {})
}

beforeEach(() => {
  reiniciar()
  esquecerLinksEmitidos()
  estado.usuario = { id: ANA }
  estado.perfil = carla
})

describe("GET /api/social/perfis/[username]/seguidores e /seguindo", () => {
  it("200: as pessoas campo a campo, sem id, sem próxima página e sem cache compartilhado", async () => {
    estado.leituras = [
      {
        data: [
          { created_at: MOMENTO, perfil: { ...davi, avatar_url: FOTO_DO_DAVI } },
          { created_at: MOMENTO, perfil: { id: ANA, username: "ana", full_name: null, avatar_url: null, is_public: false } },
        ],
        error: null,
      },
    ]

    const resposta = await seguidores()

    expect(resposta.status).toBe(200)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    expect(await resposta.json()).toEqual({
      pessoas: [
        { username: "davi", full_name: "Davi Teste", avatar_url: `${URL_ASSINADA}${FOTO_DO_DAVI}?token=tk`, is_public: true },
        { username: "ana", full_name: null, avatar_url: null, is_public: false },
      ],
      proximo: null,
      proprio: false,
    })
    expect(estado.assinaturas).toEqual([{ caminhos: [FOTO_DO_DAVI], validade: VALIDADE_URL_AVATAR_S }])
  })

  it("acha o perfil pelo username, pergunta à pode_ver_rede com a sessão e lê só os aceitos dele, com username", async () => {
    await seguidores()

    expect(estado.pedidos).toEqual([
      { tipo: "perfil", colunas: "id, username, full_name, avatar_url, bio, is_public", filtros: [["username", "carla"]] },
      { tipo: "rpc", funcao: "pode_ver_rede", argumentos: { perfil: CARLA } },
      { tipo: "leitura", colunas: SEGUIDORES, filtros: BASE_SEGUIDORES, ordens: ORDEM, limite: POR_PAGINA + 1, unica: false },
    ])
    expect(POR_PAGINA).toBe(20)
  })

  it("seguindo: o dono é o follower, e a outra pessoa é o followee", async () => {
    await seguindo()

    expect(leiturasFeitas()).toEqual([
      {
        tipo: "leitura",
        colunas: SEGUINDO,
        filtros: [
          ["follower_id", CARLA],
          ["status", "accepted"],
          ["perfil.username not is", null],
        ],
        ordens: ORDEM,
        limite: POR_PAGINA + 1,
        unica: false,
      },
    ])
  })

  it("com mais de 20, traz 20 e o cursor é o username da 20ª pessoa", async () => {
    estado.leituras = [{ data: vinculos(POR_PAGINA + 1), error: null }]

    const corpo = await (await seguidores()).json()

    expect(corpo.pessoas).toHaveLength(POR_PAGINA)
    expect(corpo.pessoas.at(-1).username).toBe("p20")
    expect(corpo.proximo).toBe("p20")
  })

  it("com cursor: acha o vínculo do cursor, traz os empatados depois dele e completa com os mais antigos", async () => {
    estado.leituras = [
      { data: { created_at: MOMENTO, perfil: vinculos(1, 20)[0].perfil }, error: null },
      { data: vinculos(2, 21), error: null },
      { data: vinculos(3, 23, "2026-11-09T08:00:00+00:00"), error: null },
    ]

    const corpo = await (await seguidores("carla", "?cursor=p20")).json()

    expect(corpo).toEqual({
      pessoas: ["p21", "p22", "p23", "p24", "p25"].map((username) => ({ username, full_name: null, avatar_url: null, is_public: true })),
      proximo: null,
      proprio: false,
    })
    expect(leiturasFeitas()).toEqual([
      {
        tipo: "leitura",
        colunas: SEGUIDORES,
        filtros: [...BASE_SEGUIDORES, ["perfil.username", "p20"]],
        ordens: [],
        limite: null,
        unica: true,
      },
      {
        tipo: "leitura",
        colunas: SEGUIDORES,
        filtros: [...BASE_SEGUIDORES, ["created_at", MOMENTO], ["perfil.username >", "p20"]],
        ordens: [["perfil(username)", { ascending: true }]],
        limite: POR_PAGINA + 1,
        unica: false,
      },
      {
        tipo: "leitura",
        colunas: SEGUIDORES,
        filtros: [...BASE_SEGUIDORES, ["created_at <", MOMENTO]],
        ordens: ORDEM,
        limite: POR_PAGINA + 1 - 2,
        unica: false,
      },
    ])
  })

  it("com cursor: se os empatados já enchem a página, não lê os mais antigos", async () => {
    estado.leituras = [
      { data: { created_at: MOMENTO, perfil: vinculos(1, 1)[0].perfil }, error: null },
      { data: vinculos(POR_PAGINA + 1, 2), error: null },
    ]

    const corpo = await (await seguidores("carla", "?cursor=p01")).json()

    expect(corpo.pessoas).toHaveLength(POR_PAGINA)
    expect(corpo.proximo).toBe("p21")
    expect(leiturasFeitas()).toHaveLength(2)
  })

  it("o cursor é normalizado como o username: maiúsculas viram minúsculas", async () => {
    estado.leituras = [{ data: { created_at: MOMENTO, perfil: vinculos(1)[0].perfil }, error: null }]

    await seguidores("carla", "?cursor=P01")

    expect(leiturasFeitas()[0]).toMatchObject({ filtros: [...BASE_SEGUIDORES, ["perfil.username", "p01"]] })
  })

  it("400 cursor_invalido: o cursor não acha mais o vínculo, e a rota não continua", async () => {
    estado.leituras = [{ data: null, error: null }]

    const resposta = await seguidores("carla", "?cursor=saiu")

    expect(resposta.status).toBe(400)
    expect(await resposta.json()).toEqual({ error: "A lista mudou; recarregue", codigo: "cursor_invalido" })
    expect(leiturasFeitas()).toHaveLength(1)
  })

  it("proprio: a lista é da sessão", async () => {
    estado.usuario = { id: CARLA }

    expect((await (await seguidores()).json()).proprio).toBe(true)
  })

  it("403: a pode_ver_rede diz não, e ninguém é listado", async () => {
    estado.podeVer = false

    const resposta = await seguidores("bruno")

    expect(resposta.status).toBe(403)
    expect(await resposta.json()).toEqual({ error: "Sem permissão para acessar a rede deste perfil" })
    expect(leiturasFeitas()).toEqual([])
    expect(estado.clientesDeServico).toBe(0)
  })

  it("403 também quando a função não responde true (nulo, por exemplo)", async () => {
    estado.podeVer = null

    expect((await seguindo("bruno")).status).toBe(403)
    expect(leiturasFeitas()).toEqual([])
  })

  it("401: sem sessão não chega a consultar", async () => {
    estado.usuario = null

    const resposta = await seguidores()

    expect(resposta.status).toBe(401)
    expect(estado.pedidos).toEqual([])
  })

  it.each([
    ["username fora do formato", "a b", ""],
    ["username curto", "ab", ""],
    ["cursor fora do formato", "carla", "?cursor=..%2Fdavi"],
    ["cursor vazio", "carla", "?cursor="],
  ])("400: %s, sem consultar o banco", async (_caso, username, consulta) => {
    const resposta = await seguidores(username, consulta)

    expect(resposta.status).toBe(400)
    expect(estado.pedidos).toEqual([])
  })

  it("404: ninguém usa o username, e a pode_ver_rede nem é chamada", async () => {
    estado.perfil = null

    const resposta = await seguindo("ninguem")

    expect(resposta.status).toBe(404)
    expect(await resposta.json()).toEqual({ error: "Perfil não encontrado" })
    expect(estado.pedidos.map((p) => p.tipo)).toEqual(["perfil"])
  })

  it.each([
    ["ler o perfil", () => (estado.erroPerfil = { message: 'relation "profiles" x' }), ""],
    ["perguntar à pode_ver_rede", () => (estado.erroRpc = { message: "function pode_ver_rede x" }), ""],
    ["ler a primeira página", () => (estado.leituras = [{ data: null, error: { message: "follows x" } }]), ""],
    ["achar o vínculo do cursor", () => (estado.leituras = [{ data: null, error: { message: "follows x" } }]), "?cursor=p01"],
    [
      "ler os empatados",
      () =>
        (estado.leituras = [
          { data: { created_at: MOMENTO, perfil: vinculos(1)[0].perfil }, error: null },
          { data: null, error: { message: "follows x" } },
        ]),
      "?cursor=p01",
    ],
    [
      "ler os mais antigos",
      () =>
        (estado.leituras = [
          { data: { created_at: MOMENTO, perfil: vinculos(1)[0].perfil }, error: null },
          { data: [], error: null },
          { data: null, error: { message: "follows x" } },
        ]),
      "?cursor=p01",
    ],
  ])("500: erro do banco ao %s não volta cru, e vai inteiro ao log", async (_caso, quebrar, consulta) => {
    const log = silenciarLog()
    quebrar()
    const esperado = estado.erroPerfil ?? estado.erroRpc ?? estado.leituras.find((l) => l.error)?.error

    const resposta = await seguidores("carla", consulta)

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[erro não tratado\] codigo=[0-9a-f]{8}$/), esperado)
    log.mockRestore()
  })
})

describe("DELETE /api/social/seguidores/[username]", () => {
  beforeEach(() => {
    estado.usuario = { id: CARLA }
    estado.perfil = davi
  })

  it("200: remove só o vínculo aceito do Davi com a sessão como followee", async () => {
    const resposta = await remover("davi")

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ success: true })
    expect(estado.pedidos).toEqual([
      { tipo: "perfil", colunas: "id, username, full_name, avatar_url, bio, is_public", filtros: [["username", "davi"]] },
      {
        tipo: "remover",
        filtros: [
          ["followee_id", CARLA],
          ["follower_id", DAVI],
          ["status", "accepted"],
        ],
        retorno: "follower_id",
      },
    ])
  })

  it("normaliza o username da URL", async () => {
    await remover("DAVI")

    expect(estado.pedidos[0]).toMatchObject({ filtros: [["username", "davi"]] })
  })

  it("404 nao_e_seguidor: a pessoa existe, mas não segue a sessão", async () => {
    estado.afetadas = 0

    const resposta = await remover("davi")

    expect(resposta.status).toBe(404)
    expect(await resposta.json()).toEqual({ error: "Essa pessoa não segue você", codigo: "nao_e_seguidor" })
  })

  it("404 perfil_nao_encontrado: ninguém usa o username, e nada é apagado", async () => {
    estado.perfil = null

    const resposta = await remover("ninguem")

    expect(resposta.status).toBe(404)
    expect(await resposta.json()).toEqual({ error: "Perfil não encontrado", codigo: "perfil_nao_encontrado" })
    expect(estado.pedidos.map((p) => p.tipo)).toEqual(["perfil"])
  })

  it("400: username fora do formato, sem consultar o banco", async () => {
    const resposta = await remover("../davi")

    expect(resposta.status).toBe(400)
    expect(estado.pedidos).toEqual([])
  })

  it("401: sem sessão não chega a consultar", async () => {
    estado.usuario = null

    const resposta = await remover("davi")

    expect(resposta.status).toBe(401)
    expect(estado.pedidos).toEqual([])
  })

  it.each([
    ["ler o perfil", () => (estado.erroPerfil = { message: "profiles x" })],
    ["apagar o vínculo", () => (estado.erroEscrita = { code: "42501", message: 'permission denied for table "follows"' })],
  ])("500: erro do banco ao %s não volta cru, e vai inteiro ao log", async (_caso, quebrar) => {
    const log = silenciarLog()
    quebrar()
    const esperado = estado.erroPerfil ?? estado.erroEscrita

    const resposta = await remover("davi")

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[erro não tratado\] codigo=[0-9a-f]{8}$/), esperado)
    log.mockRestore()
  })
})
