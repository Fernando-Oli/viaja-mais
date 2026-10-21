import { describe, it, expect, vi, beforeEach } from "vitest"
import { VALIDADE_URL_AVATAR_S } from "@/lib/social/foto"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"

/**
 * @RF09.10 @RNF02.11 — busca de pessoas (GET /api/social/perfis?busca=).
 *
 * Cliente falso que registra cada consulta que a rota monta: a tabela, as
 * colunas, o `eq`, o `ilike`, a ordem, o limite e os filtros. É isso que prova o
 * que a rota pede ao banco: uma consulta por critério, com o termo como valor
 * (nunca dentro de um `.or()`), em ordem de nome antes do limite, sem quem busca
 * e sem contas sem username.
 *
 * Não há caminho 403: pelo catálogo (RF09.10), qualquer autenticado busca. No
 * lugar dele entram os testes de que quem busca fica de fora e de que a
 * resposta não leva `id` nem datas, mesmo que o banco os devolva.
 */

type Linha = { id: string; username: string; full_name: string | null; avatar_url: string | null; is_public: boolean }
type Resposta = { data: Linha[] | null; error: { code?: string; message: string } | null }
type Criterio = "exato" | "full_name" | "username"
type Consulta = {
  tabela: string
  colunas?: string
  eq?: [string, string]
  ilike?: [string, string]
  ordem?: [string, unknown]
  limite?: number
  filtros: unknown[][]
}

const h = vi.hoisted(() => ({
  getUser: vi.fn(),
  consultas: [] as Consulta[],
  respostas: {} as Record<Criterio, Resposta>,
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: h.getUser },
    from(tabela: string) {
      const consulta: Consulta = { tabela, filtros: [] }
      h.consultas.push(consulta)
      const cadeia = {
        select(colunas: string) {
          consulta.colunas = colunas
          return cadeia
        },
        eq(coluna: string, valor: string) {
          consulta.eq = [coluna, valor]
          return cadeia
        },
        ilike(coluna: string, padrao: string) {
          consulta.ilike = [coluna, padrao]
          return cadeia
        },
        neq(...args: unknown[]) {
          consulta.filtros.push(["neq", ...args])
          return cadeia
        },
        not(...args: unknown[]) {
          consulta.filtros.push(["not", ...args])
          return cadeia
        },
        order(coluna: string, opcoes: unknown) {
          consulta.ordem = [coluna, opcoes]
          return cadeia
        },
        or() {
          throw new Error("a rota não pode montar .or() com o termo digitado")
        },
        limit(n: number) {
          consulta.limite = n
          const criterio: Criterio = consulta.eq ? "exato" : (consulta.ilike![0] as Criterio)
          return Promise.resolve(h.respostas[criterio])
        },
      }
      return cadeia
    },
  }),
}))

/**
 * Storage falso do cliente de serviço: registra cada assinatura e devolve URLs
 * assinadas previsíveis (bucket privado, S04-M-foto-privada).
 */
const s = vi.hoisted(() => ({
  URL_ASSINADA: "https://storage.teste/storage/v1/object/sign/avatars/",
  assinaturas: [] as { caminhos: string[]; validade: number }[],
}))

vi.mock("@/lib/supabase/admin", () => ({
  criarClienteAdmin: () => ({
    storage: {
      from: () => ({
        async createSignedUrls(caminhos: string[], validade: number) {
          s.assinaturas.push({ caminhos, validade })
          return {
            data: caminhos.map((path) => ({ path, signedUrl: `${s.URL_ASSINADA}${path}?token=tk`, error: null })),
            error: null,
          }
        },
      }),
    },
  }),
}))
import { GET } from "@/app/api/social/perfis/route"

const DAVI = "44444444-4444-4444-8444-444444444444"

const carla: Linha = { id: "33333333-3333-4333-8333-333333333333", username: "carla", full_name: "Carla Teste", avatar_url: null, is_public: true }
const bruno: Linha = { id: "22222222-2222-4222-8222-222222222222", username: "bruno", full_name: "Bruno Teste", avatar_url: null, is_public: false }

const vazio = (): Resposta => ({ data: [], error: null })

