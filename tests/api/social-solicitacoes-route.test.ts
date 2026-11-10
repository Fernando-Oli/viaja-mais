import { describe, it, expect, vi, beforeEach } from "vitest"
import { escritas, estado, reiniciar, URL_ASSINADA, type PerfilNoBanco } from "./solicitacoes-dubles"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"
import { VALIDADE_URL_AVATAR_S } from "@/lib/social/foto"
import { LIMITE_SOLICITACOES } from "@/lib/social/solicitacoes"

/**
 * @RF09.3 @RF09.4 @RF13.2 @RNF02.11 — as solicitações para seguir (GET
 * /api/social/solicitacoes, POST e DELETE /api/social/solicitacoes/[username]).
 *
 * O que prova a autorização: tudo é lido, aprovado e recusado em nome da sessão,
 * como followee — o dono vem de getUser(), e a URL só diz quem pediu. Quem
 * garante que ninguém resolve a solicitação de outra pessoa, nem a própria, é o
 * banco (tests/rls/09-solicitacoes.test.ts).
 *
 * Não há caminho 403: ninguém tem acesso às solicitações de outra pessoa nem
 * para ser recusado. No lugar dele, os testes de que os filtros são sempre os da
 * sessão e só pegam a pendente.
 */

vi.mock("@/lib/supabase/server", async () => {
  const { clienteDaSessao } = await import("./solicitacoes-dubles")
  return { createClient: async () => clienteDaSessao() }
})
vi.mock("@/lib/supabase/admin", async () => {
  const { clienteDeServico } = await import("./solicitacoes-dubles")
  return { criarClienteAdmin: clienteDeServico }
})

import { GET } from "@/app/api/social/solicitacoes/route"
import { DELETE as recusarRota, POST as aprovarRota } from "@/app/api/social/solicitacoes/[username]/route"

const BRUNO = "22222222-2222-4222-8222-222222222222"
const DAVI = "44444444-4444-4444-8444-444444444444"
const ANA = "11111111-1111-4111-8111-111111111111"
const FOTO_DO_DAVI = `${DAVI}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`

const davi: PerfilNoBanco = { id: DAVI, username: "davi", full_name: "Davi Teste", avatar_url: null, bio: null, is_public: true }
const ana: PerfilNoBanco = { id: ANA, username: "ana", full_name: null, avatar_url: null, is_public: false }

const COLUNAS = "perfil:profiles!follows_follower_id_fkey!inner(id, username, full_name, avatar_url, is_public)"

const contexto = (username: string) => ({ params: Promise.resolve({ username }) })
const pedido = (metodo: string, username: string) =>
  new Request(`http://localhost/api/social/solicitacoes/${encodeURIComponent(username)}`, { method: metodo })
const lista = (consulta = "") => new Request(`http://localhost/api/social/solicitacoes${consulta}`)
const aprovar = (username: string) => aprovarRota(pedido("POST", username), contexto(username))
const recusar = (username: string) => recusarRota(pedido("DELETE", username), contexto(username))

function silenciarLog() {
  return vi.spyOn(console, "error").mockImplementation(() => {})
}

beforeEach(() => {
  reiniciar()
  esquecerLinksEmitidos()
  estado.usuario = { id: BRUNO }
  estado.perfil = davi
})

describe("GET /api/social/solicitacoes", () => {
  it("200: as pendentes, campo a campo, sem id, com o total e sem cache compartilhado", async () => {
    estado.pendentes = [{ perfil: { ...davi, avatar_url: FOTO_DO_DAVI, bio: "não sai" } }, { perfil: ana }]
    estado.total = 2

    const resposta = await GET(lista())

    expect(resposta.status).toBe(200)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    expect(await resposta.json()).toEqual({
      solicitacoes: [
        { username: "davi", full_name: "Davi Teste", avatar_url: `${URL_ASSINADA}${FOTO_DO_DAVI}?token=tk`, is_public: true },
        { username: "ana", full_name: null, avatar_url: null, is_public: false },
      ],
      total: 2,
    })
    expect(estado.assinaturas).toEqual([{ caminhos: [FOTO_DO_DAVI], validade: VALIDADE_URL_AVATAR_S }])
  })

  it("lê só as pendentes em que a sessão é o followee, da mais recente, com username, contando no banco", async () => {
    await GET(lista())

    expect(estado.pedidos).toEqual([
      {
        tipo: "lista",
        colunas: COLUNAS,
        opcoes: { count: "exact" },
        filtros: [
          ["followee_id", BRUNO],
          ["status", "pending"],
          ["perfil.username not is", null],
        ],
        ordem: ["created_at", { ascending: false }],
        limite: LIMITE_SOLICITACOES,
      },
    ])
    expect(LIMITE_SOLICITACOES).toBe(50)
  })

  it("o total é o do banco, também quando passa do que a lista traz", async () => {
    estado.pendentes = [{ perfil: davi }]
    estado.total = 73

    expect((await (await GET(lista())).json()).total).toBe(73)
  })

  it("sem o total do banco, conta o que veio", async () => {
    estado.pendentes = [{ perfil: davi }, { perfil: ana }]

    expect((await (await GET(lista())).json()).total).toBe(2)
  })

  it("sem pendentes: lista vazia e total zero, sem chamar o Storage", async () => {
    estado.total = 0

    expect(await (await GET(lista())).json()).toEqual({ solicitacoes: [], total: 0 })
    expect(estado.assinaturas).toEqual([])
  })

  it("401: sem sessão não chega a consultar", async () => {
    estado.usuario = null

    expect((await GET(lista())).status).toBe(401)
    expect(estado.pedidos).toEqual([])
  })

  it("500: erro do banco não volta cru", async () => {
    const log = silenciarLog()
    estado.erroLista = { code: "42501", message: 'permission denied for table "follows"' }

    const resposta = await GET(lista())

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    // O erro do banco vai inteiro ao log do servidor, e não um TypeError de depois.
    expect(log).toHaveBeenCalledWith("[erro não tratado]", estado.erroLista)
    log.mockRestore()
  })
})

