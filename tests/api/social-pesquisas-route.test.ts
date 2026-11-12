import { describe, it, expect, vi, beforeEach } from "vitest"
import { escritas, estado, reiniciar, URL_ASSINADA, type PerfilNoBanco } from "./pesquisas-dubles"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"
import { VALIDADE_URL_AVATAR_S } from "@/lib/social/foto"
import { DIAS_RECENTES, LIMITE_RECENTES } from "@/lib/social/pesquisas"

/**
 * @RF09.12 @RNF02.11 — o histórico de pesquisa (GET/POST/DELETE
 * /api/social/pesquisas e DELETE /api/social/pesquisas/[username]).
 *
 * O que prova a autorização: tudo é lido, gravado e apagado em nome da sessão —
 * o dono vem de getUser(), e o corpo só passa o username. Quem garante que
 * ninguém mexe no histórico de outra pessoa, as 15 entradas e os 30 dias é o
 * banco (tests/rls/08-historico-pesquisa.test.ts).
 *
 * Não há caminho 403: ninguém tem acesso ao histórico de outra pessoa nem para
 * ser recusado. No lugar dele, os testes de que os filtros são sempre os da
 * sessão e de que um dono forjado no corpo não chega ao banco.
 */

vi.mock("@/lib/supabase/server", async () => {
  const { clienteDaSessao } = await import("./pesquisas-dubles")
  return { createClient: async () => clienteDaSessao() }
})
vi.mock("@/lib/supabase/admin", async () => {
  const { clienteDeServico } = await import("./pesquisas-dubles")
  return { criarClienteAdmin: clienteDeServico }
})

import { DELETE as limparTudo, GET, POST } from "@/app/api/social/pesquisas/route"
import { DELETE as tirarUm } from "@/app/api/social/pesquisas/[username]/route"

const DAVI = "44444444-4444-4444-8444-444444444444"
const CARLA = "33333333-3333-4333-8333-333333333333"
const ANA = "11111111-1111-4111-8111-111111111111"
const FOTO_DA_CARLA = `${CARLA}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`

const carla: PerfilNoBanco = {
  id: CARLA,
  username: "carla",
  full_name: "Carla Teste",
  avatar_url: null,
  bio: null,
  is_public: true,
}
const ana: PerfilNoBanco = { id: ANA, username: "ana", full_name: "Ana Teste", avatar_url: null, is_public: false }

const COLUNAS_DO_HISTORICO = "perfil:profiles!search_history_profile_id_fkey(id, username, full_name, avatar_url, is_public)"

const registrar = (corpo: unknown, cru?: string) =>
  POST(
    new Request("http://localhost/api/social/pesquisas", {
      method: "POST",
      body: cru ?? JSON.stringify(corpo),
      headers: { "content-type": "application/json" },
    }),
  )

const tirar = (username: string) =>
  tirarUm(new Request(`http://localhost/api/social/pesquisas/${encodeURIComponent(username)}`, { method: "DELETE" }), {
    params: Promise.resolve({ username }),
  })

function silenciarLog() {
  return vi.spyOn(console, "error").mockImplementation(() => {})
}

beforeEach(() => {
  reiniciar()
  esquecerLinksEmitidos()
  estado.usuario = { id: DAVI }
  estado.perfil = carla
})