function buscar(termo?: string) {
  const url =
    termo === undefined
      ? "http://localhost/api/social/perfis"
      : `http://localhost/api/social/perfis?busca=${encodeURIComponent(termo)}`
  return GET(new Request(url))
}

beforeEach(() => {
  h.getUser.mockReset()
  h.consultas.length = 0
  s.assinaturas.length = 0
  esquecerLinksEmitidos()
  h.respostas = { exato: vazio(), full_name: { data: [carla], error: null }, username: vazio() }
})

const logadoComo = (id: string) => h.getUser.mockResolvedValue({ data: { user: { id } } })
const semSessao = () => h.getUser.mockResolvedValue({ data: { user: null } })

describe("GET /api/social/perfis?busca=", () => {
  it("200: acha pelo nome e devolve só os dados básicos", async () => {
    logadoComo(DAVI)

    const resposta = await buscar("carla")

    expect(resposta.status).toBe(200)
    expect(await resposta.json()).toEqual({
      pessoas: [{ username: "carla", full_name: "Carla Teste", avatar_url: null, is_public: true }],
    })
  })

  it("200: uma consulta por critério, com o termo como valor, em ordem de nome antes do limite", async () => {
    logadoComo(DAVI)

    await buscar("carla")

    const emOrdemDeNome = ["full_name", { ascending: true, nullsFirst: true }]
    expect(h.consultas.map(({ tabela, eq, ilike, ordem, limite }) => ({ tabela, eq, ilike, ordem, limite }))).toEqual([
      { tabela: "profiles", eq: ["username", "carla"], ilike: undefined, ordem: undefined, limite: 1 },
      { tabela: "profiles", eq: undefined, ilike: ["full_name", "%carla%"], ordem: emOrdemDeNome, limite: 20 },
      { tabela: "profiles", eq: undefined, ilike: ["username", "%carla%"], ordem: emOrdemDeNome, limite: 20 },
    ])
    expect(h.consultas.every((c) => c.colunas === "id, username, full_name, avatar_url, is_public")).toBe(true)
  })

  it("200: quem busca e as contas sem username ficam de fora, nas três consultas", async () => {
    logadoComo(DAVI)

    await buscar("teste")

    expect(h.consultas).toHaveLength(3)
    for (const consulta of h.consultas) {
      expect(consulta.filtros).toEqual([
        ["neq", "id", DAVI],
        ["not", "username", "is", null],
      ])
    }
  })

  it("200: acha pelo username, e a mesma pessoa achada duas vezes aparece uma vez", async () => {
    logadoComo(DAVI)
    h.respostas = {
      exato: vazio(),
      full_name: { data: [carla, bruno], error: null },
      username: { data: [carla], error: null },
    }

    const { pessoas } = await (await buscar("ar")).json()

    expect(pessoas.map((p: Linha) => p.username)).toEqual(["bruno", "carla"])
  })

  it("200: o username exato vem primeiro, mesmo com o nome no fim da ordem", async () => {
    logadoComo(DAVI)
    const ana: Linha = { id: "11111111-1111-4111-8111-111111111111", username: "ana", full_name: "Zuleica", avatar_url: null, is_public: true }
    h.respostas = {
      exato: { data: [ana], error: null },
      full_name: { data: [{ ...carla, username: "anab", full_name: "Ana Beatriz" }], error: null },
      username: { data: [ana], error: null },
    }

    const { pessoas } = await (await buscar("Ana")).json()

    expect(pessoas.map((p: Linha) => p.username)).toEqual(["ana", "anab"])
  })

  it("200: perfil privado aparece, marcado como privado", async () => {
    logadoComo(DAVI)
    h.respostas.full_name = { data: [bruno], error: null }

    const { pessoas } = await (await buscar("bruno")).json()

    expect(pessoas).toEqual([{ username: "bruno", full_name: "Bruno Teste", avatar_url: null, is_public: false }])
  })

  it("200: o @ do começo sai, e o _ do username é procurado como _", async () => {
    logadoComo(DAVI)

    await buscar("@ana_viaja")

    expect(h.consultas[0].eq).toEqual(["username", "ana_viaja"])
    expect(h.consultas[1].ilike).toEqual(["full_name", "%ana\\_viaja%"])
  })

  it("200: a resposta não leva id nem datas, mesmo que o banco as devolva", async () => {
    logadoComo(DAVI)
    const comExtras = { ...carla, id: "33333333-3333-4333-8333-333333333333", created_at: "2026-09-10T00:00:00Z" }
    h.respostas.full_name = { data: [comExtras], error: null }

    const { pessoas } = await (await buscar("carla")).json()

    expect(Object.keys(pessoas[0]).sort()).toEqual(["avatar_url", "full_name", "is_public", "username"])
  })

  it("200: as fotos voltam como URL assinada, numa chamada só; URL antiga e pasta alheia voltam nulas", async () => {
    logadoComo(DAVI)
    const daCarla = `${carla.id}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`
    const ana: Linha = { id: "11111111-1111-4111-8111-111111111111", username: "ana", full_name: "Ana Teste", avatar_url: daCarla, is_public: true }
    h.respostas.full_name = {
      data: [{ ...carla, avatar_url: daCarla }, { ...bruno, avatar_url: "https://exemplo.com/antiga.png" }, ana],
      error: null,
    }

    const { pessoas } = await (await buscar("teste")).json()
    const de = (username: string) => pessoas.find((p: Linha) => p.username === username).avatar_url

    expect(de("carla")).toBe(`${s.URL_ASSINADA}${daCarla}?token=tk`)
    expect(de("carla")).not.toContain("/object/public/")
    expect(de("bruno")).toBeNull()
    // A Ana apontar para a pasta da Carla o trigger não deixa; se viesse, não seria assinado.
    expect(de("ana")).toBeNull()
    expect(s.assinaturas).toEqual([{ caminhos: [daCarla], validade: VALIDADE_URL_AVATAR_S }])
  })

  it("200: sem nenhuma foto, não vai ao Storage", async () => {
    logadoComo(DAVI)

    await buscar("teste")

    expect(s.assinaturas).toEqual([])
  })

  it("a resposta com os links assinados não vai para cache compartilhado", async () => {
    logadoComo(DAVI)

    expect((await buscar("carla")).headers.get("cache-control")).toBe("private, no-store")
  })

  it("200: nada achado devolve lista vazia", async () => {
    logadoComo(DAVI)
    h.respostas.full_name = vazio()

    expect(await (await buscar("zzz")).json()).toEqual({ pessoas: [] })
  })

  it("401: sem sessão não chega a consultar", async () => {
    semSessao()

    const resposta = await buscar("carla")

    expect(resposta.status).toBe(401)
    expect(h.consultas).toHaveLength(0)
  })

  it("401 vem antes do 400: sem sessão, nem o termo é avaliado", async () => {
    semSessao()

    expect((await buscar("a%")).status).toBe(401)
  })

  it.each([
    ["sem o parâmetro", undefined],
    ["vazio", ""],
    ["curto demais", "a"],
    ["longo demais", "a".repeat(61)],
    ["curinga %", "a%"],
    ["curinga *", "a*"],
    ["barra invertida", "a\\b"],
    ["vírgula e parêntese", "ana,id.eq.x)"],
  ])("400: termo inválido (%s) é recusado sem consultar", async (_caso, termo) => {
    logadoComo(DAVI)

    const resposta = await buscar(termo)

    expect(resposta.status).toBe(400)
    expect((await resposta.json()).error).toBe("Dados inválidos")
    expect(h.consultas).toHaveLength(0)
  })

  it.each<Criterio>(["exato", "full_name", "username"])(
    "500: erro do banco na consulta %s não volta cru",
    async (criterio) => {
      logadoComo(DAVI)
      const silenciar = vi.spyOn(console, "error").mockImplementation(() => {})
      const erroDoBanco = { code: "42P01", message: 'relation "public.profiles_segredo" does not exist' }
      h.respostas[criterio] = { data: null, error: erroDoBanco }

      const resposta = await buscar("carla")

      expect(resposta.status).toBe(500)
      expect(await resposta.json()).toEqual({ error: "Erro interno do servidor" })
      // O 500 vem do erro do banco, e não de um TypeError ao percorrer `data: null`.
      expect(silenciar).toHaveBeenCalledWith("[erro não tratado]", erroDoBanco)
      silenciar.mockRestore()
    },
  )
})
