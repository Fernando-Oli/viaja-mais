/**
 * @RF09.7 o post é uma cópia da projeção pública: só os itens e os campos escolhidos, nunca notas,
 * coordenadas, status, preço nem o id do item; e as escritas usam só as colunas do grant, sem trip_id
 */
import { describe, it, expect } from "vitest"
import type { ItemPublico, ViagemPublica } from "@/lib/trips/publico"
import type { CamposVisiveis } from "@/lib/schemas/post"
import { ErroHttp } from "@/lib/http"
import {
  atualizar,
  definirCapa,
  despublicar,
  montarPost,
  postDaViagem,
  publicar,
  type CopiaDoPost,
} from "@/lib/social/posts"

// ---------------------------------------------------------------------------
// montarPost
// ---------------------------------------------------------------------------

const ITEM_1 = "aaaaaaaa-1111-4111-8111-111111111111"
const ITEM_2 = "bbbbbbbb-2222-4222-8222-222222222222"
const ITEM_3 = "cccccccc-3333-4333-8333-333333333333"

const DESLIGADOS: CamposVisiveis = { local: false, descricao: false, horario: false, categoria: false }
const LIGADOS: CamposVisiveis = { local: true, descricao: true, horario: true, categoria: true }

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

function projecao(itens: ItemPublico[] = [pousada, trilha, jantar]): ViagemPublica {
  return {
    title: "Chapada",
    destination: "Alto Paraíso",
    start_date: "2026-12-01",
    end_date: "2026-12-05",
    itens,
  }
}

const CHAVES_PERMITIDAS = ["title", "date", "start_time", "end_time", "category", "location", "description"]

describe("montarPost — os campos de cada item", () => {
  it("com todos os opcionais desligados, cada item tem só o título", () => {
    const post = montarPost(projecao(), [ITEM_1, ITEM_2, ITEM_3], DESLIGADOS)
    expect(post.items).toEqual([{ title: "Pousada" }, { title: "Trilha" }, { title: "Jantar" }])
    for (const item of post.items) expect(Object.keys(item)).toEqual(["title"])
  })

  it("copia título, destino e datas da projeção, e nada mais da viagem", () => {
    const post = montarPost(projecao(), [], DESLIGADOS)
    expect(Object.keys(post).sort()).toEqual(["destination", "end_date", "items", "start_date", "title"])
    expect(post).toMatchObject({
      title: "Chapada",
      destination: "Alto Paraíso",
      start_date: "2026-12-01",
      end_date: "2026-12-05",
    })
  })

  it.each([
    ["local", { location: "Vale da Lua" }],
    ["descricao", { description: "Levar água" }],
    ["categoria", { category: "activity" }],
    ["horario", { date: "2026-12-02", start_time: "08:00", end_time: "12:00" }],
  ] as const)("só %s ligado: aparece, e os desligados não aparecem nem como null", (grupo, esperado) => {
    const mostrar = { ...DESLIGADOS, [grupo]: true }
    const [item] = montarPost(projecao([trilha]), [ITEM_1], mostrar).items
    expect(item).toStrictEqual({ title: "Trilha", ...esperado })
  })

  it("com tudo ligado, traz as sete chaves", () => {
    const [item] = montarPost(projecao([trilha]), [ITEM_1], LIGADOS).items
    expect(item).toStrictEqual({
      title: "Trilha",
      date: "2026-12-02",
      start_time: "08:00",
      end_time: "12:00",
      category: "activity",
      location: "Vale da Lua",
      description: "Levar água",
    })
  })

  it("horario traz data e horários juntos, e omite os horários nulos", () => {
    const post = montarPost(projecao(), [ITEM_2, ITEM_3], { ...DESLIGADOS, horario: true })
    expect(post.items).toStrictEqual([
      { title: "Pousada", date: "2026-12-01" },
      { title: "Jantar", date: "2026-12-03", start_time: "20:00" },
    ])
  })

  it("campo ligado mas nulo é omitido, não vira null", () => {
    const [item] = montarPost(projecao([pousada]), [ITEM_2], LIGADOS).items
    expect(item).toStrictEqual({ title: "Pousada", date: "2026-12-01", category: "accommodation" })
    expect(Object.values(item)).not.toContain(null)
  })

  it("valor vazio ou só com espaços é omitido; o que tem texto sai como veio", () => {
    const vazios: ItemPublico = { ...trilha, location: "   ", description: "", category: "\t" }
    const [item] = montarPost(projecao([vazios]), [ITEM_1], LIGADOS).items
    expect(item).toStrictEqual({ title: "Trilha", date: "2026-12-02", start_time: "08:00", end_time: "12:00" })

    const comEspacos: ItemPublico = { ...trilha, location: "  Vale da Lua " }
    expect(montarPost(projecao([comEspacos]), [ITEM_1], LIGADOS).items[0].location).toBe("  Vale da Lua ")
  })

  it("notes, coordenadas, status, id e preço da projeção nunca saem, mesmo com tudo ligado", () => {
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
    const post = montarPost({ ...projecao([vazado]), budget: 3000 } as ViagemPublica, [ITEM_1], LIGADOS)

    const [item] = post.items
    for (const chave of Object.keys(item)) expect(CHAVES_PERMITIDAS).toContain(chave)
    expect(item).not.toHaveProperty("notes")
    expect(item).not.toHaveProperty("latitude")
    expect(item).not.toHaveProperty("longitude")
    expect(item).not.toHaveProperty("status")
    expect(item).not.toHaveProperty("id")
    expect(item).not.toHaveProperty("price")
    expect(post).not.toHaveProperty("budget")
    expect(JSON.stringify(post)).not.toContain("senha do wifi")
  })
})

