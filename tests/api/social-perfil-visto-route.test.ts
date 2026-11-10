import { describe, it, expect, vi, beforeEach } from "vitest"
import { estado, reiniciar, URL_ASSINADA, type PerfilNoBanco } from "./perfil-visto-dubles"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"
import { VALIDADE_URL_AVATAR_S } from "@/lib/social/foto"

/**
 * @RF02.8 @RNF02.11 — o perfil de outra pessoa (GET /api/social/perfis/[username]).
 *
 * Os dublês (perfil-visto-dubles.ts) registram cada consulta: em que tabela,
 * com quais filtros, que função foi chamada e o que o cliente de serviço
 * assinou.
 *
 * Não há caminho 403: pelo catálogo (RF02), os dados básicos são visíveis a
 * qualquer autenticado, também em perfil privado. No lugar dele, os testes de
 * que a resposta não leva o `id` nem datas como campo, de que a contagem vai
 * pela sessão e de que o cliente de serviço só assina a foto.
 */

vi.mock("@/lib/supabase/server", async () => {
  const { clienteDaSessao } = await import("./perfil-visto-dubles")
  return { createClient: async () => clienteDaSessao() }
})
vi.mock("@/lib/supabase/admin", async () => {
  const { clienteDeServico } = await import("./perfil-visto-dubles")
  return { criarClienteAdmin: clienteDeServico }
})

import { GET } from "@/app/api/social/perfis/[username]/route"

const DAVI = "44444444-4444-4444-8444-444444444444"
const CARLA = "33333333-3333-4333-8333-333333333333"

const carla: PerfilNoBanco = {
  id: CARLA,
  username: "carla",
  full_name: "Carla Teste",
  avatar_url: null,
  bio: "Viajante de teste.",
  is_public: true,
}

const ver = (username: string) =>
  GET(new Request(`http://localhost/api/social/perfis/${encodeURIComponent(username)}`), {
    params: Promise.resolve({ username }),
  })

beforeEach(() => {
  reiniciar()
  esquecerLinksEmitidos()
  estado.usuario = { id: DAVI }
  estado.perfil = carla
  estado.contagem = { seguidores: 3, seguindo: 1 }
})

