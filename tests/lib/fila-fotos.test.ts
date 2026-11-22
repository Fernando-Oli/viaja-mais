import { describe, it, expect, vi, beforeEach } from "vitest"
import { esvaziarFilaDeFotos, type ClienteDaFilaDeFotos } from "@/lib/social/fila-fotos"

/**
 * @RF09.17 @RF09.15 O esvaziamento da fila de fotos a remover
 * (lib/social/fila-fotos.ts): lê os mais antigos até o limite, apaga do bucket
 * capas-posts, tira da fila os que saíram e os que não existiam, e nunca lança.
 *
 * O dublê imita só o que a função usa: a fila (select → order → limit, e
 * delete → in) e o `remove` do Storage, que devolve os objetos que apagou.
 */

const AUTORA = "11111111-1111-4111-8111-111111111111"
const caminho = (n: number) => `${AUTORA}/00000000-0000-4000-8000-${String(n).padStart(12, "0")}.webp`

type Linha = { caminho: string; criado_em: number }

function dubleDaFila() {
  const estado = {
    fila: [] as Linha[],
    arquivos: new Set<string>(),
    remocoes: [] as { bucket: string; caminhos: string[] }[],
    tabelas: [] as string[],
    leituras: [] as { coluna: string; ordem: string; ascendente: boolean; limite: number }[],
    deletes: [] as string[][],
    falharLeitura: false,
    falharRemocao: false,
    falharDelete: false,
  }

  const cliente = {
    from(tabela: string) {
      estado.tabelas.push(tabela)
      return {
        select: (coluna: string) => ({
          order: (ordem: string, { ascending }: { ascending: boolean }) => ({
            limit: async (limite: number) => {
              estado.leituras.push({ coluna, ordem, ascendente: ascending, limite })
              if (estado.falharLeitura) return { data: null, error: { message: "fila fora do ar" } }
              const linhas = [...estado.fila].sort((a, b) => a.criado_em - b.criado_em).slice(0, limite)
              return { data: linhas.map((l) => ({ caminho: l.caminho })), error: null }
            },
          }),
        }),
        delete: () => ({
          in: async (coluna: string, valores: string[]) => {
            expect(coluna).toBe("caminho")
            estado.deletes.push([...valores])
            if (estado.falharDelete) return { error: { message: "fila fora do ar" } }
            estado.fila = estado.fila.filter((l) => !valores.includes(l.caminho))
            return { error: null }
          },
        }),
      }
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (caminhos: string[]) => {
          estado.remocoes.push({ bucket, caminhos: [...caminhos] })
          if (estado.falharRemocao) return { data: null, error: { message: "storage fora do ar" } }
          const existiam = caminhos.filter((c) => estado.arquivos.delete(c))
          return { data: existiam.map((name) => ({ name })), error: null }
        },
      }),
    },
  }

  return { estado, admin: cliente as unknown as ClienteDaFilaDeFotos }
}

let duble: ReturnType<typeof dubleDaFila>
let erros: ReturnType<typeof vi.spyOn>

function enfileirar(caminhos: string[], { existem = true } = {}) {
  for (const c of caminhos) {
    duble.estado.fila.push({ caminho: c, criado_em: duble.estado.fila.length })
    if (existem) duble.estado.arquivos.add(c)
  }
}

beforeEach(() => {
  duble = dubleDaFila()
  erros = vi.spyOn(console, "error").mockImplementation(() => {})
  return () => vi.restoreAllMocks()
})

