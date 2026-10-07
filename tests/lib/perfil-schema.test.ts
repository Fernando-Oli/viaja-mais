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
})

describe("atualizarPerfilSchema — campos", () => {
  it("aceita um payload completo", () => {
    const r = atualizarPerfilSchema.parse({
      full_name: "  Bruno Teste  ",
      avatar_url: "https://exemplo.com/foto.jpg",
      username: "Bruno",
      bio: "Gosto de trilha.",
      is_public: false,
    })
    expect(r).toEqual({
      full_name: "Bruno Teste",
      avatar_url: "https://exemplo.com/foto.jpg",
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

  it("avatar: aceita https, e vazio ou nulo vira nulo (apagar)", () => {
    expect(atualizarPerfilSchema.parse({ avatar_url: " https://exemplo.com/a.png " }).avatar_url).toBe(
      "https://exemplo.com/a.png",
    )
    expect(atualizarPerfilSchema.parse({ avatar_url: "" }).avatar_url).toBeNull()
    expect(atualizarPerfilSchema.parse({ avatar_url: "   " }).avatar_url).toBeNull()
    expect(atualizarPerfilSchema.parse({ avatar_url: null }).avatar_url).toBeNull()
  })

  it("avatar: recusa http, outro esquema e texto que não é URL", () => {
    expect(erroDe(atualizarPerfilSchema.safeParse({ avatar_url: "http://exemplo.com/a.png" }))).toContain("https://")
    expect(atualizarPerfilSchema.safeParse({ avatar_url: "javascript:alert(1)" }).success).toBe(false)
    expect(erroDe(atualizarPerfilSchema.safeParse({ avatar_url: "minha foto" }))).toContain("URL válida")
  })

  it.each([
    ["https://usuario:senha@exemplo.com/a.png", "credencial embutida"],
    ["https://localhost/a.png", "localhost"],
    ["https://painel.localhost/a.png", "subdomínio de localhost"],
    ["https://169.254.169.254/a.png", "IPv4 literal"],
    ["https://[::1]/a.png", "IPv6 literal"],
  ])("avatar: recusa %s (%s)", (url) => {
    expect(erroDe(atualizarPerfilSchema.safeParse({ avatar_url: url }))).toContain("endereço público")
  })

  it("avatar: recusa URL acima do limite", () => {
    const enorme = `https://exemplo.com/${"a".repeat(2048)}`
    expect(erroDe(atualizarPerfilSchema.safeParse({ avatar_url: enorme }))).toContain("2048")
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
