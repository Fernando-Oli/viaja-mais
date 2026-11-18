import { describe, it, expect } from "vitest"
import {
  MAXIMO_ENDERECO,
  MAXIMO_LEGENDA,
  MAXIMO_LUGARES_NO_POST,
  MAXIMO_MARCADOS,
  caracteres,
  enderecoSchema,
  pedidoPostSchema,
} from "@/lib/schemas/post"

/**
 * O corpo de POST e PATCH /api/social/viagens/[tripId]/post (contrato de
 * 18/11): legenda, roteiro, lugares e marcados. Todo objeto é estrito; uuid vai
 * para minúsculas, e repetido é 400.
 *
 * @RF09.7 legenda, roteiro e lugares · @RF09.13 marcados
 */

const erroDe = (resultado: { success: boolean; error?: { issues: { message: string }[] } }) =>
  resultado.success ? null : resultado.error!.issues.map((i) => i.message).join("; ")

/** uuid válido e distinto para cada índice. */
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`

const MINIMO = { roteiro: null, lugares: null }
const comLugar = (endereco: unknown, id = uuid(1)) => ({ ...MINIMO, lugares: [{ id, endereco }] })

describe("pedidoPostSchema — o mínimo", () => {
  it("roteiro e lugares desligados, sem legenda nem marcados: legenda null e marcados []", () => {
    expect(pedidoPostSchema.parse(MINIMO)).toEqual({ legenda: null, roteiro: null, lugares: null, marcados: [] })
  })

  it("aceita tudo ligado", () => {
    const corpo = {
      legenda: "Que viagem!",
      roteiro: { local: true, descricao: false },
      lugares: [
        { id: uuid(1), endereco: "nenhum" },
        { id: uuid(2), endereco: "google" },
        { id: uuid(3), endereco: { texto: "Rua A, 10" } },
      ],
      marcados: [uuid(9)],
    }
    expect(pedidoPostSchema.parse(corpo)).toEqual(corpo)
  })

  it("lista de lugares vazia é diferente de null: chave ligada sem nenhum lugar", () => {
    expect(pedidoPostSchema.parse({ ...MINIMO, lugares: [] }).lugares).toEqual([])
  })
})

describe("pedidoPostSchema — legenda", () => {
  it.each([
    ["ausente", undefined],
    ["null", null],
    ["vazia", ""],
    ["só espaços", "   \n\t "],
  ])("%s vira null", (_caso, legenda) => {
    expect(pedidoPostSchema.parse({ ...MINIMO, legenda }).legenda).toBeNull()
  })

  it("tira os espaços das pontas e mantém as quebras de linha do meio", () => {
    expect(pedidoPostSchema.parse({ ...MINIMO, legenda: "  linha 1\nlinha 2  " }).legenda).toBe("linha 1\nlinha 2")
  })

  it(`aceita exatamente ${MAXIMO_LEGENDA} caracteres, e o teto vale depois do trim`, () => {
    const cheia = "a".repeat(MAXIMO_LEGENDA)
    expect(pedidoPostSchema.parse({ ...MINIMO, legenda: `  ${cheia}  ` }).legenda).toBe(cheia)
  })

  it(`recusa ${MAXIMO_LEGENDA + 1} caracteres`, () => {
    expect(erroDe(pedidoPostSchema.safeParse({ ...MINIMO, legenda: "a".repeat(MAXIMO_LEGENDA + 1) }))).toContain(
      `até ${MAXIMO_LEGENDA}`,
    )
  })

  it("conta caracteres como o char_length do banco: 280 emojis cabem", () => {
    const emojis = "🌍".repeat(MAXIMO_LEGENDA)
    expect(emojis.length).toBe(MAXIMO_LEGENDA * 2)
    expect(caracteres(emojis)).toBe(MAXIMO_LEGENDA)
    expect(pedidoPostSchema.parse({ ...MINIMO, legenda: emojis }).legenda).toBe(emojis)
    expect(pedidoPostSchema.safeParse({ ...MINIMO, legenda: emojis + "🌍" }).success).toBe(false)
  })

  it.each([
    ["número", 42],
    ["objeto", { texto: "x" }],
    ["lista", ["x"]],
  ])("recusa legenda que não é texto (%s)", (_caso, legenda) => {
    expect(erroDe(pedidoPostSchema.safeParse({ ...MINIMO, legenda }))).toContain("a legenda deve ser texto")
  })
})

describe("pedidoPostSchema — roteiro", () => {
  it("aceita as quatro combinações", () => {
    for (const local of [true, false]) {
      for (const descricao of [true, false]) {
        expect(pedidoPostSchema.parse({ ...MINIMO, roteiro: { local, descricao } }).roteiro).toEqual({ local, descricao })
      }
    }
  })

  it("recusa roteiro ausente: desligar é mandar null", () => {
    expect(erroDe(pedidoPostSchema.safeParse({ lugares: null }))).toContain("informe o roteiro")
  })

  it.each([
    ["sem descricao", { local: true }],
    ["sem local", { descricao: true }],
    ["vazio", {}],
  ])("recusa roteiro %s", (_caso, roteiro) => {
    expect(pedidoPostSchema.safeParse({ ...MINIMO, roteiro }).success).toBe(false)
  })

  it.each([
    ["notas", { local: true, descricao: true, notas: true }],
    ["notes", { local: true, descricao: true, notes: true }],
    ["coordenadas", { local: true, descricao: true, latitude: true }],
    ["itens escolhidos (contrato antigo)", { local: true, descricao: true, itens: [uuid(1)] }],
  ])("recusa chave extra no roteiro (%s)", (_caso, roteiro) => {
    expect(erroDe(pedidoPostSchema.safeParse({ ...MINIMO, roteiro }))).toContain(
      "campo que não pode ser mostrado no roteiro",
    )
  })

  it.each([
    ["texto", "true"],
    ["número", 1],
    ["nulo", null],
  ])("recusa valor não booleano (%s)", (_caso, valor) => {
    expect(erroDe(pedidoPostSchema.safeParse({ ...MINIMO, roteiro: { local: valor, descricao: false } }))).toContain(
      "use verdadeiro ou falso",
    )
  })

  it.each([
    ["lista", []],
    ["texto", "sim"],
    ["booleano", true],
  ])("recusa roteiro que não é objeto (%s)", (_caso, roteiro) => {
    expect(pedidoPostSchema.safeParse({ ...MINIMO, roteiro }).success).toBe(false)
  })
})

describe("pedidoPostSchema — lugares", () => {
  it("normaliza o id para minúsculas", () => {
    const id = "abcdef01-2345-4678-89ab-cdef01234567"
    expect(pedidoPostSchema.parse(comLugar("google", id.toUpperCase())).lugares).toEqual([{ id, endereco: "google" }])
  })

  it("limpa o endereço digitado", () => {
    expect(pedidoPostSchema.parse(comLugar({ texto: "  Rua A, 10 \n" })).lugares![0].endereco).toEqual({
      texto: "Rua A, 10",
    })
  })

  it(`aceita endereço digitado com ${MAXIMO_ENDERECO} caracteres e recusa com ${MAXIMO_ENDERECO + 1}`, () => {
    expect(pedidoPostSchema.safeParse(comLugar({ texto: "x".repeat(MAXIMO_ENDERECO) })).success).toBe(true)
    expect(erroDe(pedidoPostSchema.safeParse(comLugar({ texto: "x".repeat(MAXIMO_ENDERECO + 1) })))).toContain(
      `até ${MAXIMO_ENDERECO}`,
    )
  })

  it.each([
    ["vazio", ""],
    ["só espaços", "   "],
  ])("recusa endereço digitado %s", (_caso, texto) => {
    expect(erroDe(pedidoPostSchema.safeParse(comLugar({ texto })))).toContain("digite o endereço")
  })

  it.each([
    ["outro literal", "rua"],
    ["maiúsculas", "GOOGLE"],
    ["nulo", null],
    ["número", 1],
    ["objeto sem texto", {}],
    ["texto que não é string", { texto: 10 }],
  ])("recusa endereço inválido (%s)", (_caso, endereco) => {
    expect(pedidoPostSchema.safeParse(comLugar(endereco)).success).toBe(false)
  })

  it("explica o endereço fora das três opções", () => {
    expect(erroDe(enderecoSchema.safeParse("rua"))).toContain('use "nenhum", "google" ou { texto }')
  })

  it.each([
    ["no endereço digitado", comLugar({ texto: "Rua A", latitude: 1 }), "campo não permitido no endereço"],
    [
      "no lugar",
      { ...MINIMO, lugares: [{ id: uuid(1), endereco: "nenhum", notes: "senha" }] },
      "campo não permitido no lugar",
    ],
    [
      "no lugar (nome escrito pelo cliente)",
      { ...MINIMO, lugares: [{ id: uuid(1), endereco: "nenhum", name: "Inventado" }] },
      "campo não permitido no lugar",
    ],
  ])("recusa chave extra %s", (_caso, corpo, mensagem) => {
    expect(erroDe(pedidoPostSchema.safeParse(corpo))).toContain(mensagem)
  })

  it("recusa lugar sem endereço ou sem id", () => {
    expect(pedidoPostSchema.safeParse({ ...MINIMO, lugares: [{ id: uuid(1) }] }).success).toBe(false)
    expect(pedidoPostSchema.safeParse({ ...MINIMO, lugares: [{ endereco: "nenhum" }] }).success).toBe(false)
  })

  it.each([
    ["texto", "abc"],
    ["número", 42],
    ["uuid sem um caractere", "00000000-0000-4000-8000-00000000000"],
  ])("recusa id de lugar que não é uuid (%s)", (_caso, id) => {
    expect(erroDe(pedidoPostSchema.safeParse(comLugar("nenhum", id as string)))).toContain("lugar inválido")
  })

  it("recusa lugar repetido, também em maiúsculas, apontando a posição", () => {
    const r = pedidoPostSchema.safeParse({
      ...MINIMO,
      lugares: [
        { id: uuid(1), endereco: "nenhum" },
        { id: uuid(2), endereco: "nenhum" },
        { id: uuid(1).toUpperCase(), endereco: "google" },
      ],
    })
    expect(r.success).toBe(false)
    expect(r.error!.issues).toEqual([expect.objectContaining({ message: "lugar repetido", path: ["lugares", 2, "id"] })])
  })

  it(`aceita ${MAXIMO_LUGARES_NO_POST} lugares e recusa ${MAXIMO_LUGARES_NO_POST + 1}`, () => {
    const lugares = (n: number) => Array.from({ length: n }, (_, i) => ({ id: uuid(i), endereco: "nenhum" }))
    expect(pedidoPostSchema.safeParse({ ...MINIMO, lugares: lugares(MAXIMO_LUGARES_NO_POST) }).success).toBe(true)
    expect(erroDe(pedidoPostSchema.safeParse({ ...MINIMO, lugares: lugares(MAXIMO_LUGARES_NO_POST + 1) }))).toContain(
      `até ${MAXIMO_LUGARES_NO_POST} lugares`,
    )
  })

  it("recusa lugares ausente (desligar é mandar null) e lugares que não é lista", () => {
    expect(erroDe(pedidoPostSchema.safeParse({ roteiro: null }))).toContain("informe os lugares")
    expect(erroDe(pedidoPostSchema.safeParse({ ...MINIMO, lugares: { id: uuid(1) } }))).toContain("em uma lista")
  })
})

describe("pedidoPostSchema — marcados", () => {
  it("normaliza para minúsculas", () => {
    const id = "abcdef01-2345-4678-89ab-cdef01234567"
    expect(pedidoPostSchema.parse({ ...MINIMO, marcados: [id.toUpperCase()] }).marcados).toEqual([id])
  })

  it("recusa marcado repetido, também em maiúsculas", () => {
    const r = pedidoPostSchema.safeParse({ ...MINIMO, marcados: [uuid(1), uuid(1).toUpperCase()] })
    expect(r.success).toBe(false)
    expect(r.error!.issues).toEqual([
      expect.objectContaining({ message: "pessoa marcada repetida", path: ["marcados", 1] }),
    ])
  })

  it(`aceita ${MAXIMO_MARCADOS} e recusa ${MAXIMO_MARCADOS + 1}`, () => {
    const marcados = (n: number) => Array.from({ length: n }, (_, i) => uuid(i))
    expect(pedidoPostSchema.safeParse({ ...MINIMO, marcados: marcados(MAXIMO_MARCADOS) }).success).toBe(true)
    expect(erroDe(pedidoPostSchema.safeParse({ ...MINIMO, marcados: marcados(MAXIMO_MARCADOS + 1) }))).toContain(
      `até ${MAXIMO_MARCADOS}`,
    )
  })

  it.each([
    ["id que não é uuid", ["ana"]],
    ["objeto em vez de id", [{ id: uuid(1) }]],
    ["nulo", null],
    ["texto", uuid(1)],
  ])("recusa %s", (_caso, marcados) => {
    expect(pedidoPostSchema.safeParse({ ...MINIMO, marcados }).success).toBe(false)
  })
})

describe("pedidoPostSchema — chaves extras e corpo", () => {
  it.each([
    ["trip_id", { trip_id: uuid(1) }],
    ["author_id", { author_id: uuid(1) }],
    ["title", { title: "Outra viagem" }],
    ["notes", { notes: "senha do cofre" }],
    ["cover_path", { cover_path: "outra-pessoa/capa.jpg" }],
    ["caption (o nome da coluna)", { caption: "x" }],
    ["items já montados", { items: [{ title: "x", notes: "y" }] }],
    ["places já montados", { places: [{ name: "x" }] }],
    ["mostrar (contrato antigo)", { mostrar: {} }],
  ])("recusa chave extra na raiz (%s)", (_caso, extra) => {
    expect(erroDe(pedidoPostSchema.safeParse({ ...MINIMO, ...extra }))).toContain("campo não permitido")
  })

  it.each([
    ["nulo", null],
    ["indefinido", undefined],
    ["texto", '{"roteiro":null,"lugares":null}'],
    ["lista", []],
    ["número", 0],
  ])("recusa corpo %s", (_caso, corpo) => {
    expect(pedidoPostSchema.safeParse(corpo).success).toBe(false)
  })
})
