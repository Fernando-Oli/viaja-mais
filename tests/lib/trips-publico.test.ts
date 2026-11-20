/**
 * @RF09.7 a projeção pública da viagem não carrega orçamento, notas, coordenadas nem membros
 *
 * Proposta do Micael (S06-M-publicar-viagem, 19/11) para revisão da Audrey: os
 * testes cobrem também os lugares (lista branca, ordem, teto e erro).
 */
import { describe, it, expect, vi } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { projecaoPublicaDaViagem } from "@/lib/trips/publico"

type Resposta = { data: unknown; error: unknown }

/**
 * Cliente falso com os dois encadeamentos que o helper usa:
 * trips → select().eq().maybeSingle() e
 * itinerary_items → select().eq().or().order().order().limit().returns() e
 * places → select().eq().order().limit().returns().
 */
function clienteFalso(
  viagem: Resposta,
  itens: Resposta = { data: [], error: null },
  lugares: Resposta = { data: [], error: null },
) {
  const chamadas = {
    selectViagem: vi.fn(),
    selectItens: vi.fn(),
    eqItens: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    selectLugares: vi.fn(),
    eqLugares: vi.fn(),
    orderLugares: vi.fn(),
    limitLugares: vi.fn(),
  }

  const consultaLugares = {
    eq: (...a: unknown[]) => (chamadas.eqLugares(...a), consultaLugares),
    order: (...a: unknown[]) => (chamadas.orderLugares(...a), consultaLugares),
    limit: (...a: unknown[]) => (chamadas.limitLugares(...a), consultaLugares),
    returns: () => Promise.resolve(lugares),
  }

  const consultaItens = {
    eq: (...a: unknown[]) => (chamadas.eqItens(...a), consultaItens),
    or: (...a: unknown[]) => (chamadas.or(...a), consultaItens),
    order: (...a: unknown[]) => (chamadas.order(...a), consultaItens),
    limit: (...a: unknown[]) => (chamadas.limit(...a), consultaItens),
    returns: () => Promise.resolve(itens),
  }

  const from = vi.fn((tabela: string) => {
    if (tabela === "trips") {
      return {
        select: (c: string) => {
          chamadas.selectViagem(c)
          return { eq: () => ({ maybeSingle: () => Promise.resolve(viagem) }) }
        },
      }
    }
    if (tabela === "places") {
      return {
        select: (c: string) => {
          chamadas.selectLugares(c)
          return consultaLugares
        },
      }
    }
    return {
      select: (c: string) => {
        chamadas.selectItens(c)
        return consultaItens
      },
    }
  })

  return { cliente: { from } as unknown as SupabaseClient, from, chamadas }
}

// A linha "do banco" traz de propósito as colunas proibidas, como se alguém
// tivesse trocado o select por `*`: o helper precisa descartá-las mesmo assim.
const VIAGEM_DO_BANCO = {
  title: "Chapada",
  destination: "Alto Paraíso",
  start_date: "2026-12-01",
  end_date: "2026-12-05",
  budget: 3000,
  currency: "BRL",
  description: "privada",
  status: "planning",
  trip_members: [{ user_id: "x" }],
}

const ITEM_DO_BANCO = {
  id: "i1",
  title: "Trilha",
  date: "2026-12-02",
  start_time: "08:00",
  end_time: null,
  category: "activity",
  location: "Vale da Lua",
  description: null,
  notes: "senha do wifi",
  latitude: -14.1,
  longitude: -47.5,
  status: "confirmed",
}

// Idem para o lugar: as colunas privadas vêm na linha e não podem sair.
const LUGAR_DO_BANCO = {
  id: "p1",
  name: "Cachoeira Santa Bárbara",
  category: "attraction",
  address: "Cavalcante, GO",
  notes: "chave do portão 1234",
  latitude: -13.9,
  longitude: -47.4,
  rating: 4.8,
  visited: true,
  place_id: "ChIJ-segredo",
  user_id: "u-dono",
  created_at: "2026-11-01T10:00:00Z",
}

