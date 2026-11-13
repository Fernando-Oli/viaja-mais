import { describe, it, expect, vi, beforeEach } from "vitest"
import { limiteExcedido, LIMITES } from "@/lib/seguranca/limite"
import { estado, reiniciar, type PerfilNoBanco } from "./perfil-visto-dubles"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"

/**
 * @RF09.1 @RF09.2 @RF09.5 @RNF02.11 — seguir e deixar de seguir
 * (POST/DELETE /api/social/perfis/[username]/seguir).
 *
 * O que prova a autorização: o vínculo é sempre criado e apagado em nome da
 * sessão — o `follower_id` vem de getUser(), e o corpo do pedido não é lido.
 * Quem decide aceito ou pendente é o trigger do banco (testado em
 * tests/rls/04-social.test.ts); aqui a rota só manda os dois ids.
 *
 * Não há caminho 403: qualquer autenticado pode seguir ou solicitar qualquer
 * perfil, e só desfaz o próprio vínculo — o filtro do DELETE é o da sessão.
 */

vi.mock("@/lib/supabase/server", async () => {
  const { clienteDaSessao } = await import("./perfil-visto-dubles")
  return { createClient: async () => clienteDaSessao() }
})
vi.mock("@/lib/supabase/admin", async () => {
  const { clienteDeServico } = await import("./perfil-visto-dubles")
  return { criarClienteAdmin: clienteDeServico }
})

import { DELETE, POST } from "@/app/api/social/perfis/[username]/seguir/route"

/** O limite real é provado em tests/lib/limite.test.ts e tests/rls/12-rate-limit.test.ts; aqui só a ligação da rota com ele. */
const limite = vi.hoisted(() => ({ exigir: vi.fn() }))
vi.mock("@/lib/seguranca/limite", async (original) => ({
  ...(await original<typeof import("@/lib/seguranca/limite")>()),
  exigirLimite: limite.exigir,
}))
beforeEach(() => {
  limite.exigir.mockReset()
  limite.exigir.mockResolvedValue(undefined)
})

const DAVI = "44444444-4444-4444-8444-444444444444"
const CARLA = "33333333-3333-4333-8333-333333333333"
const ANA = "11111111-1111-4111-8111-111111111111"

const carla: PerfilNoBanco = {
  id: CARLA,
  username: "carla",
  full_name: "Carla Teste",
  avatar_url: null,
  bio: null,
  is_public: true,
}

/**
 * O que a rota grava ao seguir: só os dois ids, em nome da sessão, com o ON
 * CONFLICT DO NOTHING da S03 (o banco real é provado em tests/rls/04-social).
 */
const GRAVACAO_DO_DAVI = {
  valores: { follower_id: DAVI, followee_id: CARLA },
  opcoes: { onConflict: "follower_id,followee_id", ignoreDuplicates: true },
}

function pedido(metodo: "POST" | "DELETE", username: string, corpo?: unknown) {
  const request = new Request(`http://localhost/api/social/perfis/${encodeURIComponent(username)}/seguir`, {
    method: metodo,
    ...(corpo ? { body: JSON.stringify(corpo), headers: { "content-type": "application/json" } } : {}),
  })
  const contexto = { params: Promise.resolve({ username }) }
  return metodo === "POST" ? POST(request, contexto) : DELETE(request, contexto)
}

beforeEach(() => {
  reiniciar()
  esquecerLinksEmitidos()
  estado.usuario = { id: DAVI }
  estado.perfil = carla
})