describe("GET /api/social/pesquisas", () => {
  it("200: os recentes em ordem, campo a campo, sem id e sem cache compartilhado", async () => {
    estado.historico = [{ perfil: { ...carla, avatar_url: FOTO_DA_CARLA, bio: "não sai" } }, { perfil: ana }]

    const resposta = await GET()

    expect(resposta.status).toBe(200)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    expect(await resposta.json()).toEqual({
      recentes: [
        { username: "carla", full_name: "Carla Teste", avatar_url: `${URL_ASSINADA}${FOTO_DA_CARLA}?token=tk`, is_public: true },
        { username: "ana", full_name: "Ana Teste", avatar_url: null, is_public: false },
      ],
    })
    expect(estado.assinaturas).toEqual([{ caminhos: [FOTO_DA_CARLA], validade: VALIDADE_URL_AVATAR_S }])
  })

  it("lê só o histórico da sessão, com menos de 30 dias, do mais novo para o mais antigo, até o teto do banco", async () => {
    // O vencido continua visível ao próprio dono até o job apagá-lo (para ele
    // conseguir apagá-lo): quem o tira da tela é este filtro.
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-10-21T12:00:00.000Z"))
    try {
      await GET()
    } finally {
      vi.useRealTimers()
    }

    expect(estado.pedidos).toEqual([
      {
        tipo: "historico",
        colunas: COLUNAS_DO_HISTORICO,
        filtros: [
          ["user_id", DAVI],
          ["searched_at >", "2026-09-21T12:00:00.000Z"],
        ],
        ordem: ["searched_at", { ascending: false }],
        limite: LIMITE_RECENTES,
      },
    ])
    expect([LIMITE_RECENTES, DIAS_RECENTES]).toEqual([15, 30])
  })

  it("perfil sumido ou sem username não aparece", async () => {
    estado.historico = [{ perfil: null }, { perfil: { ...ana, username: null } }, { perfil: carla }]

    const { recentes } = await (await GET()).json()

    expect(recentes.map((p: { username: string }) => p.username)).toEqual(["carla"])
  })

  it("sem a chave de serviço, a foto vem nula e o histórico responde 200", async () => {
    const log = silenciarLog()
    estado.semChave = true
    estado.historico = [{ perfil: { ...carla, avatar_url: FOTO_DA_CARLA } }]

    const resposta = await GET()

    expect(resposta.status).toBe(200)
    expect((await resposta.json()).recentes[0].avatar_url).toBeNull()
    log.mockRestore()
  })

  it("401: sem sessão não chega a consultar", async () => {
    estado.usuario = null

    expect((await GET()).status).toBe(401)
    expect(estado.pedidos).toEqual([])
  })

  it("500: erro do banco não volta cru", async () => {
    const log = silenciarLog()
    estado.erroHistorico = { code: "42P01", message: 'relation "segredo" does not exist' }

    const resposta = await GET()

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    log.mockRestore()
  })
})

describe("POST /api/social/pesquisas", () => {
  it("200: apaga a entrada antiga e grava de novo, em nome da sessão, com o ON CONFLICT DO NOTHING", async () => {
    const resposta = await registrar({ username: " Carla " })

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ success: true })
    expect(estado.pedidos[0]).toMatchObject({ tipo: "perfil", filtros: [["username", "carla"]] })
    expect(escritas()).toEqual([
      { tipo: "apagar", filtros: [["user_id", DAVI], ["profile_id", CARLA]] },
      {
        tipo: "gravar",
        valores: { user_id: DAVI, profile_id: CARLA },
        opcoes: { onConflict: "user_id,profile_id", ignoreDuplicates: true },
      },
    ])
  })

  it("o corpo só passa o username: dono e data forjados não chegam ao banco", async () => {
    await registrar({ username: "carla", user_id: ANA, profile_id: ANA, searched_at: "2099-01-01T00:00:00Z" })

    // toEqual nos valores: o toMatchObject aceitaria um searched_at a mais.
    expect(escritas().at(-1)).toEqual({
      tipo: "gravar",
      valores: { user_id: DAVI, profile_id: CARLA },
      opcoes: { onConflict: "user_id,profile_id", ignoreDuplicates: true },
    })
  })

  it.each([
    ["JSON malformado", undefined, "{"],
    ["corpo sem username", {}, undefined],
    ["username fora do formato", { username: "../carla" }, undefined],
    ["username que não é texto", { username: 42 }, undefined],
  ])("400: %s, sem consultar", async (_caso, corpo, cru) => {
    const resposta = await registrar(corpo, cru)

    expect(resposta.status).toBe(400)
    expect(estado.pedidos).toEqual([])
  })

  it("400: o próprio perfil não entra no histórico, sem gravar", async () => {
    estado.usuario = { id: CARLA }

    const resposta = await registrar({ username: "carla" })

    expect(resposta.status).toBe(400)
    expect(await resposta.json()).toEqual({ error: "O próprio perfil não entra no histórico" })
    expect(escritas()).toEqual([])
  })

  it("404: username que ninguém usa, sem gravar", async () => {
    estado.perfil = null

    const resposta = await registrar({ username: "nao_existe" })

    expect(resposta.status).toBe(404)
    expect(await resposta.json()).toEqual({ error: "Perfil não encontrado" })
    expect(escritas()).toEqual([])
  })

  it("401: sem sessão não chega a consultar", async () => {
    estado.usuario = null

    expect((await registrar({ username: "carla" })).status).toBe(401)
    expect(estado.pedidos).toEqual([])
  })

  it.each([
    ["apagar a antiga", () => (estado.erroApagar = { code: "42501", message: 'permission denied for table "search_history"' })],
    ["gravar a nova", () => (estado.erroGravar = { code: "42501", message: 'permission denied for table "search_history"' })],
  ])("500: erro do banco ao %s não volta cru", async (_caso, quebrar) => {
    const log = silenciarLog()
    quebrar()

    const resposta = await registrar({ username: "carla" })

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    log.mockRestore()
  })

  it("se apagar a antiga falha, não grava a nova", async () => {
    const log = silenciarLog()
    estado.erroApagar = { code: "42501", message: "permission denied" }

    await registrar({ username: "carla" })

    expect(escritas().map((p) => p.tipo)).toEqual(["apagar"])
    log.mockRestore()
  })
})