describe("projecaoPublicaDaViagem", () => {
  it("devolve exatamente as chaves públicas da viagem, dos itens e dos lugares", async () => {
    const { cliente } = clienteFalso(
      { data: VIAGEM_DO_BANCO, error: null },
      { data: [ITEM_DO_BANCO], error: null },
      { data: [LUGAR_DO_BANCO], error: null },
    )

    const viagem = await projecaoPublicaDaViagem(cliente, "t1")

    // Trava as chaves: coluna nova só chega ao post se alguém decidir.
    expect(Object.keys(viagem!).sort()).toEqual(
      ["destination", "end_date", "itens", "lugares", "start_date", "title"].sort(),
    )
    expect(Object.keys(viagem!.itens[0]).sort()).toEqual(
      ["category", "date", "description", "end_time", "id", "location", "start_time", "title"].sort(),
    )
    expect(Object.keys(viagem!.lugares[0]).sort()).toEqual(["address", "category", "id", "name"].sort())
    expect(JSON.stringify(viagem!.lugares)).not.toMatch(/1234|ChIJ|4\.8|-13\.9|-47\.4|u-dono|visited/)
    expect(viagem).toEqual({
      title: "Chapada",
      destination: "Alto Paraíso",
      start_date: "2026-12-01",
      end_date: "2026-12-05",
      itens: [
        {
          id: "i1",
          title: "Trilha",
          date: "2026-12-02",
          start_time: "08:00",
          end_time: null,
          category: "activity",
          location: "Vale da Lua",
          description: null,
        },
      ],
      lugares: [{ id: "p1", name: "Cachoeira Santa Bárbara", category: "attraction", address: "Cavalcante, GO" }],
    })
  })

  it("nomeia as colunas no select, nunca *", async () => {
    const { cliente, chamadas } = clienteFalso({ data: VIAGEM_DO_BANCO, error: null })

    await projecaoPublicaDaViagem(cliente, "t1")

    expect(chamadas.selectViagem).toHaveBeenCalledWith("title, destination, start_date, end_date")
    expect(chamadas.selectItens).toHaveBeenCalledWith(
      "id, title, date, start_time, end_time, category, location, description",
    )
    expect(chamadas.selectLugares).toHaveBeenCalledWith("id, name, category, address")
  })

  it("lê os lugares da viagem na ordem da tela de lugares, com o teto do post", async () => {
    const { cliente, chamadas } = clienteFalso({ data: VIAGEM_DO_BANCO, error: null })

    await projecaoPublicaDaViagem(cliente, "t1")

    expect(chamadas.eqLugares).toHaveBeenCalledWith("trip_id", "t1")
    expect(chamadas.orderLugares).toHaveBeenCalledWith("created_at", { ascending: false })
    expect(chamadas.limitLugares).toHaveBeenCalledWith(200)
  })

  it("viagem sem lugares devolve lista vazia", async () => {
    const { cliente } = clienteFalso({ data: VIAGEM_DO_BANCO, error: null }, undefined, { data: null, error: null })

    expect((await projecaoPublicaDaViagem(cliente, "t1"))!.lugares).toEqual([])
  })

  it("erro ao ler os lugares lança, como nos itens", async () => {
    const { cliente } = clienteFalso({ data: VIAGEM_DO_BANCO, error: null }, undefined, {
      data: null,
      error: { message: "falhou" },
    })

    await expect(projecaoPublicaDaViagem(cliente, "t1")).rejects.toThrow("Não foi possível ler os lugares")
  })

  it("filtra a viagem, tira os cancelados (mantendo status nulo) e ordena com nulos por último", async () => {
    const { cliente, chamadas } = clienteFalso({ data: VIAGEM_DO_BANCO, error: null })

    await projecaoPublicaDaViagem(cliente, "t1")

    expect(chamadas.eqItens).toHaveBeenCalledWith("trip_id", "t1")
    expect(chamadas.or).toHaveBeenCalledWith("status.is.null,status.neq.cancelled")
    expect(chamadas.order).toHaveBeenNthCalledWith(1, "date", { ascending: true })
    expect(chamadas.order).toHaveBeenNthCalledWith(2, "start_time", {
      ascending: true,
      nullsFirst: false,
    })
    // O post aceita no máximo 200 itens; sem o teto, o insert do post falhava.
    expect(chamadas.limit).toHaveBeenCalledWith(200)
  })

  it("viagem sem itens devolve lista vazia", async () => {
    const { cliente } = clienteFalso(
      { data: VIAGEM_DO_BANCO, error: null },
      { data: null, error: null },
    )

    const viagem = await projecaoPublicaDaViagem(cliente, "t1")

    expect(viagem!.itens).toEqual([])
  })

  it("viagem inexistente ou invisível para a sessão devolve null sem ler itens", async () => {
    const { cliente, from } = clienteFalso({ data: null, error: null })

    expect(await projecaoPublicaDaViagem(cliente, "t1")).toBeNull()
    expect(from).not.toHaveBeenCalledWith("itinerary_items")
    expect(from).not.toHaveBeenCalledWith("places")
  })

  it("erro ao ler a viagem devolve null", async () => {
    const { cliente } = clienteFalso({ data: null, error: { message: "falhou" } })

    expect(await projecaoPublicaDaViagem(cliente, "t1")).toBeNull()
  })

  it("erro ao ler os itens lança, em vez de publicar itinerário pela metade", async () => {
    const { cliente } = clienteFalso(
      { data: VIAGEM_DO_BANCO, error: null },
      { data: null, error: { message: "falhou" } },
    )

    await expect(projecaoPublicaDaViagem(cliente, "t1")).rejects.toThrow(
      "Não foi possível ler o itinerário",
    )
  })
})
