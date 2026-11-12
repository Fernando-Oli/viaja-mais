import { describe, it, expect } from "vitest"
import { buscaPessoasSchema } from "@/lib/schemas/busca"
import { BUSCA_LIMITE, juntarResultados, normalizarTermo, padraoContem, TERMO_PERMITIDO } from "@/lib/social/busca"

/**
 * @RF09.10 — regras da busca de pessoas: o que entra como termo, o padrão do
 * `ilike` e a junção das duas consultas (por nome e por username).
 */

const erroDe = (resultado: { success: boolean; error?: { issues: { message: string }[] } }) =>
  resultado.success ? null : resultado.error!.issues.map((i) => i.message).join("; ")

describe("normalizarTermo", () => {
  it("apara, junta espaços repetidos e tira o @ do começo", () => {
    expect(normalizarTermo("  Ana   Teste \t")).toBe("Ana Teste")
    expect(normalizarTermo("@ana")).toBe("ana")
    expect(normalizarTermo("  @ ana ")).toBe("ana")
  })

  it("só o primeiro @ sai; um @ no meio fica (e o schema recusa)", () => {
    expect(normalizarTermo("@@ana")).toBe("@ana")
    expect(normalizarTermo("ana@b")).toBe("ana@b")
  })

  it("acento digitado como letra + sinal vira o mesmo caractere gravado (NFC)", () => {
    expect(normalizarTermo("João")).toBe("João")
  })
})

describe("buscaPessoasSchema", () => {
  it("aceita nome com acento, apóstrofo, hífen, ponto e número", () => {
    expect(buscaPessoasSchema.parse("João D'Ávila")).toBe("João D'Ávila")
    expect(buscaPessoasSchema.parse("Ana-Clara")).toBe("Ana-Clara")
    expect(buscaPessoasSchema.parse("J. Silva 2")).toBe("J. Silva 2")
    expect(buscaPessoasSchema.parse("Sant’Anna")).toBe("Sant’Anna")
  })

  it("aceita username com _ e o @ do começo", () => {
    expect(buscaPessoasSchema.parse("@ana_viaja")).toBe("ana_viaja")
  })

  it("aceita os limites de 2 e 60 caracteres, depois de normalizar", () => {
    expect(buscaPessoasSchema.parse("ab")).toBe("ab")
    expect(buscaPessoasSchema.parse("a".repeat(60))).toHaveLength(60)
    expect(buscaPessoasSchema.parse("  @ab  ")).toBe("ab")
  })

  it("recusa curto e longo demais", () => {
    expect(erroDe(buscaPessoasSchema.safeParse("a"))).toContain("pelo menos 2")
    expect(erroDe(buscaPessoasSchema.safeParse("  @a "))).toContain("pelo menos 2")
    expect(erroDe(buscaPessoasSchema.safeParse(""))).toContain("pelo menos 2")
    expect(erroDe(buscaPessoasSchema.safeParse("a".repeat(61)))).toContain("até 60")
  })

  it.each([
    ["% (curinga do LIKE)", "a%"],
    ["* (o PostgREST troca por %)", "a*"],
    ["\\ (escape do LIKE)", "a\\b"],
    ["vírgula", "ana,bruno"],
    ["parênteses", "ana)"],
    ["ponto e vírgula", "ana;"],
    ["aspas duplas", 'ana"'],
    ["@ no meio", "ana@b"],
  ])("recusa %s", (_caso, termo) => {
    expect(erroDe(buscaPessoasSchema.safeParse(termo))).toContain("letras, números e espaço")
  })

  it("recusa o que não é texto", () => {
    expect(buscaPessoasSchema.safeParse(null).success).toBe(false)
    expect(buscaPessoasSchema.safeParse(42).success).toBe(false)
  })
})

describe("TERMO_PERMITIDO", () => {
  it("é a mesma regra que a tela usa para decidir se busca", () => {
    expect(TERMO_PERMITIDO.test("Ana Teste")).toBe(true)
    expect(TERMO_PERMITIDO.test("a%")).toBe(false)
  })
})

describe("padraoContem", () => {
  it("cerca o termo de % para achar em qualquer posição", () => {
    expect(padraoContem("carla")).toBe("%carla%")
  })

  it("escapa o _, que no LIKE casaria qualquer caractere", () => {
    expect(padraoContem("n_")).toBe("%n\\_%")
    expect(padraoContem("a_b_c")).toBe("%a\\_b\\_c%")
  })
})

describe("juntarResultados", () => {
  const p = (username: string, full_name: string | null) => ({ username, full_name })

  it("a mesma pessoa achada pelas duas consultas aparece uma vez", () => {
    const porNome = [p("ana", "Ana Teste")]
    const porUsername = [p("ana", "Ana Teste"), p("anabela", "Bela")]
    expect(juntarResultados([porNome, porUsername]).map((x) => x.username)).toEqual(["ana", "anabela"])
  })

  it("ordena por nome sem diferenciar maiúscula nem acento, e desempata por username", () => {
    const lista = [p("z", "Érica"), p("b", "carla"), p("a", "Bruno"), p("y", "érica")]
    expect(juntarResultados([lista]).map((x) => x.username)).toEqual(["a", "b", "y", "z"])
  })

  it("nome vazio vai antes, sem quebrar; dois sem nome se ordenam pelo username", () => {
    expect(juntarResultados([[p("b", "Bruno"), p("a", null)]]).map((x) => x.username)).toEqual(["a", "b"])
    expect(juntarResultados([[p("a", "Ana"), p("d", null), p("c", null)]]).map((x) => x.username)).toEqual([
      "c",
      "d",
      "a",
    ])
  })

  it("respeita o limite, 20 por padrão", () => {
    const muitos = Array.from({ length: 30 }, (_, i) => p(`u${String(i).padStart(2, "0")}`, "Mesmo Nome"))
    expect(juntarResultados([muitos])).toHaveLength(BUSCA_LIMITE)
    expect(juntarResultados([muitos], "", 5)).toHaveLength(5)
  })

  it("quem tem exatamente o username buscado vem primeiro, mesmo com o nome no fim da ordem", () => {
    const exato = [p("ana", "Zuleica")]
    const porNome = [p("anab", "Ana Beatriz"), p("anac", "Ana Clara")]
    expect(juntarResultados([exato, porNome], "ana").map((x) => x.username)).toEqual(["ana", "anab", "anac"])
    // Sem diferenciar maiúsculas, e mesmo com o limite apertado.
    expect(juntarResultados([porNome, exato], "ANA", 1).map((x) => x.username)).toEqual(["ana"])
  })

  it("sem nada achado, devolve lista vazia", () => {
    expect(juntarResultados([[], []])).toEqual([])
  })
})