describe("POST /api/social/perfis/[username]/seguir", () => {
  it("403 sem_username: a sessão sem nome de usuário não segue ninguém, e nada é gravado (regressão)", async () => {
    estado.usernameDaSessao = null

    const resposta = await pedido("POST", "carla")

    expect(resposta.status).toBe(403)
    expect(await resposta.json()).toEqual({
      error: "Escolha um nome de usuário para seguir alguém",
      codigo: "sem_username",
    })
    expect(estado.gravacoes).toEqual([])
    // O username lido é o de quem está na sessão, e não o do perfil seguido.
    expect(estado.consultas).toContainEqual({ tabela: "profiles", colunas: "username", filtros: [["id", DAVI]] })
  })

  it("500: erro ao ler o username da sessão não volta cru, e nada é gravado", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    estado.erroUsernameDaSessao = { message: 'relation "profiles" x' }

    const resposta = await pedido("POST", "carla")

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    expect(log).toHaveBeenCalledWith(expect.stringMatching(/^\[erro não tratado\] codigo=[0-9a-f]{8}$/), estado.erroUsernameDaSessao)
    expect(estado.gravacoes).toEqual([])
    log.mockRestore()
  })

  it("200: cria o vínculo em nome da sessão e devolve o perfil atualizado, sem cache compartilhado", async () => {
    // Depois do insert, o banco tem o vínculo aceito (o trigger decide pelo is_public).
    estado.vinculo = { status: "accepted" }
    estado.contagem = { seguidores: 4, seguindo: 0 }

    const resposta = await pedido("POST", "carla")

    expect(resposta.status).toBe(200)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    expect(estado.gravacoes).toEqual([GRAVACAO_DO_DAVI])
    expect((await resposta.json()).perfil).toMatchObject({ username: "carla", vinculo: "seguindo", seguidores: 4 })
  })

  it("perfil privado: a rota manda os mesmos dois ids, e o vínculo volta pendente (solicitado)", async () => {
    estado.perfil = { ...carla, is_public: false }
    estado.vinculo = { status: "pending" }

    const { perfil } = await (await pedido("POST", "carla")).json()

    expect(estado.gravacoes).toEqual([GRAVACAO_DO_DAVI])
    expect(perfil.vinculo).toBe("solicitado")
  })

  it("o corpo do pedido não é lido: um follower_id forjado não chega ao banco", async () => {
    await pedido("POST", "carla", { follower_id: ANA, followee_id: ANA, status: "accepted" })

    expect(estado.gravacoes).toEqual([GRAVACAO_DO_DAVI])
  })

  it("seguir de novo manda o mesmo upsert e responde 200 com o vínculo que já existia (quem não duplica é o banco, em tests/rls/04-social)", async () => {
    estado.vinculo = { status: "pending" }
    estado.perfil = { ...carla, is_public: false }

    const primeira = await pedido("POST", "carla")
    const segunda = await pedido("POST", "carla")

    expect([primeira.status, segunda.status]).toEqual([200, 200])
    expect(estado.gravacoes).toEqual([GRAVACAO_DO_DAVI, GRAVACAO_DO_DAVI])
    expect((await segunda.json()).perfil.vinculo).toBe("solicitado")
  })

  it("400: seguir a si mesmo, sem ir ao banco", async () => {
    estado.usuario = { id: CARLA }

    const resposta = await pedido("POST", "carla")

    expect(resposta.status).toBe(400)
    expect(await resposta.json()).toEqual({ error: "Você não pode seguir a si mesmo" })
    expect(estado.gravacoes).toEqual([])
  })

  it("401: sem sessão não chega a consultar", async () => {
    estado.usuario = null

    expect((await pedido("POST", "carla")).status).toBe(401)
    expect(estado.consultas).toEqual([])
    expect(estado.gravacoes).toEqual([])
  })

  it("400: username fora do formato, sem consultar", async () => {
    expect((await pedido("POST", "../carla")).status).toBe(400)
    expect(estado.consultas).toEqual([])
  })

  it("404: username que ninguém usa, sem gravar", async () => {
    estado.perfil = null

    expect((await pedido("POST", "nao_existe")).status).toBe(404)
    expect(estado.gravacoes).toEqual([])
  })

  it("500: outro erro ao gravar não volta cru", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    estado.erroGravacao = { code: "42501", message: 'permission denied for table "follows"' }

    const resposta = await pedido("POST", "carla")

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    log.mockRestore()
  })
})

describe("DELETE /api/social/perfis/[username]/seguir", () => {
  it("200: apaga só o vínculo da sessão com o perfil e devolve o perfil atualizado", async () => {
    estado.vinculo = null
    estado.contagem = { seguidores: 2, seguindo: 0 }

    const resposta = await pedido("DELETE", "carla")

    expect(resposta.status).toBe(200)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    expect(estado.remocoes).toEqual([
      [
        ["follower_id", DAVI],
        ["followee_id", CARLA],
      ],
    ])
    expect((await resposta.json()).perfil).toMatchObject({ vinculo: "nenhum", seguidores: 2 })
  })

  it("deixar de seguir quem não se segue também é sucesso", async () => {
    estado.vinculo = null

    expect((await pedido("DELETE", "carla")).status).toBe(200)
  })

  it("400: desfazer consigo mesmo, com mensagem própria, sem ir ao banco", async () => {
    estado.usuario = { id: CARLA }

    const resposta = await pedido("DELETE", "carla")

    expect(resposta.status).toBe(400)
    expect(await resposta.json()).toEqual({ error: "Não existe vínculo com o próprio perfil" })
    expect(estado.remocoes).toEqual([])
  })

  it("401, 400 e 404, sem apagar nada", async () => {
    estado.usuario = null
    expect((await pedido("DELETE", "carla")).status).toBe(401)

    estado.usuario = { id: DAVI }
    expect((await pedido("DELETE", "a")).status).toBe(400)

    estado.perfil = null
    expect((await pedido("DELETE", "nao_existe")).status).toBe(404)
    expect(estado.remocoes).toEqual([])
  })

  it("500: erro ao apagar não volta cru", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    estado.erroRemocao = { code: "42501", message: 'permission denied for table "follows"' }

    const resposta = await pedido("DELETE", "carla")

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    log.mockRestore()
  })
})

describe("POST /api/social/perfis/[username]/seguir — limite (RNF02.8)", () => {
  it("429: com o limite estourado, nenhum vínculo é gravado", async () => {
    limite.exigir.mockRejectedValueOnce(limiteExcedido(45))

    const resposta = await pedido("POST", "carla")

    expect(resposta.status).toBe(429)
    expect(resposta.headers.get("Retry-After")).toBe("45")
    expect(estado.gravacoes).toEqual([])
    expect(limite.exigir).toHaveBeenCalledWith(expect.anything(), LIMITES.seguir)
  })

  it("deixar de seguir não passa pelo limite", async () => {
    await pedido("DELETE", "carla")

    expect(limite.exigir).not.toHaveBeenCalled()
  })
})