describe("montarPost — quais itens e em que ordem", () => {
  it("id escolhido que não está na projeção (cancelado, de outra viagem, inventado) é ignorado", () => {
    const inventado = "eeeeeeee-5555-4555-8555-555555555555"
    const post = montarPost(projecao([trilha]), [inventado, ITEM_1, ITEM_3], DESLIGADOS)
    expect(post.items).toEqual([{ title: "Trilha" }])
  })

  it("só os escolhidos entram", () => {
    const post = montarPost(projecao(), [ITEM_3], DESLIGADOS)
    expect(post.items).toEqual([{ title: "Jantar" }])
  })

  it("a ordem é a da projeção, não a dos ids escolhidos", () => {
    const post = montarPost(projecao(), [ITEM_3, ITEM_1, ITEM_2], DESLIGADOS)
    expect(post.items.map((i) => i.title)).toEqual(["Pousada", "Trilha", "Jantar"])
  })

  it("compara ids sem diferenciar maiúsculas, dos dois lados", () => {
    const maiusculo: ItemPublico = { ...trilha, id: ITEM_1.toUpperCase() }
    expect(montarPost(projecao([maiusculo]), [ITEM_1], DESLIGADOS).items).toEqual([{ title: "Trilha" }])
    expect(montarPost(projecao([trilha]), [ITEM_1.toUpperCase()], DESLIGADOS).items).toEqual([{ title: "Trilha" }])
  })

  it("lista vazia publica a viagem sem itinerário", () => {
    expect(montarPost(projecao(), [], LIGADOS).items).toEqual([])
  })

  it("é pura: não altera a projeção nem a lista recebidas", () => {
    const original = projecao()
    const copiaDaOriginal = structuredClone(original)
    const escolhidos = [ITEM_3, ITEM_1]
    montarPost(original, escolhidos, LIGADOS)
    expect(original).toEqual(copiaDaOriginal)
    expect(escolhidos).toEqual([ITEM_3, ITEM_1])
  })
})

// ---------------------------------------------------------------------------
// Funções de banco, com um cliente dublado
// ---------------------------------------------------------------------------

type Resposta = { data: unknown; error: { code?: string; message?: string } | null }
type Chamada = [metodo: string, ...args: unknown[]]

/**
 * Cliente falso: cada `from(tabela)` consome a próxima resposta da fila e
 * registra o encadeamento inteiro (`select`, `insert`, `update`, `delete`,
 * `eq`, `is`) até o terminal (`single` ou `maybeSingle`). `rpc` registra o nome
 * e os argumentos e responde com `rpc`.
 */
function clienteFalso({ rpc, respostas = [] }: { rpc?: Resposta; respostas?: Resposta[] }) {
  const consultas: { tabela: string; chamadas: Chamada[] }[] = []
  const rpcs: [string, unknown][] = []
  const fila = [...respostas]

  const from = (tabela: string) => {
    const consulta = { tabela, chamadas: [] as Chamada[] }
    consultas.push(consulta)
    const resposta = fila.shift() ?? { data: null, error: null }
    const encadeia =
      (metodo: string) =>
      (...args: unknown[]) => {
        consulta.chamadas.push([metodo, ...args])
        return construtor
      }
    const termina =
      (metodo: string) =>
      () => {
        consulta.chamadas.push([metodo])
        return Promise.resolve(resposta)
      }
    const construtor = {
      select: encadeia("select"),
      insert: encadeia("insert"),
      update: encadeia("update"),
      delete: encadeia("delete"),
      eq: encadeia("eq"),
      is: encadeia("is"),
      single: termina("single"),
      maybeSingle: termina("maybeSingle"),
    }
    return construtor
  }

  const cliente = {
    from,
    rpc: (nome: string, args: unknown) => {
      rpcs.push([nome, args])
      return Promise.resolve(rpc ?? { data: null, error: null })
    },
  }
  return { cliente: cliente as unknown as Parameters<typeof postDaViagem>[0], consultas, rpcs }
}

