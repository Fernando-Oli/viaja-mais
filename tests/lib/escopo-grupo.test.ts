import { describe, it, expect } from "vitest"
import {
  selecaoDeViagens,
  selecaoPorViagem,
  FILTRO_EM_VIAGENS,
  FILTRO_POR_VIAGEM,
} from "@/lib/trips/escopo"

/**
 * O que estes testes protegem não é a formatação da string — é o `!inner`.
 *
 * Sem ele o PostgREST trata o embed como LEFT JOIN e ignora o filtro da relação
 * aninhada: a consulta continua respondendo 200, só que com as linhas erradas.
 * Não há erro para observar, então a única barreira possível é aqui.
 *
 * @RF04.4 os membros visualizam a viagem e seus dados
 */

describe("selecaoDeViagens", () => {
  it("embute trip_members com !inner", () => {
    expect(selecaoDeViagens()).toBe("*, trip_members!inner(user_id)")
  })

  it("aceita colunas próprias e colunas do membro", () => {
    expect(selecaoDeViagens("id, title", "user_id, role")).toBe(
      "id, title, trip_members!inner(user_id, role)",
    )
  })

  it("recusa embed do membro sem user_id", () => {
    // Sem `user_id` no embed, `.eq("trip_members.user_id", …)` filtra por uma
    // coluna que não foi selecionada — e o PostgREST só reclama em runtime.
    // Reescrever a string aqui seria pior: o tipo literal deixaria de
    // corresponder ao que a função devolve, e a tipagem do resultado mentiria.
    expect(() => selecaoDeViagens("*", "role")).toThrow(/user_id/)
  })

  it("recusa lista de colunas vazia", () => {
    expect(() => selecaoDeViagens("   ")).toThrow(/vazia/)
  })
})

describe("selecaoPorViagem", () => {
  it("embute trips e trip_members, os dois com !inner", () => {
    expect(selecaoPorViagem("title, destination")).toBe(
      "*, trips!inner(title, destination, trip_members!inner(user_id))",
    )
  })

  it("preserva as colunas da própria tabela", () => {
    expect(selecaoPorViagem("title, currency", "id, amount")).toBe(
      "id, amount, trips!inner(title, currency, trip_members!inner(user_id))",
    )
  })

  it("recusa quem embute trips por conta própria", () => {
    // Dois embeds da mesma relação: o filtro casa com o errado e a tela volta a
    // mostrar dado de menos — exatamente o bug que esta atividade conserta.
    expect(() => selecaoPorViagem("title", "*, trips(title)")).toThrow(/não embuta/)
    expect(() => selecaoPorViagem("title", "*, trips!inner(title)")).toThrow(/não embuta/)
  })

  it("recusa colunas da viagem vazias", () => {
    expect(() => selecaoPorViagem("")).toThrow(/vazia/)
  })
})

describe("colunas de filtro", () => {
  it("apontam para o user_id dentro do embed", () => {
    // Se estas constantes divergirem do que o `select` monta, o filtro deixa de
    // casar e a consulta falha — ruidosamente, que é o desfecho aceitável.
    expect(selecaoDeViagens()).toContain("trip_members!inner")
    expect(FILTRO_EM_VIAGENS).toBe("trip_members.user_id")

    expect(selecaoPorViagem("title")).toContain("trips!inner")
    expect(FILTRO_POR_VIAGEM).toBe("trips.trip_members.user_id")
  })
})
