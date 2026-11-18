import { describe, it, expect, vi, beforeEach } from "vitest"
import { estado, reiniciar, URL_ASSINADA, type PerfilNoBanco } from "./marcacoes-dubles"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"

/**
 * @RF09.14 @RNF02.11 — a aba Marcações (GET
 * /api/social/perfis/[username]/marcacoes) e remover a própria marca (DELETE
 * /api/social/marcacoes/[postId]).
 *
 * O que prova a autorização:
 *   - a aba só sai se a função `pode_ver_rede` do banco, chamada com a sessão,
 *     disser sim; senão, 403 sem ler nenhuma marca (perfil privado da pessoa
 *     marcada, para quem não a segue);
 *   - remover é sempre em nome da sessão: quem é marcado vem de getUser(), e a
 *     URL só diz o post. Não há 403 aí: o autor do post ou um terceiro, que não
 *     estão marcados, recebem 404, e o filtro do DELETE é sempre a sessão.
 * Quem garante as mesmas regras pela Data API é o banco
 * (tests/rls/17-post-tags.test.ts).
 */

vi.mock("@/lib/supabase/server", async () => {
  const { clienteDaSessao } = await import("./marcacoes-dubles")
  return { createClient: async () => clienteDaSessao() }
})
vi.mock("@/lib/supabase/admin", async () => {
  const { clienteDeServico } = await import("./marcacoes-dubles")
  return { criarClienteAdmin: clienteDeServico }
})

import { GET as abaRota } from "@/app/api/social/perfis/[username]/marcacoes/route"
import { DELETE as removerRota } from "@/app/api/social/marcacoes/[postId]/route"

const ANA = "11111111-1111-4111-8111-111111111111"
const BRUNO = "22222222-2222-4222-8222-222222222222"
const CARLA = "33333333-3333-4333-8333-333333333333"
const POST_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const POST_2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const CAPA = `${BRUNO}/1c7f3d5f-6e8b-4b9f-8c2d-3f4e5d6a7b8c.jpg`
const MOMENTO_1 = "2026-11-18T12:00:00.000000+00:00"
const MOMENTO_2 = "2026-11-17T09:30:00.000000+00:00"

const carla: PerfilNoBanco = { id: CARLA, username: "carla", full_name: "Carla Teste", avatar_url: null, bio: null, is_public: false }
const bruno = { id: BRUNO, username: "bruno", full_name: "Bruno Teste", avatar_url: null }
const post = {
  title: "Férias em Lisboa",
  destination: "Lisboa, Portugal",
  start_date: "2026-06-12",
  end_date: "2026-06-18",
  caption: null,
  cover_path: CAPA,
}

const aba = (username = "carla") =>
  abaRota(new Request(`http://localhost/api/social/perfis/${encodeURIComponent(username)}/marcacoes`), {
    params: Promise.resolve({ username }),
  })
const remover = (postId: string) =>
  removerRota(new Request(`http://localhost/api/social/marcacoes/${encodeURIComponent(postId)}`, { method: "DELETE" }), {
    params: Promise.resolve({ postId }),
  })

function silenciarLog() {
  return vi.spyOn(console, "error").mockImplementation(() => {})
}

beforeEach(() => {
  reiniciar()
  esquecerLinksEmitidos()
  estado.usuario = { id: CARLA }
  estado.perfil = carla
})

