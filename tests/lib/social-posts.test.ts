/**
 * @RF09.7 o post é uma cópia da projeção pública: o título escolhido (ou o da viagem), legenda limpa, o
 * roteiro inteiro com local e descrição só se ligados, os lugares escolhidos com o endereço escolhido, e
 * nunca notas, coordenadas, status, preço nem ids; texto do grupo acima dos tetos do CHECK fica fora sem
 * derrubar a publicação; data, hora e categoria fora do formato do CHECK saem do item; campo da viagem
 * fora dos CHECKs de trip_posts é 400 com código (ViagemForaDoPost); título e legenda só com invisíveis
 * valem como vazios; as escritas usam só as colunas do grant, sem trip_id; as fotos trocam por inteiro,
 * condicionadas às lidas (409 em corrida)
 */
import { describe, it, expect, beforeEach } from "vitest"
import { banco, semearPost } from "../api/banco-falso"
import type { ItemPublico } from "@/lib/trips/publico"
import type { PedidoPost } from "@/lib/schemas/post"
import { ErroHttp } from "@/lib/http"
import {
  CATEGORIAS_DO_ITEM,
  FORMATO_DATA_ITEM,
  FORMATO_HORA_ITEM,
  MAXIMO_DESCRICAO_ITEM,
  MAXIMO_DESTINO_VIAGEM,
  MAXIMO_ITENS_POST,
  MAXIMO_LOCAL_ITEM,
  MAXIMO_TITULO_ITEM,
  MAXIMO_TITULO_VIAGEM,
  ViagemForaDoPost,
  atualizar,
  definirFotos,
  fotosGravadas,
  viagemDaLinha,
  despublicar,
  lugaresDaProjecao,
  montarPost,
  postDaViagem,
  publicar,
  type CopiaDoPost,
  type LugarPublico,
  type ProjecaoComLugares,
} from "@/lib/social/posts"

// ---------------------------------------------------------------------------
// montarPost
// ---------------------------------------------------------------------------

const ITEM_1 = "aaaaaaaa-1111-4111-8111-111111111111"
const ITEM_2 = "bbbbbbbb-2222-4222-8222-222222222222"
const ITEM_3 = "cccccccc-3333-4333-8333-333333333333"

const LUGAR_1 = "dddddddd-1111-4111-8111-111111111111"
const LUGAR_2 = "eeeeeeee-2222-4222-8222-222222222222"
const LUGAR_3 = "ffffffff-3333-4333-8333-333333333333"

type Escolhas = Pick<PedidoPost, "legenda" | "roteiro" | "lugares">

const DESLIGADO: Escolhas = { legenda: null, roteiro: null, lugares: null }
const SO_ROTEIRO: Escolhas = { ...DESLIGADO, roteiro: { local: false, descricao: false } }
const ROTEIRO_TODO: Escolhas = { ...DESLIGADO, roteiro: { local: true, descricao: true } }

const pousada: ItemPublico = {
  id: ITEM_2,
  title: "Pousada",
  date: "2026-12-01",
  start_time: null,
  end_time: null,
  category: "accommodation",
  location: null,
  description: null,
}

const trilha: ItemPublico = {
  id: ITEM_1,
  title: "Trilha",
  date: "2026-12-02",
  start_time: "08:00",
  end_time: "12:00",
  category: "activity",
  location: "Vale da Lua",
  description: "Levar água",
}

const jantar: ItemPublico = {
  id: ITEM_3,
  title: "Jantar",
  date: "2026-12-03",
  start_time: "20:00",
  end_time: null,
  category: "restaurant",
  location: "Centro",
  description: "Reservado",
}

const cachoeira: LugarPublico = {
  id: LUGAR_1,
  name: "Cachoeira Santa Bárbara",
  category: "attraction",
  address: "Cavalcante - GO",
}
const restaurante: LugarPublico = { id: LUGAR_2, name: "Restaurante Rancho", category: null, address: null }
const mirante: LugarPublico = { id: LUGAR_3, name: "Mirante", category: "viewpoint", address: "   " }

function projecao(
  itens: ItemPublico[] = [pousada, trilha, jantar],
  lugares: LugarPublico[] | null = [cachoeira, restaurante, mirante],
): ProjecaoComLugares {
  return {
    title: "Chapada",
    destination: "Alto Paraíso",
    start_date: "2026-12-01",
    end_date: "2026-12-05",
    itens,
    ...(lugares ? { lugares } : {}),
  }
}

