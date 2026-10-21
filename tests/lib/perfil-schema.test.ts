import { describe, it, expect } from "vitest"
import { atualizarPerfilSchema, usernameSchema, LIMITE_BIO, LIMITE_NOME } from "@/lib/schemas/perfil"

/**
 * O schema é a primeira linha de defesa do perfil: normaliza o que dá para
 * normalizar, recusa o que o banco recusaria — com mensagem que a pessoa entende
 * — e descarta qualquer campo fora da lista antes de chegar ao `.update()`.
 *
 * @RF02.2 @RF02.5 @RF02.6 @RF02.7
 */

const erroDe = (resultado: { success: boolean; error?: { issues: { message: string }[] } }) =>
  resultado.success ? null : resultado.error!.issues.map((i) => i.message).join("; ")

describe("usernameSchema", () => {
  it("normaliza para minúsculas e apara espaços", () => {
    expect(usernameSchema.parse("  Ana_Viaja  ")).toBe("ana_viaja")
  })

  it("aceita os limites de 3 e 30 caracteres", () => {
    expect(usernameSchema.parse("abc")).toBe("abc")
    expect(usernameSchema.parse("a".repeat(30))).toBe("a".repeat(30))
  })

  it.each([
    ["ab", "curto demais"],
    ["a".repeat(31), "longo demais"],
    ["com espaco", "espaço no meio"],
    ["com-hifen", "hífen"],
    ["joão", "acento"],
    ["ana.b", "ponto"],
    ["", "vazio"],
  ])("recusa %j (%s)", (valor) => {
    expect(usernameSchema.safeParse(valor).success).toBe(false)
  })

  it("recusa nome reservado, mesmo escrito com maiúsculas", () => {
    expect(erroDe(usernameSchema.safeParse("Admin"))).toContain("reservado")
    expect(erroDe(usernameSchema.safeParse("suporte"))).toContain("reservado")
    expect(erroDe(usernameSchema.safeParse("viajamais"))).toContain("reservado")
  })

  it("recusa qualquer nome que contenha a marca", () => {
    expect(erroDe(usernameSchema.safeParse("suporte_viajamais"))).toContain("reservado")
    expect(erroDe(usernameSchema.safeParse("ViajaMais_Oficial"))).toContain("reservado")
  })

  it("não confunde reservado com nome que só o contém (fora a marca)", () => {
    expect(usernameSchema.parse("admin_da_silva")).toBe("admin_da_silva")
  })
})

describe("atualizarPerfilSchema — caracteres invisíveis", () => {
  it("nome só com caractere de largura zero é nome vazio", () => {
    expect(atualizarPerfilSchema.safeParse({ full_name: "​" }).success).toBe(false)
  })

  it("remove caracteres de formatação do nome e da bio", () => {
    const r = atualizarPerfilSchema.parse({ full_name: "Ana‮ Teste", bio: "Trilha​ e praia" })
    expect(r.full_name).toBe("Ana Teste")
    expect(r.bio).toBe("Trilha e praia")
  })

  // Preenchimentos que não são Cf: passavam pelo `min(1)` e o nome aparecia em
  // branco. Sem nada visível, contam como texto em branco.
  it.each([
    ["U+3164, preenchimento hangul", "ㅤ"],
    ["U+115F, preenchimento inicial hangul", "ᅟ"],
    ["U+1160, preenchimento medial hangul", "ᅠ"],
    ["U+FFA0, preenchimento hangul de meia largura", "ﾠ"],
    ["U+2800, braille em branco", "⠀"],
    ["mistura de preenchimentos, espaço e largura zero", " ㅤ⠀​ "],
  ])("só %s: nome é recusado como vazio e bio vira nulo (@RF02.2 @RF02.6)", (_caso, invisivel) => {
    expect(erroDe(atualizarPerfilSchema.safeParse({ full_name: invisivel }))).toContain("informe seu nome")
    expect(atualizarPerfilSchema.parse({ bio: invisivel }).bio).toBeNull()
  })

  it("remove caracteres de controle: o NUL viraria 500 no Postgres em vez de 400 (@RF02.2 @RF02.6)", () => {
    const r = atualizarPerfilSchema.parse({ full_name: "An\u0000a\u0007", bio: "Trilha\u0000 e\u007F praia" })
    expect(r.full_name).toBe("Ana")
    expect(r.bio).toBe("Trilha e praia")
    expect(erroDe(atualizarPerfilSchema.safeParse({ full_name: "\u0000" }))).toContain("informe seu nome")
  })

  it("a bio guarda a quebra de linha; o resto do controle sai (@RF02.6)", () => {
    expect(atualizarPerfilSchema.parse({ bio: "Trilha\ne praia\u0000" }).bio).toBe("Trilha\ne praia")
  })

  it("remove metade solta de par substituto, que não é texto (@RF02.2 @RF02.6)", () => {
    const r = atualizarPerfilSchema.parse({ full_name: "Ana\uD800", bio: "\uDC00Trilha" })
    expect(r.full_name).toBe("Ana")
    expect(r.bio).toBe("Trilha")
    expect(erroDe(atualizarPerfilSchema.safeParse({ full_name: "\uD800" }))).toContain("informe seu nome")
  })

  it("não quebra emoji: o seletor de variação U+FE0F continua no nome e na bio (@RF02.2 @RF02.6)", () => {
    // U+FE0F é ignorável, como os preenchimentos — só não pode sair do texto.
    const r = atualizarPerfilSchema.parse({ full_name: "Ana ❤️", bio: "Praia \u{1F3D6}️ e trilha \u{1F97E}" })
    expect(r.full_name).toBe("Ana ❤️")
    expect(r.bio).toBe("Praia \u{1F3D6}️ e trilha \u{1F97E}")
  })
})

