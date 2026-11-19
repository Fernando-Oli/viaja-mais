import { describe, it, expect, vi, beforeEach } from "vitest"
import { ANA, BIA, CAIO, DORA, VIAGEM, banco, semearMarca, semearPerfis, semearPost } from "../api/banco-falso"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"
import { ErroHttp } from "@/lib/http"
import { ErroComCodigo } from "@/lib/social/post-http"
import {
  LIMITE_DE_MARCADOS,
  MARCADO_INVALIDO,
  MARCADO_RECUSOU,
  comRecusas,
  conferirRecusas,
  marcadosDoPost,
  membrosMarcaveis,
  perfisMarcadosDosPosts,
  recusasDaViagem,
  recusasDoPost,
  sincronizarMarcacoes,
  validarMarcados,
} from "@/lib/social/marcacoes"

/**
 * @RF09.13 Marcações (lib/social/marcacoes.ts): qualquer perfil com username,
 * menos a autora (`marcado_invalido`); quem recusou não volta
 * (`marcado_recusou`, com `recusados`); membros da viagem só como sugestão; a
 * troca das marcas insere só os novos e apaga só os que saíram.
 */

const sessao = () => banco.clienteDaSessao()
const admin = () => banco.clienteDeServico()

async function erroDe(promessa: Promise<unknown> | (() => unknown)) {
  try {
    await (typeof promessa === "function" ? promessa() : promessa)
    return null
  } catch (e) {
    return e
  }
}

let post: Record<string, unknown>

beforeEach(() => {
  banco.reiniciar()
  semearPerfis()
  esquecerLinksEmitidos()
  banco.sessao = ANA
  post = semearPost({ author_id: ANA, photos: [`${ANA}/00000001-0000-4000-8000-000000000001.webp`] })
  return () => vi.restoreAllMocks()
})

describe("validarMarcados", () => {
  it("aceita perfis com username, em qualquer caixa, e lista vazia sem ir ao banco", async () => {
    await validarMarcados(sessao(), [BIA, CAIO.toUpperCase()], ANA)
    banco.consultas = []
    await validarMarcados(sessao(), [], ANA)
    expect(banco.consultas).toEqual([])
  })

  it.each([
    ["a própria autora", ANA],
    ["sem username", DORA],
    ["de ninguém", "99999999-0000-4000-8000-000000000000"],
  ])("%s é 400 marcado_invalido", async (_caso, id) => {
    const erro = await erroDe(validarMarcados(sessao(), [BIA, id], ANA))
    expect(erro).toBeInstanceOf(ErroComCodigo)
    expect(erro).toMatchObject({ status: 400, codigo: MARCADO_INVALIDO })
  })

  it("erro do banco não sai cru", async () => {
    banco.falhas.push({ tabela: "profiles", operacao: "select", erro: { code: "XX000", message: "cru" } })
    const erro = (await erroDe(validarMarcados(sessao(), [BIA], ANA))) as Error
    expect(erro).not.toBeInstanceOf(ErroHttp)
    expect(erro.message).not.toContain("cru")
  })
})

describe("recusas", () => {
  it("conferirRecusas: 400 marcado_recusou com os recusados pedidos, em minúsculas, sem repetir", () => {
    const erro = (() => {
      try {
        conferirRecusas([BIA, CAIO.toUpperCase(), CAIO], [CAIO])
      } catch (e) {
        return e
      }
    })() as ErroComCodigo
    expect(erro).toMatchObject({ status: 400, codigo: MARCADO_RECUSOU, recusados: [CAIO] })
    expect(() => conferirRecusas([BIA], [CAIO])).not.toThrow()
  })

  it("comRecusas marca recusou campo a campo", () => {
    const pessoas = [{ id: BIA, username: "bia", full_name: null, avatar_url: null, email: "x" } as never]
    expect(comRecusas(pessoas, new Set([BIA]))).toStrictEqual([{ id: BIA, username: "bia", full_name: null, avatar_url: null, recusou: true }])
  })

  it("recusasDaViagem e recusasDoPost leem as funções do banco, em minúsculas; erro vira Error sem a mensagem", async () => {
    banco.tabelas.post_tag_recusas.push(
      { trip_id: VIAGEM, post_id: null, author_id: ANA, tagged_id: BIA },
      { trip_id: null, post_id: post.id, author_id: ANA, tagged_id: CAIO },
    )
    expect([...(await recusasDaViagem(sessao(), VIAGEM))]).toEqual([BIA])
    expect([...(await recusasDoPost(sessao(), post.id as string))]).toEqual([CAIO])
    banco.falhas.push({ tabela: "rpc:social_recusas_do_post", operacao: "rpc", erro: { code: "42501" } })
    expect(await erroDe(recusasDoPost(sessao(), post.id as string))).toMatchObject({ status: 403 })
  })
})