const CHAVES_DO_ITEM = ["title", "date", "start_time", "end_time", "category", "location", "description"]
const CHAVES_DO_LUGAR = ["name", "category", "address"]

describe("montarPost — a viagem e a legenda", () => {
  it("copia título, destino e datas da projeção, e nada mais da viagem", () => {
    const post = montarPost({ ...projecao(), budget: 3000, currency: "BRL" } as ProjecaoComLugares, DESLIGADO)
    expect(Object.keys(post).sort()).toEqual([
      "caption",
      "destination",
      "end_date",
      "items",
      "places",
      "start_date",
      "title",
    ])
    expect(post).toEqual({
      title: "Chapada",
      destination: "Alto Paraíso",
      start_date: "2026-12-01",
      end_date: "2026-12-05",
      caption: null,
      items: [],
      places: [],
    })
  })

  it.each([
    ["null", null, null],
    ["vazia", "", null],
    ["só espaços", "  \n ", null],
    ["com espaços nas pontas", "  Que viagem!  ", "Que viagem!"],
  ])("legenda %s", (_caso, legenda, esperada) => {
    expect(montarPost(projecao(), { ...DESLIGADO, legenda }).caption).toBe(esperada)
  })
})

describe("montarPost — o título", () => {
  it.each([
    ["ausente", undefined, "Chapada"],
    ["nulo", null, "Chapada"],
    ["vazio", "", "Chapada"],
    ["só espaços", "   ", "Chapada"],
    ["escolhido", "Fim de ano no cerrado", "Fim de ano no cerrado"],
    ["escolhido com espaços nas pontas", "  Fim de ano  ", "Fim de ano"],
    ["escolhido no teto de 120", "t".repeat(120), "t".repeat(120)],
    // O schema já recusa; se chegar mesmo assim, o CHECK recusaria: vale o da viagem.
    ["acima do teto", "t".repeat(121), "Chapada"],
  ])("título %s", (_caso, titulo, esperado) => {
    expect(montarPost(projecao(), { ...DESLIGADO, titulo }).title).toBe(esperado)
  })
})

describe("montarPost — título e legenda só com invisíveis (R3, defesa sem o zod)", () => {
  it.each([
    ["U+200B", "​"],
    ["U+FEFF", "﻿"],
    ["U+2060", "⁠"],
    ["os três com espaços", " ​﻿ ⁠ "],
  ])("%s: o título cai no da viagem e a legenda vira null", (_caso, invisivel) => {
    const post = montarPost(projecao(), { ...DESLIGADO, titulo: invisivel, legenda: invisivel })
    expect(post.title).toBe("Chapada")
    expect(post.caption).toBeNull()
  })

  it("invisíveis nas pontas saem do título e da legenda escolhidos", () => {
    const post = montarPost(projecao(), { ...DESLIGADO, titulo: "​Fim de ano⁠", legenda: "﻿Que viagem!​" })
    expect(post.title).toBe("Fim de ano")
    expect(post.caption).toBe("Que viagem!")
  })
})