describe("atualizarPerfilSchema — campos", () => {
  it("aceita um payload completo", () => {
    const r = atualizarPerfilSchema.parse({
      full_name: "  Bruno Teste  ",
      username: "Bruno",
      bio: "Gosto de trilha.",
      is_public: false,
    })
    expect(r).toEqual({
      full_name: "Bruno Teste",
      username: "bruno",
      bio: "Gosto de trilha.",
      is_public: false,
    })
  })

  it("nome: recusa vazio e só espaços; aceita até o limite", () => {
    expect(atualizarPerfilSchema.safeParse({ full_name: "" }).success).toBe(false)
    expect(atualizarPerfilSchema.safeParse({ full_name: "   " }).success).toBe(false)
    expect(atualizarPerfilSchema.parse({ full_name: "x".repeat(LIMITE_NOME) }).full_name).toHaveLength(LIMITE_NOME)
    expect(atualizarPerfilSchema.safeParse({ full_name: "x".repeat(LIMITE_NOME + 1) }).success).toBe(false)
  })

  it("bio: aceita até o limite e recusa acima", () => {
    expect(atualizarPerfilSchema.parse({ bio: "x".repeat(LIMITE_BIO) }).bio).toHaveLength(LIMITE_BIO)
    expect(atualizarPerfilSchema.safeParse({ bio: "x".repeat(LIMITE_BIO + 1) }).success).toBe(false)
  })

  it("bio: vazia, só espaços ou nula vira nulo (apagar)", () => {
    expect(atualizarPerfilSchema.parse({ bio: "" }).bio).toBeNull()
    expect(atualizarPerfilSchema.parse({ bio: "   " }).bio).toBeNull()
    expect(atualizarPerfilSchema.parse({ bio: null }).bio).toBeNull()
  })

  it("avatar_url no corpo é descartado: a foto só muda pelas rotas de foto", () => {
    expect(atualizarPerfilSchema.parse({ avatar_url: "https://exemplo.com/a.png", bio: "ok" })).toEqual({ bio: "ok" })
    expect(atualizarPerfilSchema.safeParse({ avatar_url: "https://exemplo.com/a.png" }).success).toBe(false)
  })

  it("is_public: só booleano, não texto", () => {
    expect(atualizarPerfilSchema.parse({ is_public: true }).is_public).toBe(true)
    expect(atualizarPerfilSchema.safeParse({ is_public: "true" }).success).toBe(false)
  })
})

describe("atualizarPerfilSchema — lista fechada", () => {
  it("descarta id, created_at e user_id vindos do corpo (sem mass-assignment)", () => {
    const r = atualizarPerfilSchema.parse({
      id: "22222222-2222-4222-8222-222222222222",
      user_id: "outro",
      created_at: "2015-01-01T00:00:00Z",
      bio: "Só a bio deveria passar.",
    })
    expect(r).toEqual({ bio: "Só a bio deveria passar." })
  })

  it("recusa corpo vazio", () => {
    expect(erroDe(atualizarPerfilSchema.safeParse({}))).toContain("ao menos um campo")
  })

  it("recusa corpo só com campos fora da lista", () => {
    expect(atualizarPerfilSchema.safeParse({ id: "x", created_at: "2015-01-01" }).success).toBe(false)
  })

  it("recusa username nulo: dá para trocar, não para apagar", () => {
    expect(atualizarPerfilSchema.safeParse({ username: null }).success).toBe(false)
  })
})