describe("GET /api/social/perfis/[username]/marcacoes", () => {
  it("200: as chaves exatas, o post visível com resumo, o invisível só com quem marcou, sem cache compartilhado", async () => {
    estado.linhas = [
      { post_id: POST_1, created_at: MOMENTO_1, autor: bruno, post },
      { post_id: POST_2, created_at: MOMENTO_2, autor: bruno, post: null },
    ]

    const resposta = await aba()

    expect(resposta.status).toBe(200)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    const corpo = await resposta.json()
    expect(Object.keys(corpo).sort()).toEqual(["marcacoes", "proprio"])
    expect(corpo).toEqual({
      proprio: true,
      marcacoes: [
        {
          post_id: POST_1,
          marcado_em: MOMENTO_1,
          autor: { username: "bruno", full_name: "Bruno Teste", avatar_url: null },
          post: {
            title: "Férias em Lisboa",
            destination: "Lisboa, Portugal",
            start_date: "2026-06-12",
            end_date: "2026-06-18",
            caption: null,
            cover_url: `${URL_ASSINADA}capas-posts/${CAPA}?token=tk`,
          },
        },
        { post_id: POST_2, marcado_em: MOMENTO_2, autor: { username: "bruno", full_name: "Bruno Teste", avatar_url: null }, post: null },
      ],
    })
    expect(Object.keys(corpo.marcacoes[0]).sort()).toEqual(["autor", "marcado_em", "post", "post_id"])
    expect(Object.keys(corpo.marcacoes[0].autor).sort()).toEqual(["avatar_url", "full_name", "username"])
    expect(Object.keys(corpo.marcacoes[0].post).sort()).toEqual([
      "caption",
      "cover_url",
      "destination",
      "end_date",
      "start_date",
      "title",
    ])
    // Nada de id interno, caminho cru, viagem ou e-mail em lugar nenhum da resposta. O link
    // assinado da capa leva o id do autor no caminho, como o da foto de perfil (o id não é
    // segredo desde a S03); fora dele, o id não aparece.
    const texto = JSON.stringify(corpo, (chave, valor) => (chave === "cover_url" ? "[link]" : valor))
    for (const proibido of ["trip_id", "author_id", "tagged_id", "cover_path", "email", BRUNO, CARLA]) {
      expect(texto).not.toContain(proibido)
    }
  })

  it("200 para quem segue: o post invisível a essa sessão não sai, e proprio é falso", async () => {
    estado.usuario = { id: ANA }
    estado.linhas = [
      { post_id: POST_1, created_at: MOMENTO_1, autor: bruno, post },
      { post_id: POST_2, created_at: MOMENTO_2, autor: bruno, post: null },
    ]

    const corpo = await (await aba()).json()

    expect(corpo.proprio).toBe(false)
    expect(corpo.marcacoes.map((m: { post_id: string }) => m.post_id)).toEqual([POST_1])
  })

  it("200 com a lista vazia", async () => {
    const resposta = await aba()
    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({ marcacoes: [], proprio: true })
  })

  it("maiúsculas na URL viram minúsculas antes de procurar o perfil", async () => {
    await aba("CARLA")
    expect(estado.pedidos[0]).toMatchObject({ tipo: "perfil", filtros: [["username", "carla"]] })
  })

  it("401 sem sessão, sem consultar nada, sem cache compartilhado", async () => {
    estado.usuario = null
    const resposta = await aba()
    expect(resposta.status).toBe(401)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    expect(estado.pedidos).toEqual([])
  })

  it("403 no perfil privado da pessoa marcada para quem não a segue, sem ler marcas", async () => {
    estado.usuario = { id: ANA }
    estado.podeVer = false
    estado.linhas = [{ post_id: POST_1, created_at: MOMENTO_1, autor: bruno, post }]

    const resposta = await aba()

    expect(resposta.status).toBe(403)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    expect(await resposta.json()).toEqual({ error: "Sem permissão para acessar as marcações deste perfil" })
    expect(estado.pedidos.map((p) => p.tipo)).toEqual(["perfil", "rpc"])
  })

  it("400 com username fora do formato, sem consultar o banco", async () => {
    const resposta = await aba("a b")
    expect(resposta.status).toBe(400)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    expect((await resposta.json()).error).toBe("Dados inválidos")
    expect(estado.pedidos).toEqual([])
  })

  it("404 quando ninguém usa o username", async () => {
    estado.perfil = null
    const resposta = await aba("ninguem")
    expect(resposta.status).toBe(404)
    expect(await resposta.json()).toEqual({ error: "Perfil não encontrado" })
    expect(estado.pedidos.map((p) => p.tipo)).toEqual(["perfil"])
  })

  it("erro do banco: 500 genérico, sem a mensagem crua", async () => {
    const log = silenciarLog()
    estado.erroLeitura = { code: "42501", message: "permission denied for column trip_id" }

    const resposta = await aba()

    expect(resposta.status).toBe(500)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    log.mockRestore()
  })
})

describe("DELETE /api/social/marcacoes/[postId]", () => {
  it("200: remove só a marca da sessão no post", async () => {
    const resposta = await remover(POST_1)

    expect(resposta.status).toBe(200)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    expect(await resposta.json()).toEqual({ ok: true })
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

  it("o uuid da URL vai em minúsculas", async () => {
    await remover(POST_1.toUpperCase())
    expect(estado.pedidos[0]).toMatchObject({ filtros: [["post_id", POST_1], ["tagged_id", CARLA]] })
  })

  it("401 sem sessão, sem tocar o banco", async () => {
    estado.usuario = null
    const resposta = await remover(POST_1)
    expect(resposta.status).toBe(401)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    expect(estado.pedidos).toEqual([])
  })

  it("quem não está marcado (o autor ou um terceiro) não remove a marca de ninguém: 404, filtrado pela sessão", async () => {
    estado.usuario = { id: BRUNO }
    estado.afetadas = 0

    const resposta = await remover(POST_1)

    expect(resposta.status).toBe(404)
    expect(await resposta.json()).toEqual({ error: "Marcação não encontrada" })
    expect(estado.pedidos).toEqual([
      {
        tipo: "remover",
        filtros: [
          ["post_id", POST_1],
          ["tagged_id", BRUNO],
        ],
        retorno: "post_id",
      },
    ])
  })

  it("400 com postId fora do formato de uuid, sem tocar o banco", async () => {
    const resposta = await remover("nao-e-uuid")
    expect(resposta.status).toBe(400)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
    expect((await resposta.json()).error).toBe("Dados inválidos")
    expect(estado.pedidos).toEqual([])
  })

  it("404 quando a sessão não tem a marca (já removida, ou post que não existe)", async () => {
    estado.afetadas = 0
    const resposta = await remover(POST_2)
    expect(resposta.status).toBe(404)
    expect(resposta.headers.get("cache-control")).toBe("private, no-store")
  })

  it("erro do banco: 500 genérico, sem a mensagem crua", async () => {
    const log = silenciarLog()
    estado.erroRemocao = { message: "detalhe interno do postgres" }

    const resposta = await remover(POST_1)

    expect(resposta.status).toBe(500)
    expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
    log.mockRestore()
  })
})