describe("montarPost — campos da viagem fora dos CHECKs de trip_posts (R2): 400 com código, não 500", () => {
  const comViagem = (campos: Partial<ProjecaoComLugares>) => ({ ...projecao(), ...campos })

  function recusa(campos: Partial<ProjecaoComLugares>, titulo?: string | null) {
    const erro = (() => {
      try {
        montarPost(comViagem(campos), { ...DESLIGADO, titulo })
        return null
      } catch (e) {
        return e
      }
    })()
    expect(erro).toBeInstanceOf(ViagemForaDoPost)
    expect(erro).toBeInstanceOf(ErroHttp)
    expect((erro as ViagemForaDoPost).status).toBe(400)
    return erro as ViagemForaDoPost
  }

  it("espelha os tetos dos CHECKs: título 120, destino 160", () => {
    expect([MAXIMO_TITULO_VIAGEM, MAXIMO_DESTINO_VIAGEM]).toEqual([120, 160])
  })

  it("título da viagem com 130 caracteres e sem `titulo` no corpo: titulo_da_viagem_longo", () => {
    const erro = recusa({ title: "t".repeat(130) })
    expect(erro.codigo).toBe("titulo_da_viagem_longo")
    expect(erro.message).toBe("O título da viagem passa de 120 caracteres: escreva um título para a publicação")
  })

  it("o mesmo título longo com `titulo` escolhido publica: o da viagem não é usado", () => {
    expect(montarPost(comViagem({ title: "t".repeat(130) }), { ...DESLIGADO, titulo: "Meu título" }).title).toBe(
      "Meu título",
    )
  })

  it("título da viagem no teto (120, e 120 emojis) passa; vazio é titulo_da_viagem_vazio", () => {
    expect(montarPost(comViagem({ title: "t".repeat(120) }), DESLIGADO).title).toBe("t".repeat(120))
    expect(montarPost(comViagem({ title: "🌄".repeat(120) }), DESLIGADO).title).toBe("🌄".repeat(120))
    expect(recusa({ title: "   " }).codigo).toBe("titulo_da_viagem_vazio")
  })

  it("destino com 170 caracteres: destino_da_viagem_longo, mesmo com `titulo` escolhido", () => {
    const erro = recusa({ destination: "d".repeat(170) }, "Meu título")
    expect(erro.codigo).toBe("destino_da_viagem_longo")
    expect(erro.message).toContain("160 caracteres")
  })

  it("destino no teto (160) passa, sem os espaços das pontas; vazio é destino_da_viagem_vazio", () => {
    expect(montarPost(comViagem({ destination: ` ${"d".repeat(160)} ` }), DESLIGADO).destination).toBe("d".repeat(160))
    expect(recusa({ destination: "" }).codigo).toBe("destino_da_viagem_vazio")
  })

  it("datas invertidas (volta antes da ida): datas_da_viagem_invertidas", () => {
    const erro = recusa({ start_date: "2026-12-05", end_date: "2026-12-01" })
    expect(erro.codigo).toBe("datas_da_viagem_invertidas")
    expect(erro.message).toContain("antes da ida")
  })

  it("ida e volta no mesmo dia passa", () => {
    const post = montarPost(comViagem({ start_date: "2026-12-01", end_date: "2026-12-01" }), DESLIGADO)
    expect([post.start_date, post.end_date]).toEqual(["2026-12-01", "2026-12-01"])
  })

  it.each([
    ["ano 10000 na ida", { start_date: "10000-01-01" }],
    ["antes de Cristo na ida", { start_date: "0044-03-15 BC" }],
    ["ano 10000 na volta", { end_date: "10000-01-01" }],
    ["volta vazia", { end_date: "" }],
  ])("data da viagem fora do formato (%s): datas_da_viagem_invalidas", (_caso, campos) => {
    expect(recusa(campos).codigo).toBe("datas_da_viagem_invalidas")
  })
})

describe("montarPost — formato de data, hora e categoria do item (R2): o campo sai, o item fica", () => {
  it("as regex são as do CHECK social_itens_do_post_validos", () => {
    expect(FORMATO_DATA_ITEM.source).toBe("^\\d{4}-\\d{2}-\\d{2}$")
    expect(FORMATO_HORA_ITEM.source).toBe("^([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d)?$")
    expect([...CATEGORIAS_DO_ITEM].sort()).toEqual(
      ["accommodation", "activity", "attraction", "other", "restaurant", "transport"],
    )
  })

  it.each([
    ["24:00:00 (o `time` do Postgres aceita)", "24:00:00"],
    ["24:00", "24:00"],
    ["fração de segundo", "08:00:00.5"],
    ["fração de segundo com microssegundos", "23:59:59.999999"],
    ["minuto 60", "08:60"],
    ["sem zero à esquerda", "8:00"],
    ["com fuso", "08:00:00+03"],
  ])("hora fora do formato (%s) é omitida, no início e no fim", (_caso, hora) => {
    const [item] = montarPost(projecao([{ ...trilha, start_time: hora, end_time: hora }]), SO_ROTEIRO).items
    expect(item).toStrictEqual({ title: "Trilha", date: "2026-12-02", category: "activity" })
  })

  it.each([
    ["00:00", "00:00"],
    ["23:59:59", "23:59:59"],
    ["08:05:00 (como o Postgres devolve)", "08:05:00"],
  ])("hora no formato (%s) entra", (_caso, hora) => {
    const [item] = montarPost(projecao([{ ...trilha, start_time: hora, end_time: null }]), SO_ROTEIRO).items
    expect(item.start_time).toBe(hora)
  })

  it.each([
    ["ano 10000", "10000-01-01"],
    ["antes de Cristo", "0044-03-15 BC"],
    ["com hora", "2026-12-02T10:00:00"],
    ["com barras", "02/12/2026"],
  ])("data do item fora do formato (%s) é omitida", (_caso, data) => {
    const [item] = montarPost(projecao([{ ...trilha, date: data }]), SO_ROTEIRO).items
    expect(item).toStrictEqual({ title: "Trilha", start_time: "08:00", end_time: "12:00", category: "activity" })
  })

  it.each([["viewpoint"], ["Activity"], ["hotel"]])("categoria fora da lista do CHECK (%s) é omitida", (categoria) => {
    const [item] = montarPost(projecao([{ ...trilha, category: categoria }]), SO_ROTEIRO).items
    expect(item).not.toHaveProperty("category")
    expect(item.title).toBe("Trilha")
  })

  it("todas as categorias da lista entram", () => {
    const itens = [...CATEGORIAS_DO_ITEM].map((category) => ({ ...trilha, category }))
    expect(montarPost(projecao(itens), SO_ROTEIRO).items.map((i) => i.category)).toEqual([...CATEGORIAS_DO_ITEM])
  })
})