describe("esvaziarFilaDeFotos", () => {
  it("apaga do bucket capas-posts e tira da fila os que saíram", async () => {
    enfileirar([caminho(1), caminho(2)])

    expect(await esvaziarFilaDeFotos(duble.admin)).toBe(2)

    expect(duble.estado.remocoes).toEqual([{ bucket: "capas-posts", caminhos: [caminho(1), caminho(2)] }])
    expect(duble.estado.arquivos.size).toBe(0)
    expect(duble.estado.fila).toEqual([])
    // Só a tabela da fila, nunca outra, com a chave de serviço.
    expect(new Set(duble.estado.tabelas)).toEqual(new Set(["fotos_a_remover"]))
    expect(erros).not.toHaveBeenCalled()
  })

  it("tira da fila também os que o Storage diz que não existem", async () => {
    enfileirar([caminho(1)])
    enfileirar([caminho(2)], { existem: false })

    expect(await esvaziarFilaDeFotos(duble.admin)).toBe(2)
    expect(duble.estado.fila).toEqual([])
  })

  it("fila vazia: não vai ao Storage nem apaga nada", async () => {
    expect(await esvaziarFilaDeFotos(duble.admin)).toBe(0)
    expect(duble.estado.remocoes).toEqual([])
    expect(duble.estado.deletes).toEqual([])
  })

  it("respeita o limite: lê só os mais antigos, e o resto fica para a próxima", async () => {
    enfileirar([caminho(1), caminho(2), caminho(3), caminho(4), caminho(5)])

    expect(await esvaziarFilaDeFotos(duble.admin, 2)).toBe(2)
    expect(duble.estado.leituras).toEqual([{ coluna: "caminho", ordem: "criado_em", ascendente: true, limite: 2 }])
    expect(duble.estado.remocoes[0].caminhos).toEqual([caminho(1), caminho(2)])
    expect(duble.estado.fila.map((l) => l.caminho)).toEqual([caminho(3), caminho(4), caminho(5)])

    expect(await esvaziarFilaDeFotos(duble.admin, 2)).toBe(2)
    expect(duble.estado.fila.map((l) => l.caminho)).toEqual([caminho(5)])
  })

  it("o limite padrão é 50, o teto é 1000 (o máximo do remove), e limite menor que 1 não faz nada", async () => {
    await esvaziarFilaDeFotos(duble.admin)
    await esvaziarFilaDeFotos(duble.admin, 5000)
    expect(duble.estado.leituras.map((l) => l.limite)).toEqual([50, 1000])

    for (const limite of [0, -3, Number.NaN]) expect(await esvaziarFilaDeFotos(duble.admin, limite)).toBe(0)
    expect(duble.estado.leituras).toHaveLength(2)
  })

  it("apaga da fila em lotes de 50 (os caminhos vão na URL)", async () => {
    enfileirar(Array.from({ length: 120 }, (_, i) => caminho(i + 1)))

    expect(await esvaziarFilaDeFotos(duble.admin, 120)).toBe(120)
    expect(duble.estado.remocoes).toHaveLength(1)
    expect(duble.estado.deletes.map((lote) => lote.length)).toEqual([50, 50, 20])
    expect(duble.estado.fila).toEqual([])
  })

  it("tolera erro do Storage: não lança, loga, e nada sai da fila", async () => {
    enfileirar([caminho(1), caminho(2)])
    duble.estado.falharRemocao = true

    expect(await esvaziarFilaDeFotos(duble.admin)).toBe(0)
    expect(duble.estado.fila).toHaveLength(2)
    expect(duble.estado.deletes).toEqual([])
    expect(erros).toHaveBeenCalled()
  })

  it("tolera erro ao ler a fila: não lança, loga, e não vai ao Storage", async () => {
    enfileirar([caminho(1)])
    duble.estado.falharLeitura = true

    expect(await esvaziarFilaDeFotos(duble.admin)).toBe(0)
    expect(duble.estado.remocoes).toEqual([])
    expect(erros).toHaveBeenCalled()
  })

  it("tolera erro ao tirar da fila: não lança, loga, e o caminho fica para a próxima", async () => {
    enfileirar([caminho(1)])
    duble.estado.falharDelete = true

    expect(await esvaziarFilaDeFotos(duble.admin)).toBe(0)
    expect(duble.estado.arquivos.size).toBe(0)
    expect(duble.estado.fila).toHaveLength(1)
    expect(erros).toHaveBeenCalled()

    // Na próxima, o arquivo já não existe: sai da fila como inexistente.
    duble.estado.falharDelete = false
    expect(await esvaziarFilaDeFotos(duble.admin)).toBe(1)
    expect(duble.estado.fila).toEqual([])
  })

  it("tolera exceção lançada pelo cliente, não só o `error` devolvido", async () => {
    enfileirar([caminho(1)])
    const quebrado = {
      ...duble.admin,
      from: () => {
        throw new Error("rede caiu")
      },
    } as unknown as ClienteDaFilaDeFotos

    await expect(esvaziarFilaDeFotos(quebrado)).resolves.toBe(0)
    expect(erros).toHaveBeenCalled()
  })

  it("caminho fora do formato sai da fila sem ir ao Storage, com log", async () => {
    const estranhos = ["../outro-bucket/x.webp", `${AUTORA}/sub/pasta.webp`, "https://evil.example/x.webp"]
    enfileirar(estranhos, { existem: false })
    enfileirar([caminho(1)])

    expect(await esvaziarFilaDeFotos(duble.admin)).toBe(4)
    expect(duble.estado.remocoes).toEqual([{ bucket: "capas-posts", caminhos: [caminho(1)] }])
    expect(duble.estado.fila).toEqual([])
    expect(erros).toHaveBeenCalledWith(expect.stringContaining("fora do formato"), estranhos)
  })
})