describe("GET /api/social/perfis/[username]", () => {
  it("200: dados básicos, vínculo e contadores, sem cache compartilhado", async () => {
    const resposta = await ver("carla")

    expect(resposta.status).toBe(200)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    expect(await resposta.json()).toEqual({
      perfil: {
        username: "carla",
        full_name: "Carla Teste",
        avatar_url: null,
        bio: "Viajante de teste.",
        is_public: true,
        vinculo: "nenhum",
        seguidores: 3,
        seguindo: 1,
        sem_username: false,
      },
    })
  })

  it("procura pelo username e lê o vínculo e o username de quem vê, com a sessão", async () => {
    await ver(" Carla ")

    expect(estado.consultas).toEqual([
      { tabela: "profiles", colunas: "id, username, full_name, avatar_url, bio, is_public", filtros: [["username", "carla"]] },
      { tabela: "follows", colunas: "status", filtros: [["follower_id", DAVI], ["followee_id", CARLA]] },
      { tabela: "profiles", colunas: "username", filtros: [["id", DAVI]] },
    ])
  })

  it("@RF09.9 quem vê sem username recebe sem_username, para a tela trocar o Seguir pelo aviso", async () => {
    estado.usernameDaSessao = null

    expect((await (await ver("carla")).json()).perfil.sem_username).toBe(true)
  })

  it.each([
    [{ status: "accepted" as const }, "seguindo"],
    [{ status: "pending" as const }, "solicitado"],
    [null, "nenhum"],
  ])("o vínculo %j vira %s", async (vinculo, esperado) => {
    estado.vinculo = vinculo

    expect((await (await ver("carla")).json()).perfil.vinculo).toBe(esperado)
  })

  it("o próprio perfil é 'proprio', sem consultar follows", async () => {
    estado.usuario = { id: CARLA }

    const { perfil } = await (await ver("carla")).json()

    expect(perfil.vinculo).toBe("proprio")
    // Nem o username de quem vê é lido de novo: é o da própria página.
    expect(perfil.sem_username).toBe(false)
    expect(estado.consultas.map((c) => c.tabela)).toEqual(["profiles"])
  })

  it("perfil privado também traz os contadores (decisão do Micael), mas nenhuma lista", async () => {
    estado.perfil = { ...carla, is_public: false }

    const { perfil } = await (await ver("carla")).json()

    expect(perfil.is_public).toBe(false)
    expect(perfil.seguidores).toBe(3)
    expect(Object.keys(perfil)).not.toContain("lista")
  })

  it("a contagem vai pela sessão, numa chamada a contar_rede, e sem foto o cliente de serviço nem é criado", async () => {
    await ver("carla")

    // Quem conta só os aceitos, e devolve só os números, é a função do banco
    // (tests/rls/07-contar-rede.test.ts).
    expect(estado.chamadas).toEqual([{ funcao: "contar_rede", argumentos: { perfil: CARLA } }])
    expect(estado.clientesDeServico).toBe(0)
  })

  it("com foto, o cliente de serviço é criado uma vez, só para assinar", async () => {
    estado.perfil = { ...carla, avatar_url: `${CARLA}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp` }

    await ver("carla")

    expect(estado.clientesDeServico).toBe(1)
    expect(estado.chamadas).toHaveLength(1)
  })

  it("a resposta não leva id nem datas, mesmo que o banco as devolva", async () => {
    estado.perfil = { ...carla, created_at: "2026-09-10T00:00:00Z", updated_at: "2026-10-08T00:00:00Z" }

    const { perfil } = await (await ver("carla")).json()

    expect(Object.keys(perfil).sort()).toEqual(
      ["avatar_url", "bio", "full_name", "is_public", "seguidores", "seguindo", "sem_username", "username", "vinculo"].sort(),
    )
  })

  it("a foto vai como URL assinada; foto fora da pasta do dono vem nula", async () => {
    const caminho = `${CARLA}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`
    estado.perfil = { ...carla, avatar_url: caminho }
    expect((await (await ver("carla")).json()).perfil.avatar_url).toBe(`${URL_ASSINADA}${caminho}?token=tk`)
    expect(estado.assinaturas).toEqual([{ caminhos: [caminho], validade: VALIDADE_URL_AVATAR_S }])

    esquecerLinksEmitidos()
    estado.perfil = { ...carla, avatar_url: `${DAVI}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp` }
    expect((await (await ver("carla")).json()).perfil.avatar_url).toBeNull()
  })

  it("se a contagem falha, os contadores vêm nulos e o perfil responde 200", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    estado.erroContagem = { code: "42883", message: "function public.contar_rede(uuid) does not exist" }

    const resposta = await ver("carla")

    expect(resposta.status).toBe(200)
    const { perfil } = await resposta.json()
    expect([perfil.seguidores, perfil.seguindo]).toEqual([null, null])
    expect(JSON.stringify(perfil)).not.toContain("contar_rede")
    expect(log).toHaveBeenCalledWith("[perfil visto] não foi possível contar a rede", estado.erroContagem)
    log.mockRestore()
  })

  it("sem a chave de serviço, só a foto vem nula: os contadores não dependem dela", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    estado.semChave = true
    estado.perfil = { ...carla, avatar_url: `${CARLA}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp` }

    const resposta = await ver("carla")

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toMatchObject({ perfil: { seguidores: 3, seguindo: 1, avatar_url: null } })
    log.mockRestore()
  })

  it("401: sem sessão não chega a consultar", async () => {
    estado.usuario = null

    expect((await ver("carla")).status).toBe(401)
    expect(estado.consultas).toEqual([])
  })

  it.each(["ab", "ana-teste", "../carla", "a".repeat(31), ""])("400: username fora do formato (%j), sem consultar", async (nome) => {
    const resposta = await ver(nome)

    expect(resposta.status).toBe(400)
    expect(estado.consultas).toEqual([])
  })

  it("nome reservado no formato é procurado, e não recusado: a lista é regra de escrita", async () => {
    estado.perfil = null

    expect((await ver("admin")).status).toBe(404)
    expect(estado.consultas[0].filtros).toEqual([["username", "admin"]])
  })

  it("404: username que ninguém usa", async () => {
    estado.perfil = null

    const resposta = await ver("nao_existe")

    expect(resposta.status).toBe(404)
    expect(await resposta.json()).toEqual({ error: "Perfil não encontrado" })
  })

  it.each([
    ["ler o perfil", () => (estado.erroPerfil = { code: "42P01", message: 'relation "segredo" does not exist' })],
    ["ler o vínculo", () => (estado.erroVinculo = { code: "42P01", message: 'relation "segredo" does not exist' })],
  ])("500: erro do banco ao %s não volta cru", async (_caso, quebrar) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {})
    quebrar()

    const resposta = await ver("carla")

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    log.mockRestore()
  })
})