describe("montarPost — tetos do CHECK de itens (S1)", () => {
  it("espelha os tetos de social_itens_do_post_validos", () => {
    expect([MAXIMO_TITULO_ITEM, MAXIMO_LOCAL_ITEM, MAXIMO_DESCRICAO_ITEM]).toEqual([120, 200, 2000])
  })

  it("item com título acima de 120 fica fora da cópia; no teto, entra", () => {
    const longo: ItemPublico = { ...trilha, title: "x".repeat(MAXIMO_TITULO_ITEM + 1) }
    const noTeto: ItemPublico = { ...jantar, title: "j".repeat(MAXIMO_TITULO_ITEM) }
    const items = montarPost(projecao([longo, noTeto, pousada]), SO_ROTEIRO).items
    expect(items.map((i) => i.title)).toEqual(["j".repeat(MAXIMO_TITULO_ITEM), "Pousada"])
  })

  it("no máximo 200 itens, os primeiros na ordem da projeção (o CHECK recusa mais)", () => {
    expect(MAXIMO_ITENS_POST).toBe(200)
    const muitos: ItemPublico[] = Array.from({ length: MAXIMO_ITENS_POST + 5 }, (_, i) => ({
      ...pousada,
      id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      title: `Item ${i}`,
    }))
    const items = montarPost(projecao(muitos), SO_ROTEIRO).items
    expect(items).toHaveLength(MAXIMO_ITENS_POST)
    expect(items[0].title).toBe("Item 0")
    expect(items.at(-1)!.title).toBe(`Item ${MAXIMO_ITENS_POST - 1}`)
  })

  it("o teto de 200 conta só os itens que entram (título longo não ocupa vaga)", () => {
    const longo: ItemPublico = { ...trilha, title: "x".repeat(MAXIMO_TITULO_ITEM + 1) }
    const validos: ItemPublico[] = Array.from({ length: MAXIMO_ITENS_POST }, (_, i) => ({ ...pousada, title: `V${i}` }))
    const items = montarPost(projecao([longo, ...validos]), SO_ROTEIRO).items
    expect(items).toHaveLength(MAXIMO_ITENS_POST)
    expect(items[0].title).toBe("V0")
  })

  it("o teto do título vale depois do trim e em caracteres (emojis contam 1)", () => {
    const comEspacos: ItemPublico = { ...trilha, title: `  ${"x".repeat(MAXIMO_TITULO_ITEM)}  ` }
    const emojis: ItemPublico = { ...jantar, title: "🌄".repeat(MAXIMO_TITULO_ITEM) }
    expect(montarPost(projecao([comEspacos, emojis]), SO_ROTEIRO).items).toHaveLength(2)
  })

  it("local acima de 200 e descrição acima de 2000 são omitidos; o item fica", () => {
    const longo: ItemPublico = {
      ...trilha,
      location: "l".repeat(MAXIMO_LOCAL_ITEM + 1),
      description: "d".repeat(MAXIMO_DESCRICAO_ITEM + 1),
    }
    const [item] = montarPost(projecao([longo]), ROTEIRO_TODO).items
    expect(item).toStrictEqual({
      title: "Trilha",
      date: "2026-12-02",
      start_time: "08:00",
      end_time: "12:00",
      category: "activity",
    })
  })

  it("local com 200 e descrição com 2000 entram inteiros", () => {
    const noTeto: ItemPublico = {
      ...trilha,
      location: "l".repeat(MAXIMO_LOCAL_ITEM),
      description: "d".repeat(MAXIMO_DESCRICAO_ITEM),
    }
    const [item] = montarPost(projecao([noTeto]), ROTEIRO_TODO).items
    expect(item.location).toBe("l".repeat(MAXIMO_LOCAL_ITEM))
    expect(item.description).toBe("d".repeat(MAXIMO_DESCRICAO_ITEM))
  })
})