describe("DELETE /api/social/pesquisas (Limpar tudo)", () => {
  it("200: apaga só o histórico da sessão", async () => {
    const resposta = await limparTudo()

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ success: true })
    expect(estado.pedidos).toEqual([{ tipo: "apagar", filtros: [["user_id", DAVI]] }])
  })

  it("401: sem sessão não apaga nada", async () => {
    estado.usuario = null

    expect((await limparTudo()).status).toBe(401)
    expect(estado.pedidos).toEqual([])
  })

  it("500: erro do banco não volta cru", async () => {
    const log = silenciarLog()
    estado.erroApagar = { code: "42501", message: 'permission denied for table "search_history"' }

    const resposta = await limparTudo()

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    log.mockRestore()
  })
})

describe("DELETE /api/social/pesquisas/[username] (o X)", () => {
  it("200: tira só aquela pessoa, só do histórico da sessão", async () => {
    const resposta = await tirar("Carla")

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ success: true })
    expect(estado.pedidos).toEqual([
      { tipo: "perfil", colunas: expect.any(String), filtros: [["username", "carla"]] },
      { tipo: "apagar", filtros: [["user_id", DAVI], ["profile_id", CARLA]] },
    ])
  })

  it("400: username fora do formato, sem consultar", async () => {
    expect((await tirar("../carla")).status).toBe(400)
    expect(estado.pedidos).toEqual([])
  })

  it("404: username que ninguém usa, sem apagar", async () => {
    estado.perfil = null

    expect((await tirar("nao_existe")).status).toBe(404)
    expect(escritas()).toEqual([])
  })

  it("401: sem sessão não chega a consultar", async () => {
    estado.usuario = null

    expect((await tirar("carla")).status).toBe(401)
    expect(estado.pedidos).toEqual([])
  })

  it.each([
    ["ler o perfil", () => (estado.erroPerfil = { code: "42P01", message: 'relation "segredo" does not exist' })],
    ["apagar", () => (estado.erroApagar = { code: "42501", message: 'permission denied for table "search_history"' })],
  ])("500: erro do banco ao %s não volta cru", async (_caso, quebrar) => {
    const log = silenciarLog()
    quebrar()

    const resposta = await tirar("carla")

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    log.mockRestore()
  })
})
