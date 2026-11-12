import { describe, it, expect } from "vitest"
import { montarCsp } from "@/lib/seguranca/csp"

/**
 * A Content-Security-Policy montada para cada ambiente.
 *
 * O que ISTO prova: as diretivas que fecham as saídas de um XSS e as origens
 * que precisam ficar abertas para o mapa e o Supabase funcionarem. O que NÃO
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

const PRODUCAO = diretivas(montarCsp({ supabaseUrl: "https://abcxyz.supabase.co", desenvolvimento: false }))
const LOCAL = diretivas(montarCsp({ supabaseUrl: "http://127.0.0.1:54321", desenvolvimento: true }))
const E2E = diretivas(montarCsp({ supabaseUrl: "http://127.0.0.1:54321", desenvolvimento: false }))

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
    expect(connect.filter((o) => o.includes("supabase"))).toEqual([
      "https://abcxyz.supabase.co",
      "wss://abcxyz.supabase.co",
    ])
  })

  it("'unsafe-eval' só em desenvolvimento", () => {
    expect(PRODUCAO.get("script-src")).not.toContain("'unsafe-eval'")
    expect(E2E.get("script-src")).not.toContain("'unsafe-eval'")
    expect(LOCAL.get("script-src")).toContain("'unsafe-eval'")
  })

  it("upgrade-insecure-requests só quando o Supabase é https", () => {
    expect(PRODUCAO.has("upgrade-insecure-requests")).toBe(true)
    expect(E2E.has("upgrade-insecure-requests")).toBe(false)
    expect(LOCAL.has("upgrade-insecure-requests")).toBe(false)
  })
})

describe("montarCsp — o que precisa ficar aberto", () => {
  it("Supabase do ambiente em connect-src, por https e por WebSocket", () => {
    expect(PRODUCAO.get("connect-src")).toEqual(
      expect.arrayContaining(["https://abcxyz.supabase.co", "wss://abcxyz.supabase.co"]),
    )
    expect(LOCAL.get("connect-src")).toEqual(expect.arrayContaining(["http://127.0.0.1:54321", "ws://127.0.0.1:54321"]))
  })

  it("Google Maps e Places em connect-src", () => {
    expect(PRODUCAO.get("connect-src")).toEqual(
      expect.arrayContaining(["https://maps.googleapis.com", "https://places.googleapis.com"]),
    )
  })

  it("imagens externas (capas e fotos do Google) carregam", () => {
    expect(PRODUCAO.get("img-src")).toEqual(expect.arrayContaining(["'self'", "data:", "blob:", "https:"]))
  })

  it("imagem do Storage local (http) carrega no ambiente de teste", () => {
    expect(E2E.get("img-src")).toContain("http://127.0.0.1:54321")
  })

  it("HMR do next dev só em desenvolvimento", () => {
    expect(LOCAL.get("connect-src")).toContain("ws:")
    expect(PRODUCAO.get("connect-src")).not.toContain("ws:")
  })
})