describe("montarPost — roteiro dia a dia", () => {
  it("desligado (null): nenhum item", () => {
    expect(montarPost(projecao(), DESLIGADO).items).toEqual([])
  })

  it("ligado: todos os itens, na ordem da projeção, com data, horários e categoria quando existem", () => {
    expect(montarPost(projecao(), SO_ROTEIRO).items).toStrictEqual([
      { title: "Pousada", date: "2026-12-01", category: "accommodation" },
      { title: "Trilha", date: "2026-12-02", start_time: "08:00", end_time: "12:00", category: "activity" },
      { title: "Jantar", date: "2026-12-03", start_time: "20:00", category: "restaurant" },
    ])
  })

  it.each([
    ["local", { local: true, descricao: false }, { location: "Vale da Lua" }],
    ["descricao", { local: false, descricao: true }, { description: "Levar água" }],
    ["os dois", { local: true, descricao: true }, { location: "Vale da Lua", description: "Levar água" }],
  ] as const)("subchave %s: liga só o campo dela", (_caso, roteiro, extra) => {
    const [item] = montarPost(projecao([trilha]), { ...DESLIGADO, roteiro }).items
    expect(item).toStrictEqual({
      title: "Trilha",
      date: "2026-12-02",
      start_time: "08:00",
      end_time: "12:00",
      category: "activity",
      ...extra,
    })
  })

  it("campo ligado mas nulo é omitido, não vira null", () => {
    const [item] = montarPost(projecao([pousada]), ROTEIRO_TODO).items
    expect(item).toStrictEqual({ title: "Pousada", date: "2026-12-01", category: "accommodation" })
    expect(Object.values(item)).not.toContain(null)
  })

  it("o texto é limpo: espaços das pontas saem, e vazio ou só espaços é omitido", () => {
    const sujo: ItemPublico = {
      ...trilha,
      title: "  Trilha  ",
      location: "  Vale da Lua ",
      description: "",
      category: "\t",
    }
    const [item] = montarPost(projecao([sujo]), ROTEIRO_TODO).items
    expect(item).toStrictEqual({
      title: "Trilha",
      date: "2026-12-02",
      start_time: "08:00",
      end_time: "12:00",
      location: "Vale da Lua",
    })
  })

  it("item sem título (vazio ou só espaços) fica de fora: o CHECK do banco o recusaria", () => {
    const semTitulo: ItemPublico = { ...trilha, title: "   " }
    expect(montarPost(projecao([semTitulo, jantar]), SO_ROTEIRO).items.map((i) => i.title)).toEqual(["Jantar"])
  })

  it("notes, coordenadas, status, id e preço nunca saem, mesmo com tudo ligado", () => {
    // Como se alguém trocasse o select da projeção por `*`: as chaves chegam em runtime.
    const vazado = {
      ...trilha,
      notes: "senha do wifi",
      latitude: -14.1,
      longitude: -47.5,
      status: "confirmed",
      price: 120,
      trip_id: "dddddddd-4444-4444-8444-444444444444",
    } as ItemPublico
    const [item] = montarPost(projecao([vazado]), ROTEIRO_TODO).items

    for (const chave of Object.keys(item)) expect(CHAVES_DO_ITEM).toContain(chave)
    for (const chave of ["notes", "latitude", "longitude", "status", "id", "price", "trip_id"]) {
      expect(item).not.toHaveProperty(chave)
    }
    expect(JSON.stringify(item)).not.toContain("senha do wifi")
  })
})

