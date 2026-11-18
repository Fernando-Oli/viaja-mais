import { describe, it, expect } from "vitest"
import {
  MAXIMO_ENDERECO,
  MAXIMO_LEGENDA,
  MAXIMO_LUGARES_NO_POST,
  MAXIMO_MARCADOS,
  MAXIMO_TITULO,
  caracteres,
  enderecoSchema,
  limparTextoLivre,
  pedidoPostSchema,
} from "@/lib/schemas/post"

/**
 * O corpo de POST e PATCH /api/social/viagens/[tripId]/post (contrato de
 * 18/11): título, legenda, roteiro, lugares e marcados. Todo objeto é estrito;
 * uuid vai para minúsculas, e repetido é 400.
 *
 * @RF09.7 título, legenda, roteiro e lugares · @RF09.13 marcados
 */

const erroDe = (resultado: { success: boolean; error?: { issues: { message: string }[] } }) =>
  resultado.success ? null : resultado.error!.issues.map((i) => i.message).join("; ")

/** uuid válido e distinto para cada índice. */
const uuid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`

const MINIMO = { roteiro: null, lugares: null }
const comLugar = (endereco: unknown, id = uuid(1)) => ({ ...MINIMO, lugares: [{ id, endereco }] })

describe("pedidoPostSchema — o mínimo", () => {
  it("roteiro e lugares desligados, sem título, legenda nem marcados: título e legenda null e marcados []", () => {
    expect(pedidoPostSchema.parse(MINIMO)).toEqual({
      titulo: null,
      legenda: null,
      roteiro: null,
      lugares: null,
      marcados: [],
    })
  })

  it("aceita tudo ligado", () => {
    const corpo = {
      titulo: "Réveillon em Lisboa",
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

describe("pedidoPostSchema — título", () => {
  it.each([
    ["ausente", undefined],
    ["null", null],
    ["vazio", ""],
    ["só espaços", "   \n\t "],
  ])("%s vira null (o post usa o título da viagem)", (_caso, titulo) => {
    expect(pedidoPostSchema.parse({ ...MINIMO, titulo }).titulo).toBeNull()
  })

  it("tira os espaços das pontas", () => {
    expect(pedidoPostSchema.parse({ ...MINIMO, titulo: "  Fim de ano  " }).titulo).toBe("Fim de ano")
  })

  it(`aceita exatamente ${MAXIMO_TITULO} caracteres, e o teto vale depois do trim`, () => {
    const cheio = "t".repeat(MAXIMO_TITULO)
    expect(pedidoPostSchema.parse({ ...MINIMO, titulo: `  ${cheio}  ` }).titulo).toBe(cheio)
  })

  it(`recusa ${MAXIMO_TITULO + 1} caracteres`, () => {
    expect(MAXIMO_TITULO).toBe(120)
    expect(erroDe(pedidoPostSchema.safeParse({ ...MINIMO, titulo: "t".repeat(MAXIMO_TITULO + 1) }))).toContain(
      `o título pode ter até ${MAXIMO_TITULO}`,
    )
  })

  it("conta caracteres como o char_length do banco: 120 emojis cabem, 121 não", () => {
    const emojis = "🌍".repeat(MAXIMO_TITULO)
    expect(pedidoPostSchema.parse({ ...MINIMO, titulo: emojis }).titulo).toBe(emojis)
    expect(pedidoPostSchema.safeParse({ ...MINIMO, titulo: emojis + "🌍" }).success).toBe(false)
  })

  it.each([
    ["número", 42],
    ["objeto", { texto: "x" }],
    ["booleano", true],
  ])("recusa título que não é texto (%s)", (_caso, titulo) => {
    expect(erroDe(pedidoPostSchema.safeParse({ ...MINIMO, titulo }))).toContain("o título deve ser texto")
  })

  it("`title` continua chave proibida: o título entra só como `titulo`", () => {
    expect(pedidoPostSchema.safeParse({ ...MINIMO, title: "x" }).success).toBe(false)
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

/** Os invisíveis da revisão de segurança de 18/11 (R3). */
const ZWSP = "​"
const BOM = "﻿"
const WJ = "⁠"

describe("título e legenda só com caracteres invisíveis (R3) — @RF09.7", () => {
  it.each([
    ["U+200B", ZWSP],
    ["U+FEFF", BOM],
    ["U+2060", WJ],
    ["os três, repetidos", `${ZWSP}${BOM}${WJ}`.repeat(10)],
    ["invisíveis misturados com espaços", ` ${ZWSP} \n${WJ}\t${BOM} `],
    ["marcas de direção (U+200E, U+200F)", "‎‏"],
  ])("%s: título vira null (vale o da viagem) e legenda vira null", (_caso, texto) => {
    const corpo = pedidoPostSchema.parse({ ...MINIMO, titulo: texto, legenda: texto })
    expect(corpo.titulo).toBeNull()
    expect(corpo.legenda).toBeNull()
  })

  it.each([
    ["só marcas combinantes (U+0301, U+034F)", "́͏"],
    ["só seletor de variação (U+FE0F)", "️️"],
    ["só caractere de controle (U+0007)", "\u0007"],
    ["invisíveis cercando uma marca combinante", `${ZWSP}́${WJ}`],
  ])("%s: nada visível sobra depois das pontas, então vale como vazio", (_caso, texto) => {
    const corpo = pedidoPostSchema.parse({ ...MINIMO, titulo: texto, legenda: texto })
    expect(corpo.titulo).toBeNull()
    expect(corpo.legenda).toBeNull()
  })

  it("os invisíveis saem das pontas; os do meio ficam", () => {
    const corpo = pedidoPostSchema.parse({ ...MINIMO, titulo: `${ZWSP}${BOM} Lisboa ${WJ}`, legenda: `${WJ}a${ZWSP}b${BOM}` })
    expect(corpo.titulo).toBe("Lisboa")
    expect(corpo.legenda).toBe(`a${ZWSP}b`)
  })

  it.each([
    ["letra", "a"],
    ["número", "7"],
    ["pontuação", "!"],
    ["símbolo (emoji)", "🌄"],
  ])("um único caractere visível (%s) basta", (_caso, visivel) => {
    expect(pedidoPostSchema.parse({ ...MINIMO, titulo: `${ZWSP}${visivel}${ZWSP}` }).titulo).toBe(visivel)
  })

  it("emoji com ZWJ no meio e bandeira com tags no fim não perdem nada", () => {
    const familia = "👨‍👩‍👧"
    const inglaterra = "🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}"
    expect(pedidoPostSchema.parse({ ...MINIMO, legenda: `Fomos ${familia}` }).legenda).toBe(`Fomos ${familia}`)
    expect(pedidoPostSchema.parse({ ...MINIMO, legenda: `Fomos à ${inglaterra}` }).legenda).toBe(`Fomos à ${inglaterra}`)
  })

  it("o teto conta depois de limpar as pontas: 120 visíveis cercados de invisíveis cabem", () => {
    const cheio = "t".repeat(MAXIMO_TITULO)
    expect(pedidoPostSchema.parse({ ...MINIMO, titulo: `${ZWSP.repeat(50)}${cheio}${BOM.repeat(50)}` }).titulo).toBe(cheio)
  })

  it("só invisíveis acima do teto não é erro de tamanho: é vazio", () => {
    expect(pedidoPostSchema.parse({ ...MINIMO, legenda: ZWSP.repeat(MAXIMO_LEGENDA + 50) }).legenda).toBeNull()
  })

  it("texto enorme de espaços com uma letra no fim é limpo em tempo linear", () => {
    const enorme = " ".repeat(200_000) + "a" + " ".repeat(200_000) + "b"
    const inicio = Date.now()
    expect(pedidoPostSchema.safeParse({ ...MINIMO, legenda: enorme }).success).toBe(false)
    expect(Date.now() - inicio).toBeLessThan(1000)
  })

  it("limparTextoLivre devolve o texto limpo ou null", () => {
    expect(limparTextoLivre(`${ZWSP} oi ${WJ}`)).toBe("oi")
    expect(limparTextoLivre(`${ZWSP}${BOM}${WJ}`)).toBeNull()
    expect(limparTextoLivre("")).toBeNull()
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