describe("GET /api/social/solicitacoes?contagem=1 (a bolinha do sino)", () => {
  it("200: só o total, sem lista, sem foto e sem criar o cliente de serviço", async () => {
    estado.pendentes = [{ perfil: { ...davi, avatar_url: FOTO_DO_DAVI } }]
    estado.total = 3

    const resposta = await GET(lista("?contagem=1"))

    expect(resposta.status).toBe(200)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    expect(await resposta.json()).toEqual({ total: 3 })
    expect(estado.assinaturas).toEqual([])
    expect(estado.clientesDeServico).toBe(0)
  })

  it("conta no banco só as pendentes da sessão, com username, sem trazer linha nenhuma", async () => {
    await GET(lista("?contagem=1"))

    expect(estado.pedidos).toEqual([
      {
        tipo: "contagem",
        colunas: "perfil:profiles!follows_follower_id_fkey!inner(username)",
        opcoes: { count: "exact", head: true },
        filtros: [
          ["followee_id", BRUNO],
          ["status", "pending"],
          ["perfil.username not is", null],
        ],
      },
    ])
  })

  it("sem o total do banco, zero", async () => {
    expect(await (await GET(lista("?contagem=1"))).json()).toEqual({ total: 0 })
  })

  it.each(["?contagem=0", "?contagem=sim", "?contagem="])("400: parâmetro inválido (%s), sem consultar", async (consulta) => {
    const resposta = await GET(lista(consulta))

    expect(resposta.status).toBe(400)
    expect(estado.pedidos).toEqual([])
  })

  it("401: sem sessão não chega a consultar", async () => {
    estado.usuario = null

    expect((await GET(lista("?contagem=1"))).status).toBe(401)
    expect(estado.pedidos).toEqual([])
  })

  it("500: erro do banco não volta cru, e vai inteiro ao log", async () => {
    const log = silenciarLog()
    estado.erroLista = { code: "42501", message: 'permission denied for table "follows"' }

    const resposta = await GET(lista("?contagem=1"))

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    expect(log).toHaveBeenCalledWith("[erro não tratado]", estado.erroLista)
    log.mockRestore()
  })
})

describe.each([
  ["POST (aprovar)", aprovar, "aprovar"],
  ["DELETE (recusar)", recusar, "recusar"],
] as const)("%s /api/social/solicitacoes/[username]", (_nome, resolver, tipo) => {
  it("200: resolve só a pendente daquela pessoa, com a sessão como followee", async () => {
    const resposta = await resolver("Davi")

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ success: true })
    expect(estado.pedidos[0]).toEqual({ tipo: "perfil", colunas: expect.any(String), filtros: [["username", "davi"]] })
    expect(escritas()).toEqual([
      {
        tipo,
        ...(tipo === "aprovar" ? { valores: { status: "accepted" } } : {}),
        filtros: [
          ["followee_id", BRUNO],
          ["follower_id", DAVI],
          ["status", "pending"],
        ],
        retorno: "follower_id",
      },
    ])
  })

  it("400: username fora do formato, sem consultar", async () => {
    const resposta = await resolver("../davi")

    expect(resposta.status).toBe(400)
    expect(estado.pedidos).toEqual([])
  })

  it("404: username que ninguém usa, sem escrever", async () => {
    estado.perfil = null

    const resposta = await resolver("nao_existe")

    expect(resposta.status).toBe(404)
    // Código estável: a tela distingue "quem pediu trocou de username" de "já resolvida".
    expect(await resposta.json()).toEqual({ error: "Perfil não encontrado", codigo: "perfil_nao_encontrado" })
    expect(escritas()).toEqual([])
  })

  it("404: sem pendente daquela pessoa (nunca pediu, já resolvida ou já segue)", async () => {
    estado.afetadas = 0

    const resposta = await resolver("davi")

    expect(resposta.status).toBe(404)
    expect(await resposta.json()).toEqual({ error: "Solicitação não encontrada", codigo: "sem_pendente" })
  })

  it("401: sem sessão não chega a consultar", async () => {
    estado.usuario = null

    expect((await resolver("davi")).status).toBe(401)
    expect(estado.pedidos).toEqual([])
  })

  it.each([
    ["ler o perfil", () => (estado.erroPerfil = { code: "42P01", message: 'relation "segredo" does not exist' })],
    ["escrever", () => (estado.erroEscrita = { code: "42501", message: 'permission denied for table "follows"' })],
  ])("500: erro do banco ao %s não volta cru", async (_caso, quebrar) => {
    const log = silenciarLog()
    const erro = quebrar()

    const resposta = await resolver("davi")

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    // O erro do banco vai inteiro ao log do servidor, e não um TypeError de depois.
    expect(log).toHaveBeenCalledWith("[erro não tratado]", erro)
    log.mockRestore()
  })
})