describe("montarPost — lugares salvos", () => {
  it("desligado (null): nenhum lugar", () => {
    expect(montarPost(projecao(), DESLIGADO).places).toEqual([])
  })

  it("ligado com lista vazia: nenhum lugar", () => {
    expect(montarPost(projecao(), { ...DESLIGADO, lugares: [] }).places).toEqual([])
  })

  it("só os escolhidos, na ordem da projeção e não na do pedido", () => {
    const post = montarPost(projecao(), {
      ...DESLIGADO,
      lugares: [
        { id: LUGAR_3, endereco: "nenhum" },
        { id: LUGAR_1, endereco: "nenhum" },
      ],
    })
    expect(post.places.map((l) => l.name)).toEqual(["Cachoeira Santa Bárbara", "Mirante"])
  })

  it("id fora da projeção (de outra viagem, apagado, inventado) é ignorado", () => {
    const post = montarPost(projecao(), {
      ...DESLIGADO,
      lugares: [
        { id: "99999999-9999-4999-8999-999999999999", endereco: "google" },
        { id: LUGAR_2, endereco: "nenhum" },
      ],
    })
    expect(post.places).toStrictEqual([{ name: "Restaurante Rancho" }])
  })

  it("compara ids sem diferenciar maiúsculas, dos dois lados", () => {
    const maiusculo = { ...cachoeira, id: LUGAR_1.toUpperCase() }
    const pedido = { ...DESLIGADO, lugares: [{ id: LUGAR_1, endereco: "nenhum" as const }] }
    expect(montarPost(projecao([], [maiusculo]), pedido).places).toHaveLength(1)
    const pedidoMaiusculo = { ...DESLIGADO, lugares: [{ id: LUGAR_1.toUpperCase(), endereco: "nenhum" as const }] }
    expect(montarPost(projecao([], [cachoeira]), pedidoMaiusculo).places).toHaveLength(1)
  })

  it('endereço "nenhum": nome e categoria, sem address mesmo havendo um', () => {
    const [lugar] = montarPost(projecao(), { ...DESLIGADO, lugares: [{ id: LUGAR_1, endereco: "nenhum" }] }).places
    expect(lugar).toStrictEqual({ name: "Cachoeira Santa Bárbara", category: "attraction" })
  })

  it('endereço "google": copia o address da projeção', () => {
    const [lugar] = montarPost(projecao(), { ...DESLIGADO, lugares: [{ id: LUGAR_1, endereco: "google" }] }).places
    expect(lugar).toStrictEqual({ name: "Cachoeira Santa Bárbara", category: "attraction", address: "Cavalcante - GO" })
  })

  it('endereço "google" com address nulo ou só espaços: o lugar sai sem address', () => {
    const post = montarPost(projecao(), {
      ...DESLIGADO,
      lugares: [
        { id: LUGAR_2, endereco: "google" },
        { id: LUGAR_3, endereco: "google" },
      ],
    })
    expect(post.places).toStrictEqual([{ name: "Restaurante Rancho" }, { name: "Mirante", category: "viewpoint" }])
  })

  it("endereço digitado: sai limpo, no lugar do da projeção", () => {
    const [lugar] = montarPost(projecao(), {
      ...DESLIGADO,
      lugares: [{ id: LUGAR_1, endereco: { texto: "  Estrada da cachoeira, km 3 " } }],
    }).places
    expect(lugar.address).toBe("Estrada da cachoeira, km 3")
  })

  it("endereço digitado só com espaços (por fora do schema) é omitido", () => {
    const [lugar] = montarPost(projecao(), { ...DESLIGADO, lugares: [{ id: LUGAR_1, endereco: { texto: "  " } }] })
      .places
    expect(lugar).not.toHaveProperty("address")
  })

  it("acima do teto do banco: categoria e endereço longos ficam de fora; lugar sem nome válido não entra", () => {
    const longo: LugarPublico = {
      id: LUGAR_1,
      name: "  Cachoeira  ",
      category: "c".repeat(61),
      address: "a".repeat(301),
    }
    const semNome: LugarPublico = { id: LUGAR_2, name: "   ", category: "x", address: "y" }
    const nomeLongo: LugarPublico = { id: LUGAR_3, name: "n".repeat(201), category: null, address: null }
    const post = montarPost(projecao([], [longo, semNome, nomeLongo]), {
      ...DESLIGADO,
      lugares: [
        { id: LUGAR_1, endereco: "google" },
        { id: LUGAR_2, endereco: "google" },
        { id: LUGAR_3, endereco: "nenhum" },
      ],
    })
    expect(post.places).toStrictEqual([{ name: "Cachoeira" }])
  })

  it("no teto exato, categoria (60) e endereço (300) entram", () => {
    const noTeto: LugarPublico = { id: LUGAR_1, name: "N", category: "c".repeat(60), address: "a".repeat(300) }
    const [lugar] = montarPost(projecao([], [noTeto]), { ...DESLIGADO, lugares: [{ id: LUGAR_1, endereco: "google" }] })
      .places
    expect(lugar).toStrictEqual({ name: "N", category: "c".repeat(60), address: "a".repeat(300) })
  })

  it("notes, coordenadas, rating, visited, place_id e id nunca saem", () => {
    const vazado = {
      ...cachoeira,
      notes: "chave do portão 1234",
      latitude: -13.9,
      longitude: -47.4,
      rating: 4.8,
      visited: true,
      place_id: "ChIJ-segredo",
      trip_id: "dddddddd-4444-4444-8444-444444444444",
    } as LugarPublico
    const [lugar] = montarPost(projecao([], [vazado]), {
      ...DESLIGADO,
      lugares: [{ id: LUGAR_1, endereco: "google" }],
    }).places
    for (const chave of Object.keys(lugar)) expect(CHAVES_DO_LUGAR).toContain(chave)
    expect(JSON.stringify(lugar)).not.toMatch(/1234|ChIJ|4\.8|-13\.9|dddddddd/)
  })

  it("projeção ainda sem lugares (antes da entrega da Audrey): lista vazia, sem erro", () => {
    const semLugares = projecao([], null)
    expect(lugaresDaProjecao(semLugares)).toEqual([])
    expect(montarPost(semLugares, { ...DESLIGADO, lugares: [{ id: LUGAR_1, endereco: "google" }] }).places).toEqual([])
  })
})

