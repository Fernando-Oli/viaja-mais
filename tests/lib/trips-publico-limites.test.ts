/**
 * @RF09.7 a projeção pública entrega cada texto dentro do limite que o post aceita
 *
 * Regressão (S14-A-congelamento-a, achado do Micael no PR #51 em 18/11): um item
 * gravado antes do zod, com título acima de 120 caracteres, fazia o CHECK de
 * `items` recusar o post, e publicar a viagem devolvia 500. A projeção é a
 * fronteira entre Viagem e o Social, então é ela que entrega no limite.
 */
import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { projecaoPublicaDaViagem, LIMITES_DO_POST } from "@/lib/trips/publico"

type Resposta = { data: unknown; error: unknown }

/** Cliente falso: `trips` e `itinerary_items` respondem; qualquer outra tabela volta vazia. */
function clienteFalso(viagem: Resposta, itens: Resposta) {
  const encadeia = (resposta: Resposta) => {
    const consulta: Record<string, unknown> = {
      returns: () => Promise.resolve(resposta),
    }
    for (const metodo of ["eq", "or", "order", "limit"]) consulta[metodo] = () => consulta
    return consulta
  }
  const from = (tabela: string) => {
    if (tabela === "trips") {
      return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(viagem) }) }) }
    }
    return { select: () => encadeia(tabela === "itinerary_items" ? itens : { data: [], error: null }) }
  }
  return { from } as unknown as SupabaseClient
}

const VIAGEM = { title: "Chapada", destination: "Alto Paraíso", start_date: "2026-12-01", end_date: "2026-12-05" }
const ITEM = {
  id: "i1",
  title: "Trilha",
  date: "2026-12-02",
  start_time: null,
  end_time: null,
  category: "activity",
  location: "Vale da Lua",
  description: null,
}

/** Tamanho como o Postgres conta (`char_length`): por caractere, não por unidade UTF-16. */
const tamanho = (s: string) => Array.from(s).length

describe("projecaoPublicaDaViagem — limites do post", () => {
  it("corta o título do item acima de 120 caracteres", async () => {
    const longo = "T".repeat(150)
    const cliente = clienteFalso({ data: VIAGEM, error: null }, { data: [{ ...ITEM, title: longo }], error: null })

    const projecao = await projecaoPublicaDaViagem(cliente, "t1")

    expect(projecao!.itens[0].title).toBe("T".repeat(LIMITES_DO_POST.tituloItem))
    expect(LIMITES_DO_POST.tituloItem).toBe(120)
  })

  it("corta título e destino da viagem, local e descrição do item", async () => {
    const cliente = clienteFalso(
      { data: { ...VIAGEM, title: "V".repeat(130), destination: "D".repeat(170) }, error: null },
      { data: [{ ...ITEM, location: "L".repeat(250), description: "x".repeat(2100) }], error: null },
    )

    const projecao = (await projecaoPublicaDaViagem(cliente, "t1"))!

    expect(projecao.title).toHaveLength(120)
    expect(projecao.destination).toHaveLength(160)
    expect(projecao.itens[0].location).toHaveLength(200)
    expect(projecao.itens[0].description).toHaveLength(2000)
  })

  it("não altera texto dentro do limite nem campo nulo", async () => {
    const cliente = clienteFalso({ data: VIAGEM, error: null }, { data: [ITEM], error: null })

    const projecao = (await projecaoPublicaDaViagem(cliente, "t1"))!

    expect(projecao.title).toBe("Chapada")
    expect(projecao.itens[0]).toEqual(ITEM)
  })

  it("conta emoji como um caractere e não parte o par UTF-16 ao cortar", async () => {
    const comEmoji = "🏖️".repeat(5) + "a".repeat(115) + "🌊".repeat(10)
    const cliente = clienteFalso({ data: VIAGEM, error: null }, { data: [{ ...ITEM, title: comEmoji }], error: null })

    const titulo = (await projecaoPublicaDaViagem(cliente, "t1"))!.itens[0].title

    expect(tamanho(titulo)).toBeLessThanOrEqual(120)
    expect(titulo).not.toMatch(/[\uD800-\uDBFF]$/) // nenhum surrogate alto solto no fim
    expect(titulo.endsWith("a")).toBe(true)
  })
})