const VIAGEM = "99999999-9999-4999-8999-999999999999"
const AUTOR = "11111111-1111-4111-8111-111111111111"
const POST = "77777777-7777-4777-8777-777777777777"
const CAPA_VELHA = `${AUTOR}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`
const CAPA_NOVA = `${AUTOR}/1c7a3d5f-6e8b-4b9f-8c2d-3a4f5e6b7c8d.png`

const COLUNAS_ESPERADAS = "id, title, destination, start_date, end_date, items, cover_path, created_at, updated_at"

const COPIA: CopiaDoPost = {
  title: "Chapada",
  destination: "Alto Paraíso",
  start_date: "2026-12-01",
  end_date: "2026-12-05",
  items: [{ title: "Trilha", location: "Vale da Lua" }],
}

/** Linha "do banco", com `trip_id` e `author_id` de propósito: não podem chegar à rota. */
const LINHA = {
  id: POST,
  trip_id: VIAGEM,
  author_id: AUTOR,
  title: "Chapada",
  destination: "Alto Paraíso",
  start_date: "2026-12-01",
  end_date: "2026-12-05",
  items: [{ title: "Trilha", location: "Vale da Lua" }],
  cover_path: null,
  created_at: "2026-11-16T10:00:00Z",
  updated_at: "2026-11-16T10:00:00Z",
}

const CHAVES_DO_POST = [
  "cover_path",
  "created_at",
  "destination",
  "end_date",
  "id",
  "items",
  "start_date",
  "title",
  "updated_at",
]

const ERRO_CRU = { code: "XX000", message: 'relation "trip_posts" column trip_id secret detail' }

/** O erro lançado não pode carregar a mensagem do Postgres. */
async function lancaSemMensagemCrua(promessa: Promise<unknown>) {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  )
  expect(erro).toBeInstanceOf(Error)
  expect(erro).not.toBeInstanceOf(ErroHttp)
  expect((erro as Error).message).not.toContain("trip_id")
  expect((erro as Error).message).not.toContain("secret")
  expect((erro as Error).cause).toBe(ERRO_CRU)
}

async function lancaHttp(promessa: Promise<unknown>, status: number) {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  )
  expect(erro).toBeInstanceOf(ErroHttp)
  expect((erro as ErroHttp).status).toBe(status)
  return erro as ErroHttp
}

describe("postDaViagem", () => {
  it("acha o id pela função do banco e lê as colunas listadas, sem trip_id nem author_id", async () => {
    const { cliente, consultas, rpcs } = clienteFalso({
      rpc: { data: POST, error: null },
      respostas: [{ data: LINHA, error: null }],
    })

    const post = await postDaViagem(cliente, VIAGEM)

    expect(rpcs).toEqual([["social_meu_post_da_viagem", { viagem: VIAGEM }]])
    expect(consultas).toEqual([
      {
        tabela: "trip_posts",
        chamadas: [["select", COLUNAS_ESPERADAS], ["eq", "id", POST], ["maybeSingle"]],
      },
    ])
    expect(COLUNAS_ESPERADAS).not.toMatch(/trip_id|author_id|\*/)
    expect(Object.keys(post!).sort()).toEqual(CHAVES_DO_POST)
    expect(post).toMatchObject({ id: POST, title: "Chapada", items: [{ title: "Trilha", location: "Vale da Lua" }] })
  })

  it("sem post da sessão nessa viagem, devolve null e não consulta a tabela", async () => {
    const { cliente, consultas } = clienteFalso({ rpc: { data: null, error: null } })
    expect(await postDaViagem(cliente, VIAGEM)).toBeNull()
    expect(consultas).toEqual([])
  })

  it("post apagado entre a função e o select: null", async () => {
    const { cliente } = clienteFalso({ rpc: { data: POST, error: null }, respostas: [{ data: null, error: null }] })
    expect(await postDaViagem(cliente, VIAGEM)).toBeNull()
  })

  it("erro da função ou do select lança sem a mensagem crua", async () => {
    await lancaSemMensagemCrua(postDaViagem(clienteFalso({ rpc: { data: null, error: ERRO_CRU } }).cliente, VIAGEM))
    await lancaSemMensagemCrua(
      postDaViagem(
        clienteFalso({ rpc: { data: POST, error: null }, respostas: [{ data: null, error: ERRO_CRU }] }).cliente,
        VIAGEM,
      ),
    )
  })

  it("o items gravado volta pela mesma lista branca: chave estranha e item malformado não chegam à rota", async () => {
    const gravado = {
      ...LINHA,
      items: [
        { title: "Trilha", notes: "senha", latitude: -14, date: "2026-12-02", location: "" },
        "não é objeto",
        null,
        { location: "sem título" },
      ],
    }
    const { cliente } = clienteFalso({ rpc: { data: POST, error: null }, respostas: [{ data: gravado, error: null }] })
    const post = await postDaViagem(cliente, VIAGEM)
    expect(post!.items).toStrictEqual([{ title: "Trilha", date: "2026-12-02" }])
  })

  it("items que não é lista vira lista vazia", async () => {
    const { cliente } = clienteFalso({
      rpc: { data: POST, error: null },
      respostas: [{ data: { ...LINHA, items: { title: "x" } }, error: null }],
    })
    expect((await postDaViagem(cliente, VIAGEM))!.items).toEqual([])
  })
})