describe("montarPost — pureza", () => {
  it("não altera a projeção nem o pedido", () => {
    const original = projecao()
    const copiaDaOriginal = structuredClone(original)
    const pedido: Escolhas = {
      legenda: " oi ",
      roteiro: { local: true, descricao: true },
      lugares: [{ id: LUGAR_1, endereco: { texto: " x " } }],
    }
    const copiaDoPedido = structuredClone(pedido)
    montarPost(original, pedido)
    expect(original).toEqual(copiaDaOriginal)
    expect(pedido).toEqual(copiaDoPedido)
  })
})
// ---------------------------------------------------------------------------
// Funções de banco, sobre o banco falso (tests/api/banco-falso.ts)
// ---------------------------------------------------------------------------

const VIAGEM = "99999999-9999-4999-8999-999999999999"
const AUTOR = "11111111-1111-4111-8111-111111111111"
const FOTO_1 = `${AUTOR}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`
const FOTO_2 = `${AUTOR}/1c7a3d5f-6e8b-4b9f-8c2d-3a4f5e6b7c8d.webp`

const COPIA: CopiaDoPost = {
  title: "Chapada",
  destination: "Alto Paraíso",
  start_date: "2026-12-01",
  end_date: "2026-12-05",
  caption: "Que viagem!",
  items: [{ title: "Trilha", location: "Vale da Lua" }],
  places: [{ name: "Mirante", address: "Estrada, km 3" }],
}

const CHAVES_DO_POST = [
  "caption",
  "created_at",
  "destination",
  "end_date",
  "id",
  "items",
  "photos",
  "places",
  "start_date",
  "title",
  "updated_at",
]

const sessao = () => banco.clienteDaSessao()

function postGravado(campos: Record<string, unknown> = {}) {
  return semearPost({ author_id: AUTOR, trip_id: VIAGEM, ...COPIA, ...campos })
}

