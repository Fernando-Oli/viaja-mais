import { describe, it, expect } from "vitest"
import { montarCsp } from "@/lib/seguranca/csp"

/**
 * A Content-Security-Policy montada para cada ambiente.
 *
 * O que ISTO prova: as diretivas que fecham as saídas de um XSS e as origens
 * que precisam ficar abertas para o mapa e as fotos funcionarem. O que NÃO
 * prova: que nenhuma tela quebra com ela — isso é a suíte E2E inteira rodando
 * com a CSP ativa, e o autocomplete do Maps no roteiro manual do plano (o CI
 * não tem chave real do Google).
 *
 * @RNF02.12
 */

function diretivas(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(";").map((parte) => {
      const [nome, ...valores] = parte.trim().split(/\s+/)
      return [nome, valores]
    }),
  )
}

const PRODUCAO = diretivas(montarCsp({ appUrl: "https://avori.app", desenvolvimento: false }))
const LOCAL = diretivas(
  montarCsp({ appUrl: "http://localhost:3000", armazenamentoUrl: "http://localhost:58333", desenvolvimento: true }),
)
const E2E = diretivas(
  montarCsp({ appUrl: "http://localhost:3000", armazenamentoUrl: "http://localhost:58333", desenvolvimento: false }),
)

describe("montarCsp — o que fecha", () => {
  it.each([
    ["object-src", "'none'"],
    ["frame-ancestors", "'none'"],
    ["frame-src", "'none'"],
    ["base-uri", "'self'"],
    ["form-action", "'self'"],
    ["default-src", "'self'"],
  ])("%s é %s", (nome, valor) => {
    expect(PRODUCAO.get(nome)).toEqual([valor])
  })

  it("script só da própria origem e do Google Maps — nada de curinga", () => {
    const script = PRODUCAO.get("script-src")!
    expect(script).toContain("'self'")
    expect(script).toContain("https://maps.googleapis.com")
    expect(script).not.toContain("*")
    expect(script).not.toContain("https:")
    expect(script.every((o) => o.startsWith("'") || o.startsWith("https://"))).toBe(true)
  })

  it("connect-src não aceita domínio qualquer: um XSS não manda dado para fora", () => {
    const connect = PRODUCAO.get("connect-src")!
    expect(connect).not.toContain("https:")
    expect(connect).not.toContain("*")
    expect(connect).not.toContain("wss:")
    expect(connect.every((o) => o === "'self'" || o.includes("google") || o.includes("gstatic") || o.includes("ggpht"))).toBe(true)
  })

  it("nada de Supabase em diretiva nenhuma", () => {
    for (const csp of [PRODUCAO, LOCAL, E2E]) {
      expect([...csp.values()].flat().filter((o) => o.includes("supabase") || o.includes(":54321"))).toEqual([])
    }
  })

  it("'unsafe-eval' só em desenvolvimento", () => {
    expect(PRODUCAO.get("script-src")).not.toContain("'unsafe-eval'")
    expect(E2E.get("script-src")).not.toContain("'unsafe-eval'")
    expect(LOCAL.get("script-src")).toContain("'unsafe-eval'")
  })

  it("upgrade-insecure-requests só quando a aplicação é https e fora do next dev", () => {
    expect(PRODUCAO.has("upgrade-insecure-requests")).toBe(true)
    expect(E2E.has("upgrade-insecure-requests")).toBe(false)
    expect(LOCAL.has("upgrade-insecure-requests")).toBe(false)
  })
})

describe("montarCsp — o que precisa ficar aberto", () => {
  it("a própria origem em connect-src: a API responde atrás dela", () => {
    expect(PRODUCAO.get("connect-src")).toContain("'self'")
  })

  it("Google Maps e Places em connect-src", () => {
    expect(PRODUCAO.get("connect-src")).toEqual(
      expect.arrayContaining(["https://maps.googleapis.com", "https://places.googleapis.com"]),
    )
  })

  it("imagens externas (capas e fotos do Google) carregam", () => {
    expect(PRODUCAO.get("img-src")).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", "https:"]))
  })

  // @RF02.2 a foto de perfil vem por link assinado do armazenamento S3.
  it("foto de perfil do armazenamento local (http) carrega; o https da AWS já está coberto", () => {
    const comArmazenamento = (url: string) =>
      diretivas(montarCsp({ appUrl: "http://localhost:3000", armazenamentoUrl: url, desenvolvimento: true }))
    expect(comArmazenamento("http://localhost:58333/avatars").get("img-src")).toContain("http://localhost:58333")
    expect(E2E.get("img-src")).toContain("http://localhost:58333")
    const aws = comArmazenamento("https://avori-fotos.s3.us-east-1.amazonaws.com").get("img-src")!
    expect(aws.filter((o) => o.includes("amazonaws"))).toEqual([])
    expect(aws).toContain("https:")
  })

  it("HMR do next dev só em desenvolvimento", () => {
    expect(LOCAL.get("connect-src")).toContain("ws:")
    expect(PRODUCAO.get("connect-src")).not.toContain("ws:")
  })
})
