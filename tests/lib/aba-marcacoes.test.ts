import { describe, it, expect, vi, beforeEach } from "vitest"
import { ANA, BIA, banco, fotoDe, semearMarca, semearPerfis, semearPost } from "../api/banco-falso"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"
import { COLUNAS_MARCACAO, LIMITE_MARCACOES, marcacoesDoPerfil, removerMinhaMarcacao } from "@/lib/social/aba-marcacoes"

/**
 * @RF09.14 A aba Marcações (lib/social/aba-marcacoes.ts) lendo `posts`: a
 * consulta não pede o que não pode sair; a 1ª foto vai assinada; Storage fora
 * do ar não derruba a aba; remover só a própria marca.
 */

const sessao = () => banco.clienteDaSessao()
const admin = () => banco.clienteDeServico()

beforeEach(() => {
  banco.reiniciar()
  semearPerfis()
  esquecerLinksEmitidos()
  banco.sessao = ANA
  return () => vi.restoreAllMocks()
})

describe("marcacoesDoPerfil", () => {
  it("a consulta lê posts pela FK e nunca pede trip_id, author_id do post, itens, lugares nem e-mail", () => {
    expect(COLUNAS_MARCACAO).toContain("post:posts!post_tags_post_id_fkey(")
    const doPost = COLUNAS_MARCACAO.slice(COLUNAS_MARCACAO.indexOf("post:posts"))
    expect(doPost).not.toMatch(/trip_id|author_id|items|places|email|\*/)
    expect(LIMITE_MARCACOES).toBe(50)
  })

  it("Storage fora do ar: foto do post e do autor nulas, e a aba continua", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const post = semearPost({ author_id: BIA, photos: [fotoDe(BIA)] })
    semearMarca(post.id, BIA, ANA)
    const aba = await marcacoesDoPerfil(sessao(), "ana", ANA, () => {
      throw new Error("sem chave")
    })
    expect(aba.marcacoes).toHaveLength(1)
    expect(aba.marcacoes[0].autor.avatar_url).toBeNull()
    expect(aba.marcacoes[0].post).toMatchObject({ foto: null, caption: null })
  })

  it("legenda só com espaços sai nula; linha sem autor legível fica de fora", async () => {
    const post = semearPost({ author_id: BIA, caption: "   ", photos: [fotoDe(BIA)] })
    semearMarca(post.id, BIA, ANA)
    const orfao = semearPost({ author_id: BIA, photos: [fotoDe(BIA, 2)] })
    banco.tabelas.post_tags.push({ post_id: orfao.id, author_id: "77777777-7777-4777-8777-777777777777", tagged_id: ANA, created_at: banco.momento() })
    const aba = await marcacoesDoPerfil(sessao(), "ana", ANA, admin)
    expect(aba.marcacoes.map((m) => m.post_id)).toEqual([post.id])
    expect(aba.marcacoes[0].post!.caption).toBeNull()
  })

  it("erro do banco lança sem a mensagem crua", async () => {
    banco.falhas.push({ tabela: "post_tags", operacao: "select", erro: { code: "XX000", message: "cru" } })
    await expect(marcacoesDoPerfil(sessao(), "ana", ANA, admin)).rejects.toThrow(/não foi possível/)
  })
})

describe("removerMinhaMarcacao", () => {
  it("só a marca da sessão; devolve se havia", async () => {
    const post = semearPost({ author_id: BIA, photos: [fotoDe(BIA)] })
    semearMarca(post.id, BIA, ANA)
    expect(await removerMinhaMarcacao(sessao(), post.id as string, ANA)).toBe(true)
    expect(await removerMinhaMarcacao(sessao(), post.id as string, ANA)).toBe(false)
    banco.falhas.push({ tabela: "post_tags", operacao: "delete", erro: { code: "XX000", message: "cru" } })
    await expect(removerMinhaMarcacao(sessao(), post.id as string, ANA)).rejects.toThrow(/não foi possível/)
  })
})
