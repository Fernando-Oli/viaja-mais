import { describe, it, expect, vi, beforeEach } from "vitest"

/**
 * @RF02.1 @RF02.2 @RF02.5 @RF02.6 @RF02.7 @RNF02.11 — ler e editar o próprio perfil.
 *
 * Cliente falso que registra o que a rota pede ao banco: a tabela, o filtro do
 * `.eq()` e o objeto do `.update()`. É isso que prova a regra de autorização
 * desta rota — o perfil afetado é sempre o da sessão, e nada fora do schema
 * chega ao update.
 *
 * Não há caminho 403: a rota não tem perfil-alvo na URL, então não existe "perfil
 * de outra pessoa" a recusar. No lugar dele entra o teste de que o corpo não
 * escolhe o perfil nem reescreve `id`/`created_at`.
 */

type RespostaBanco = { data: Record<string, unknown> | null; error: { code?: string; message: string } | null }

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  tabelas: [] as string[],
  filtros: [] as [string, string][],
  updates: [] as Record<string, unknown>[],
  leitura: { data: null, error: null } as RespostaBanco,
  escrita: { data: null, error: null } as RespostaBanco,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from(tabela: string) {
      h.tabelas.push(tabela)
      return {
        select: () => ({
          eq: (coluna: string, valor: string) => {
            h.filtros.push([coluna, valor])
            return { maybeSingle: async () => h.leitura }
          },
        }),
        update(valores: Record<string, unknown>) {
          h.updates.push(valores)
          return {
            eq: (coluna: string, valor: string) => {
              h.filtros.push([coluna, valor])
              return { select: () => ({ maybeSingle: async () => h.escrita }) }
            },
          }
        },
      }
    },
  }),
}))

import { GET, PATCH } from "@/app/api/social/perfil/route"

const BRUNO = "22222222-2222-4222-8222-222222222222"
const ANA = "11111111-1111-4111-8111-111111111111"

const perfilBruno = {
  id: BRUNO,
  full_name: "Bruno Teste",
  avatar_url: null,
  username: "bruno",
  bio: "Viajante de teste — perfil privado.",
  is_public: false,
}

function requisicao(corpo: unknown) {
  return new Request("http://localhost/api/social/perfil", {
    method: "PATCH",
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
    headers: { "content-type": "application/json" },
  })
}

beforeEach(() => {
  h.getUser.mockReset()
  h.tabelas.length = 0
  h.filtros.length = 0
  h.updates.length = 0
  h.leitura = { data: perfilBruno, error: null }
  h.escrita = { data: perfilBruno, error: null }
})

const logadoComo = (id: string) => h.getUser.mockResolvedValue({ data: { user: { id } } })
const semSessao = () => h.getUser.mockResolvedValue({ data: { user: null } })

describe("GET /api/social/perfil", () => {
  it("200: devolve o perfil da sessão, filtrado pelo id dela", async () => {
    logadoComo(BRUNO)

    const resposta = await GET()

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ perfil: perfilBruno })
    expect(h.tabelas).toEqual(["profiles"])
    expect(h.filtros).toEqual([["id", BRUNO]])
  })

  it("401: sem sessão não chega a consultar", async () => {
    semSessao()

    const resposta = await GET()

    expect(resposta.status).toBe(401)
    expect(h.filtros).toHaveLength(0)
  })

  it("404: sessão sem linha em profiles", async () => {
    logadoComo(BRUNO)
    h.leitura = { data: null, error: null }

    expect((await GET()).status).toBe(404)
  })

  it("500: erro do banco na leitura não vaza a mensagem crua", async () => {
    logadoComo(BRUNO)
    h.leitura = { data: null, error: { code: "42P01", message: 'relation "profiles" does not exist' } }

    const resposta = await GET()

    expect(resposta.status).toBe(500)
    expect(JSON.stringify(await resposta.json())).not.toContain("relation")
  })
})

describe("PATCH /api/social/perfil", () => {
  it("200: edita o próprio perfil, com o username normalizado", async () => {
    logadoComo(BRUNO)

    const resposta = await PATCH(requisicao({ username: "Bruno_2", bio: "Nova bio", is_public: true }))

    expect(resposta.status).toBe(200)
    expect(h.updates).toEqual([
      { full_name: undefined, avatar_url: undefined, username: "bruno_2", bio: "Nova bio", is_public: true },
    ])
    expect(h.tabelas).toEqual(["profiles"])
    expect(h.filtros).toEqual([["id", BRUNO]])
  })

  it("401: sem sessão não chega a atualizar", async () => {
    semSessao()

    const resposta = await PATCH(requisicao({ bio: "Nova bio" }))

    expect(resposta.status).toBe(401)
    expect(h.updates).toHaveLength(0)
  })

  it("400: payload inválido (bio acima do limite)", async () => {
    logadoComo(BRUNO)

    const resposta = await PATCH(requisicao({ bio: "x".repeat(281) }))

    expect(resposta.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("400: username reservado", async () => {
    logadoComo(BRUNO)

    const resposta = await PATCH(requisicao({ username: "admin" }))

    expect(resposta.status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("400: corpo vazio", async () => {
    logadoComo(BRUNO)

    expect((await PATCH(requisicao({}))).status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("400: JSON malformado é payload inválido, não erro do servidor", async () => {
    logadoComo(BRUNO)

    expect((await PATCH(requisicao("{ isto não é json"))).status).toBe(400)
    expect(h.updates).toHaveLength(0)
  })

  it("o corpo não escolhe o perfil nem reescreve id/created_at (no lugar do 403)", async () => {
    // Bruno tenta editar a Ana mandando o id dela no corpo.
    logadoComo(BRUNO)

    const resposta = await PATCH(
      requisicao({ id: ANA, user_id: ANA, created_at: "2015-01-01T00:00:00Z", bio: "invadido" }),
    )

    expect(resposta.status).toBe(200)
    expect(h.filtros).toEqual([["id", BRUNO]])
    expect(h.updates).toHaveLength(1)
    expect(h.updates[0]).not.toHaveProperty("id")
    expect(h.updates[0]).not.toHaveProperty("user_id")
    expect(h.updates[0]).not.toHaveProperty("created_at")
  })

  it("404: o update não encontrou a linha da sessão", async () => {
    logadoComo(BRUNO)
    h.escrita = { data: null, error: null }

    expect((await PATCH(requisicao({ bio: "Nova bio" }))).status).toBe(404)
  })

  it("409: username em uso, sem a mensagem do Postgres", async () => {
    logadoComo(BRUNO)
    h.escrita = {
      data: null,
      error: { code: "23505", message: 'duplicate key value violates unique constraint "profiles_username_key"' },
    }

    const resposta = await PATCH(requisicao({ username: "ana" }))
    const corpo = await resposta.json()

    expect(resposta.status).toBe(409)
    expect(corpo.error).toBe("Esse nome de usuário já está em uso")
    expect(JSON.stringify(corpo)).not.toContain("profiles_username_key")
  })

  it("500: outro erro do banco não vaza a mensagem crua (RNF02.11)", async () => {
    logadoComo(BRUNO)
    h.escrita = {
      data: null,
      error: { code: "23514", message: 'new row violates check constraint "profiles_bio_tamanho"' },
    }

    const resposta = await PATCH(requisicao({ bio: "ok" }))
    const corpo = await resposta.json()

    expect(resposta.status).toBe(500)
    expect(JSON.stringify(corpo)).not.toContain("profiles_bio_tamanho")
  })
})
