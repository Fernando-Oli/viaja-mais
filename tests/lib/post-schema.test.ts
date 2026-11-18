import { describe, it, expect } from "vitest"
import { camposVisiveisSchema, pedidoPostSchema } from "@/lib/schemas/post"
import { MAXIMO_ITENS_NO_POST } from "@/lib/trips/publico"

/**
 * O corpo de POST e PATCH /api/social/viagens/[tripId]/post: só escolhas
 * (quais itens, quais campos), nunca conteúdo. Tudo fora da lista é 400, e
 * campo opcional não escolhido fica desligado.
 *
 * @RF09.7
 */

const erroDe = (resultado: { success: boolean; error?: { issues: { message: string }[] } }) =>
  resultado.success ? null : resultado.error!.issues.map((i) => i.message).join("; ")

/** uuid válido e distinto para cada índice. */
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`

const DESLIGADOS = { local: false, descricao: false, horario: false, categoria: false }

describe("pedidoPostSchema — válidos", () => {
  it("aceita o mínimo: sem itens e sem campos ligados, com os quatro em false", () => {
    expect(pedidoPostSchema.parse({ itens: [], mostrar: {} })).toEqual({ itens: [], mostrar: DESLIGADOS })
  })

  it("aceita os quatro campos ligados", () => {
    const tudo = { local: true, descricao: true, horario: true, categoria: true }
    expect(pedidoPostSchema.parse({ itens: [uuid(1)], mostrar: tudo })).toEqual({ itens: [uuid(1)], mostrar: tudo })
  })

  it("liga só o que veio, e o resto fica false", () => {
    expect(pedidoPostSchema.parse({ itens: [], mostrar: { horario: true } }).mostrar).toEqual({
      ...DESLIGADOS,
      horario: true,
    })
  })

  it("aceita false explícito", () => {
    expect(pedidoPostSchema.parse({ itens: [], mostrar: DESLIGADOS }).mostrar).toEqual(DESLIGADOS)
  })

  it(`aceita exatamente ${MAXIMO_ITENS_NO_POST} itens`, () => {
    const itens = Array.from({ length: MAXIMO_ITENS_NO_POST }, (_, i) => uuid(i))
    expect(pedidoPostSchema.parse({ itens, mostrar: {} }).itens).toHaveLength(MAXIMO_ITENS_NO_POST)
  })

  it("remove itens repetidos, mantendo a primeira ocorrência", () => {
    expect(pedidoPostSchema.parse({ itens: [uuid(2), uuid(1), uuid(2)], mostrar: {} }).itens).toEqual([
      uuid(2),
      uuid(1),
    ])
  })

  it("normaliza o uuid para minúsculas, e maiúscula e minúscula contam como o mesmo item", () => {
    const minusculo = "abcdef01-2345-4678-89ab-cdef01234567"
    expect(pedidoPostSchema.parse({ itens: [minusculo.toUpperCase(), minusculo], mostrar: {} }).itens).toEqual([
      minusculo,
    ])
  })

  it(`o teto de ${MAXIMO_ITENS_NO_POST} vale para o corpo recebido, antes de deduplicar`, () => {
    const repetidos = Array.from({ length: MAXIMO_ITENS_NO_POST }, () => uuid(7))
    expect(pedidoPostSchema.parse({ itens: repetidos, mostrar: {} }).itens).toEqual([uuid(7)])
    expect(pedidoPostSchema.safeParse({ itens: [...repetidos, uuid(7)], mostrar: {} }).success).toBe(false)
  })
})

describe("pedidoPostSchema — inválidos", () => {
  it(`recusa ${MAXIMO_ITENS_NO_POST + 1} itens`, () => {
    const itens = Array.from({ length: MAXIMO_ITENS_NO_POST + 1 }, (_, i) => uuid(i))
    expect(erroDe(pedidoPostSchema.safeParse({ itens, mostrar: {} }))).toContain(`até ${MAXIMO_ITENS_NO_POST}`)
  })

  it.each([
    ["texto qualquer", "abc"],
    ["número", 42],
    ["vazio", ""],
    ["uuid sem um caractere", "00000000-0000-4000-8000-00000000000"],
    ["nulo", null],
  ])("recusa item que não é uuid (%s)", (_caso, item) => {
    const r = pedidoPostSchema.safeParse({ itens: [uuid(1), item], mostrar: {} })
    expect(r.success).toBe(false)
  })

  it("explica o item fora do formato", () => {
    expect(erroDe(pedidoPostSchema.safeParse({ itens: ["abc"], mostrar: {} }))).toContain("item do itinerário inválido")
  })

  it("recusa itens ausente", () => {
    expect(erroDe(pedidoPostSchema.safeParse({ mostrar: {} }))).toContain("informe os itens")
  })

  it.each([
    ["texto", uuid(1)],
    ["objeto", { 0: uuid(1) }],
    ["nulo", null],
    ["número", 1],
  ])("recusa itens que não é lista (%s)", (_caso, itens) => {
    expect(pedidoPostSchema.safeParse({ itens, mostrar: {} }).success).toBe(false)
  })

  it("recusa mostrar ausente", () => {
    expect(pedidoPostSchema.safeParse({ itens: [] }).success).toBe(false)
  })

  it.each([
    ["notas", { notes: true }],
    ["notas em português", { notas: true }],
    ["título", { titulo: false }],
    ["coordenadas", { latitude: true }],
    ["preço", { preco: true }],
    ["campo conhecido junto com um extra", { local: true, status: true }],
  ])("recusa chave extra em mostrar (%s)", (_caso, mostrar) => {
    expect(erroDe(pedidoPostSchema.safeParse({ itens: [], mostrar }))).toContain(
      "campo que não pode ser mostrado no post",
    )
  })

  it.each([
    ["trip_id", { trip_id: uuid(1) }],
    ["author_id", { author_id: uuid(1) }],
    ["title", { title: "Outra viagem" }],
    ["notes", { notes: "senha do cofre" }],
    ["cover_path", { cover_path: "outra-pessoa/capa.jpg" }],
    ["items já montados", { items: [{ title: "x", notes: "y" }] }],
  ])("recusa chave extra na raiz (%s)", (_caso, extra) => {
    expect(erroDe(pedidoPostSchema.safeParse({ itens: [], mostrar: {}, ...extra }))).toContain("campo não permitido")
  })

  it.each([
    ["texto", "true"],
    ["número", 1],
    ["nulo", null],
    ["objeto", {}],
  ])("recusa valor não booleano em mostrar (%s)", (_caso, valor) => {
    for (const chave of ["local", "descricao", "horario", "categoria"]) {
      expect(erroDe(pedidoPostSchema.safeParse({ itens: [], mostrar: { [chave]: valor } }))).toContain(
        "use verdadeiro ou falso",
      )
    }
  })

  it.each([
    ["nulo", null],
    ["indefinido", undefined],
    ["texto", '{"itens":[],"mostrar":{}}'],
    ["lista", []],
    ["número", 0],
  ])("recusa corpo %s", (_caso, corpo) => {
    expect(pedidoPostSchema.safeParse(corpo).success).toBe(false)
  })
})

describe("camposVisiveisSchema", () => {
  it("sozinho, também começa com tudo desligado", () => {
    expect(camposVisiveisSchema.parse({})).toEqual(DESLIGADOS)
  })

  it("recusa mostrar nulo ou em lista", () => {
    expect(camposVisiveisSchema.safeParse(null).success).toBe(false)
    expect(camposVisiveisSchema.safeParse([]).success).toBe(false)
  })
})