describe("leituras", () => {
  it("membrosMarcaveis: só membros com username, sem a sessão, com a foto assinada; vazio sem ir a profiles", async () => {
    banco.membros.set(VIAGEM, [ANA, BIA, DORA])
    const sugestoes = await membrosMarcaveis(sessao(), VIAGEM, admin)
    expect(sugestoes.map((p) => p.id)).toEqual([BIA])
    expect(sugestoes[0].avatar_url).toContain("avatars")
    banco.consultas = []
    expect(await membrosMarcaveis(sessao(), "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", admin)).toEqual([])
    expect(banco.consultas).toEqual([])
  })

  it("perfisMarcadosDosPosts agrupa por post na ordem; lista vazia não vai ao banco; marcadosDoPost assina", async () => {
    semearMarca(post.id, ANA, CAIO)
    semearMarca(post.id, ANA, BIA)
    const mapa = await perfisMarcadosDosPosts(sessao(), [post.id as string, post.id as string])
    expect(mapa.get(post.id as string)!.map((p) => p.id)).toEqual([CAIO, BIA])
    banco.consultas = []
    expect((await perfisMarcadosDosPosts(sessao(), [])).size).toBe(0)
    expect(banco.consultas).toEqual([])
    const marcados = await marcadosDoPost(sessao(), post.id as string, admin)
    expect(marcados.map((p) => Object.keys(p).sort())).toEqual([
      ["avatar_url", "full_name", "id", "username"],
      ["avatar_url", "full_name", "id", "username"],
    ])
  })
})