describe("publicar", () => {
  it("insere só as colunas do grant, campo a campo, sem cover_path, e devolve sem trip_id nem author_id", async () => {
    const { cliente, consultas } = clienteFalso({ respostas: [{ data: LINHA, error: null }] })
    // Chaves a mais na cópia (em runtime) não podem chegar ao INSERT.
    const copiaSuja = { ...COPIA, cover_path: CAPA_NOVA, notes: "x", id: POST } as CopiaDoPost

    const post = await publicar(cliente, { tripId: VIAGEM, autorId: AUTOR, copia: copiaSuja })

    expect(consultas).toHaveLength(1)
    const [{ tabela, chamadas }] = consultas
    expect(tabela).toBe("trip_posts")
    expect(chamadas).toEqual([
      [
        "insert",
        {
          trip_id: VIAGEM,
          author_id: AUTOR,
          title: "Chapada",
          destination: "Alto Paraíso",
          start_date: "2026-12-01",
          end_date: "2026-12-05",
          items: [{ title: "Trilha", location: "Vale da Lua" }],
        },
      ],
      ["select", COLUNAS_ESPERADAS],
      ["single"],
    ])
    expect(Object.keys(post).sort()).toEqual(CHAVES_DO_POST)
  })

  it("23505 (a sessão já publicou esta viagem) vira 409", async () => {
    const { cliente } = clienteFalso({ respostas: [{ data: null, error: { code: "23505", message: "duplicate key" } }] })
    const erro = await lancaHttp(publicar(cliente, { tripId: VIAGEM, autorId: AUTOR, copia: COPIA }), 409)
    expect(erro.message).toBe("Você já publicou esta viagem")
  })

  it("42501 (policy: não-membro ou sem username) vira 403 sem a mensagem do banco", async () => {
    const { cliente } = clienteFalso({
      respostas: [{ data: null, error: { code: "42501", message: "new row violates row-level security policy" } }],
    })
    const erro = await lancaHttp(publicar(cliente, { tripId: VIAGEM, autorId: AUTOR, copia: COPIA }), 403)
    expect(erro.message).not.toContain("row-level")
  })

  it("outro erro lança sem a mensagem crua", async () => {
    const { cliente } = clienteFalso({ respostas: [{ data: null, error: ERRO_CRU }] })
    await lancaSemMensagemCrua(publicar(cliente, { tripId: VIAGEM, autorId: AUTOR, copia: COPIA }))
  })
})

describe("atualizar", () => {
  it("atualiza só o conteúdo, pelo id, e devolve o post", async () => {
    const { cliente, consultas } = clienteFalso({ respostas: [{ data: LINHA, error: null }] })
    const copiaSuja = { ...COPIA, trip_id: "outra", author_id: "outro", cover_path: CAPA_NOVA } as CopiaDoPost

    const post = await atualizar(cliente, POST, copiaSuja)

    expect(consultas[0].chamadas).toEqual([
      [
        "update",
        {
          title: "Chapada",
          destination: "Alto Paraíso",
          start_date: "2026-12-01",
          end_date: "2026-12-05",
          items: [{ title: "Trilha", location: "Vale da Lua" }],
        },
      ],
      ["eq", "id", POST],
      ["select", COLUNAS_ESPERADAS],
      ["maybeSingle"],
    ])
    expect(Object.keys(post!).sort()).toEqual(CHAVES_DO_POST)
  })

  it("0 linhas (post inexistente ou de outra pessoa) devolve null", async () => {
    const { cliente } = clienteFalso({ respostas: [{ data: null, error: null }] })
    expect(await atualizar(cliente, POST, COPIA)).toBeNull()
  })

  it("autor que saiu da viagem esbarra na policy (42501) e recebe 403", async () => {
    const { cliente } = clienteFalso({ respostas: [{ data: null, error: { code: "42501" } }] })
    await lancaHttp(atualizar(cliente, POST, COPIA), 403)
  })

  it("outro erro lança sem a mensagem crua", async () => {
    const { cliente } = clienteFalso({ respostas: [{ data: null, error: ERRO_CRU }] })
    await lancaSemMensagemCrua(atualizar(cliente, POST, COPIA))
  })
})