describe("funções de banco do post de viagem (posts)", () => {
  beforeEach(() => {
    banco.reiniciar()
    banco.tabelas.profiles.push({ id: AUTOR, username: "autor" })
    banco.membros.set(VIAGEM, [AUTOR])
    banco.sessao = AUTOR
  })

  it("postDaViagem: acha pela função do banco e devolve sem trip_id nem author_id; sem post, null sem ler a tabela", async () => {
    expect(await postDaViagem(sessao(), VIAGEM)).toBeNull()
    expect(banco.consultas).toEqual([])
    const linha = postGravado({ photos: [FOTO_1], items: [{ title: "Trilha", notes: "senha", latitude: -14 }] })
    const post = await postDaViagem(sessao(), VIAGEM)
    expect(Object.keys(post!).sort()).toEqual(CHAVES_DO_POST)
    expect(post).toMatchObject({ id: linha.id, photos: [FOTO_1], items: [{ title: "Trilha" }] })
    expect(banco.consultas[0].colunas).not.toMatch(/trip_id|author_id|\*/)
  })

  it("postDaViagem: erro da função lança sem a mensagem crua", async () => {
    banco.falhas.push({ tabela: "rpc:social_meu_post_da_viagem", operacao: "rpc", erro: { code: "XX000", message: "cru" } })
    const erro = await postDaViagem(sessao(), VIAGEM).catch((e: Error) => e)
    expect(erro).not.toBeInstanceOf(ErroHttp)
    expect((erro as Error).message).not.toContain("cru")
  })

  it("publicar: só as colunas do grant, sem photos, e devolve o post", async () => {
    const copiaSuja = { ...COPIA, photos: [FOTO_1], notes: "x" } as CopiaDoPost
    const post = await publicar(sessao(), { tripId: VIAGEM, autorId: AUTOR, copia: copiaSuja })
    expect(Object.keys(banco.consultas[0].valores as object).sort()).toEqual(
      ["author_id", "caption", "destination", "end_date", "items", "places", "start_date", "title", "trip_id"],
    )
    expect(post.photos).toEqual([])
  })

  it("publicar: 23505 vira 409 e 42501 vira 403", async () => {
    banco.falhas.push({ tabela: "posts", operacao: "insert", erro: { code: "23505" } })
    await expect(publicar(sessao(), { tripId: VIAGEM, autorId: AUTOR, copia: COPIA })).rejects.toMatchObject({ status: 409 })
    banco.membros.set(VIAGEM, [])
    await expect(publicar(sessao(), { tripId: VIAGEM, autorId: AUTOR, copia: COPIA })).rejects.toMatchObject({ status: 403 })
  })

  it("atualizar: só o conteúdo; null quando nenhuma linha mudou", async () => {
    const linha = postGravado({ photos: [FOTO_1] })
    const post = await atualizar(sessao(), linha.id as string, { ...COPIA, caption: "nova" })
    expect(post).toMatchObject({ caption: "nova", photos: [FOTO_1] })
    expect(Object.keys(banco.consultas.at(-1)!.valores as object)).not.toContain("photos")
    expect(await atualizar(sessao(), "88888888-8888-4888-8888-888888888888", COPIA)).toBeNull()
  })

  it("definirFotos: troca condicionada às fotos lidas e devolve as anteriores; post alheio null; corrida 409", async () => {
    const linha = postGravado({ photos: [FOTO_1] })
    expect(await definirFotos(sessao(), linha.id as string, [FOTO_2])).toEqual({ fotosAnteriores: [FOTO_1] })
    expect(linha.photos).toEqual([FOTO_2])
    expect(await definirFotos(sessao(), linha.id as string, [])).toEqual({ fotosAnteriores: [FOTO_2] })
    expect(await definirFotos(sessao(), "88888888-8888-4888-8888-888888888888", [])).toBeNull()

    banco.antesDe = (tabela, operacao) => {
      if (tabela === "posts" && operacao === "update") linha.photos = [FOTO_1]
    }
    await expect(definirFotos(sessao(), linha.id as string, [FOTO_2])).rejects.toMatchObject({ status: 409 })
  })

  it("definirFotos: caminho gravado fora do formato não vira filtro", async () => {
    const linha = postGravado({ photos: ["https://x/y.webp"] })
    await expect(definirFotos(sessao(), linha.id as string, [FOTO_1])).rejects.toThrow(/fora do formato/)
  })

  it("despublicar: apaga e devolve as fotos; null quando nada foi apagado", async () => {
    const linha = postGravado({ photos: [FOTO_1, FOTO_2] })
    expect(await despublicar(sessao(), linha.id as string)).toEqual({ fotosAnteriores: [FOTO_1, FOTO_2] })
    expect(await despublicar(sessao(), linha.id as string)).toBeNull()
    banco.falhas.push({ tabela: "posts", operacao: "delete", erro: { code: "42501" } })
    await expect(despublicar(sessao(), linha.id as string)).rejects.toMatchObject({ status: 403 })
  })

  it("viagemDaLinha: null sem os quatro campos; lista branca nos itens; fotosGravadas só texto", () => {
    expect(viagemDaLinha({ title: null })).toBeNull()
    expect(viagemDaLinha({ ...COPIA, items: [{ title: "T", notes: "x" }], places: "não lista" })).toStrictEqual({
      title: "Chapada",
      destination: "Alto Paraíso",
      start_date: "2026-12-01",
      end_date: "2026-12-05",
      items: [{ title: "T" }],
      places: [],
    })
    expect(fotosGravadas([FOTO_1, 3, "", null])).toEqual([FOTO_1])
    expect(fotosGravadas("x")).toEqual([])
  })
})