describe("sincronizarMarcacoes", () => {
  it("insere só os novos, campo a campo, e apaga só os que saíram; os que ficam mantêm a data", async () => {
    semearMarca(post.id, ANA, BIA)
    const dataDaBia = banco.tabelas.post_tags[0].created_at
    banco.tabelas.post_tags.push({ post_id: post.id, author_id: ANA, tagged_id: "66666666-6666-4666-8666-666666666666" })
    banco.tabelas.profiles.push({ id: "66666666-6666-4666-8666-666666666666", username: "saiu" })
    await sincronizarMarcacoes(sessao(), post.id as string, ANA, [BIA, CAIO])
    expect(banco.tabelas.post_tags.map((t) => t.tagged_id)).toEqual([BIA, CAIO])
    expect(banco.tabelas.post_tags[0].created_at).toBe(dataDaBia)
    const insercao = banco.consultas.find((c) => c.operacao === "insert")!
    expect(insercao.valores).toEqual([{ post_id: post.id, tagged_id: CAIO, author_id: ANA }])
  })

  it("nada mudou: só lê", async () => {
    semearMarca(post.id, ANA, BIA)
    await sincronizarMarcacoes(sessao(), post.id as string, ANA, [BIA])
    expect(banco.consultas.map((c) => c.operacao)).toEqual(["select"])
  })

  it("quem recusou: 400 sem ler nem escrever", async () => {
    const erro = await erroDe(sincronizarMarcacoes(sessao(), post.id as string, ANA, [BIA], [BIA]))
    expect(erro).toMatchObject({ codigo: MARCADO_RECUSOU, recusados: [BIA] })
    expect(banco.consultas).toEqual([])
  })

  it("corrida: o banco recusa o INSERT (42501) — 400 marcado_recusou com quem recusou agora; nada do lote entra", async () => {
    semearMarca(post.id, ANA, CAIO)
    // A Bia removeu a própria marca entre a conferência e o INSERT.
    banco.tabelas.post_tag_recusas.push({ trip_id: null, post_id: post.id, author_id: ANA, tagged_id: BIA })
    const erro = await erroDe(sincronizarMarcacoes(sessao(), post.id as string, ANA, [BIA]))
    expect(erro).toMatchObject({ status: 400, codigo: MARCADO_RECUSOU, recusados: [BIA] })
    // Apagar vem antes de inserir (limite de 20): o Caio, que saiu, já saiu.
    expect(banco.tabelas.post_tags.map((t) => t.tagged_id)).toEqual([])
  })

  /**
   * Regressão (A1): o trigger `post_tags_limite_por_post` recusa a 21ª marca
   * (23514, `posts_marcados_limite`). Inserir antes de apagar fazia a troca de
   * uma pessoa num post com 20 marcas pedir a 21ª, e a rota devolvia 500.
   *
   * @RF09.13
   */
  it("post com 20 marcas: trocar uma pessoa dá certo, fica com 20, e apaga antes de inserir", async () => {
    const ids = Array.from({ length: 21 }, (_, i) => `7${String(i).padStart(7, "0")}-0000-4000-8000-000000000000`)
    for (const [i, id] of ids.entries()) banco.tabelas.profiles.push({ id, username: `lim${i}` })
    for (const id of ids.slice(0, 20)) semearMarca(post.id, ANA, id)
    // O trigger do banco: conta as marcas do post antes do INSERT.
    banco.antesDe = (tabela, operacao) => {
      if (tabela !== "post_tags" || operacao !== "insert") return
      if (banco.tabelas.post_tags.filter((t) => t.post_id === post.id).length >= 20) {
        banco.falhas.push({
          tabela: "post_tags",
          operacao: "insert",
          erro: { code: "23514", message: "Um post pode ter no máximo 20 pessoas marcadas." },
        })
      }
    }
    banco.consultas = []

    const desejados = [...ids.slice(1, 20), ids[20]]
    await sincronizarMarcacoes(sessao(), post.id as string, ANA, desejados)

    const marcas = banco.tabelas.post_tags.filter((t) => t.post_id === post.id).map((t) => t.tagged_id)
    expect(marcas).toHaveLength(20)
    expect(new Set(marcas)).toEqual(new Set(desejados))
    expect(banco.consultas.map((c) => c.operacao)).toEqual(["select", "delete", "insert"])
  })

  it.each([
    ["a mensagem do trigger (o que o PostgREST entrega)", { code: "23514", message: "Um post pode ter no máximo 20 pessoas marcadas." }],
    ["o nome da constraint", { code: "23514", message: "check_violation posts_marcados_limite" }],
  ])("23514 do limite, por %s, vira 400 limite_de_marcados", async (_caso, erroDoBanco) => {
    banco.falhas.push({ tabela: "post_tags", operacao: "insert", erro: erroDoBanco })
    const erro = await erroDe(sincronizarMarcacoes(sessao(), post.id as string, ANA, [BIA]))
    expect(erro).toBeInstanceOf(ErroComCodigo)
    expect(erro).toMatchObject({ status: 400, codigo: LIMITE_DE_MARCADOS })
  })

  it("23514 de outro CHECK não é o limite: sai como erro genérico, sem a mensagem crua", async () => {
    banco.falhas.push({
      tabela: "post_tags",
      operacao: "insert",
      erro: { code: "23514", message: 'violates check constraint "post_tags_nao_marca_a_si"' },
    })
    const erro = (await erroDe(sincronizarMarcacoes(sessao(), post.id as string, ANA, [BIA]))) as Error
    expect(erro).not.toBeInstanceOf(ErroHttp)
    expect(erro.message).not.toContain("nao_marca_a_si")
  })

  it("corrida sem recusa achada: os recusados são os novos pedidos", async () => {
    banco.falhas.push({ tabela: "post_tags", operacao: "insert", erro: { code: "42501" } })
    const erro = await erroDe(sincronizarMarcacoes(sessao(), post.id as string, ANA, [BIA]))
    expect(erro).toMatchObject({ recusados: [BIA] })
  })

  it("23505 vira 409; outro erro sai sem a mensagem crua", async () => {
    banco.falhas.push({ tabela: "post_tags", operacao: "insert", erro: { code: "23505" } })
    expect(await erroDe(sincronizarMarcacoes(sessao(), post.id as string, ANA, [BIA]))).toMatchObject({ status: 409 })
    for (const operacao of ["select", "delete"]) {
      semearMarca(post.id, ANA, CAIO)
      banco.falhas.push({ tabela: "post_tags", operacao, erro: { code: "XX000", message: "cru" } })
      const erro = (await erroDe(sincronizarMarcacoes(sessao(), post.id as string, ANA, []))) as Error
      expect(erro.message).not.toContain("cru")
      banco.tabelas.post_tags = []
    }
  })
})