describe("definirCapa", () => {
  it("lê a capa atual, troca só cover_path se ela ainda for a lida, e devolve a anterior", async () => {
    const { cliente, consultas } = clienteFalso({
      respostas: [
        { data: { cover_path: CAPA_VELHA }, error: null },
        { data: { id: POST }, error: null },
      ],
    })

    expect(await definirCapa(cliente, POST, CAPA_NOVA)).toEqual({ capaAnterior: CAPA_VELHA })
    expect(consultas.map((c) => c.chamadas)).toEqual([
      [["select", "cover_path"], ["eq", "id", POST], ["maybeSingle"]],
      [["update", { cover_path: CAPA_NOVA }], ["eq", "id", POST], ["eq", "cover_path", CAPA_VELHA], ["select", "id"], ["maybeSingle"]],
    ])
  })

  it("sem capa antes, condiciona com is null; tirar a capa grava null", async () => {
    const { cliente, consultas } = clienteFalso({
      respostas: [
        { data: { cover_path: null }, error: null },
        { data: { id: POST }, error: null },
      ],
    })
    expect(await definirCapa(cliente, POST, null)).toEqual({ capaAnterior: null })
    expect(consultas[1].chamadas).toEqual([
      ["update", { cover_path: null }],
      ["eq", "id", POST],
      ["is", "cover_path", null],
      ["select", "id"],
      ["maybeSingle"],
    ])
  })

  it("post inexistente ou de outra pessoa: null, sem tentar atualizar", async () => {
    const { cliente, consultas } = clienteFalso({ respostas: [{ data: null, error: null }] })
    expect(await definirCapa(cliente, POST, CAPA_NOVA)).toBeNull()
    expect(consultas).toHaveLength(1)
  })

  it("a capa mudou entre a leitura e a troca (outra aba): 409", async () => {
    const { cliente } = clienteFalso({
      respostas: [
        { data: { cover_path: CAPA_VELHA }, error: null },
        { data: null, error: null },
      ],
    })
    await lancaHttp(definirCapa(cliente, POST, CAPA_NOVA), 409)
  })

  it("autor que saiu da viagem (42501) recebe 403; outro erro sai sem a mensagem crua", async () => {
    await lancaHttp(
      definirCapa(
        clienteFalso({
          respostas: [
            { data: { cover_path: null }, error: null },
            { data: null, error: { code: "42501" } },
          ],
        }).cliente,
        POST,
        CAPA_NOVA,
      ),
      403,
    )
    await lancaSemMensagemCrua(
      definirCapa(clienteFalso({ respostas: [{ data: null, error: ERRO_CRU }] }).cliente, POST, CAPA_NOVA),
    )
  })
})

describe("despublicar", () => {
  it("apaga pelo id e devolve a capa que o post tinha", async () => {
    const { cliente, consultas } = clienteFalso({ respostas: [{ data: { cover_path: CAPA_VELHA }, error: null }] })
    expect(await despublicar(cliente, POST)).toEqual({ capaAnterior: CAPA_VELHA })
    expect(consultas).toEqual([
      {
        tabela: "trip_posts",
        chamadas: [["delete"], ["eq", "id", POST], ["select", "cover_path"], ["maybeSingle"]],
      },
    ])
  })

  it("post sem capa: apagado, com capaAnterior null", async () => {
    const { cliente } = clienteFalso({ respostas: [{ data: { cover_path: null }, error: null }] })
    expect(await despublicar(cliente, POST)).toEqual({ capaAnterior: null })
  })

  it("nada apagado (post inexistente ou de outra pessoa): null", async () => {
    const { cliente } = clienteFalso({ respostas: [{ data: null, error: null }] })
    expect(await despublicar(cliente, POST)).toBeNull()
  })

  it("erro lança sem a mensagem crua", async () => {
    const { cliente } = clienteFalso({ respostas: [{ data: null, error: ERRO_CRU }] })
    await lancaSemMensagemCrua(despublicar(cliente, POST))
  })
})
