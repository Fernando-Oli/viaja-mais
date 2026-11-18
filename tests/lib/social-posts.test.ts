/**
 * @RF09.7 o post é uma cópia da projeção pública: legenda limpa, o roteiro inteiro com local e descrição
 * só se ligados, os lugares escolhidos com o endereço escolhido, e nunca notas, coordenadas, status, preço
 * nem ids; as escritas usam só as colunas do grant, sem trip_id
 */
import { describe, it, expect } from "vitest"
import type { ItemPublico } from "@/lib/trips/publico"
import type { PedidoPost } from "@/lib/schemas/post"
import { ErroHttp } from "@/lib/http"
import {
  atualizar,
  definirCapa,
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

const COLUNAS_ESPERADAS =
  "id, title, destination, start_date, end_date, caption, items, places, cover_path, created_at, updated_at"

const COPIA: CopiaDoPost = {
  title: "Chapada",
  destination: "Alto Paraíso",
  start_date: "2026-12-01",
  end_date: "2026-12-05",
  caption: "Que viagem!",
  items: [{ title: "Trilha", location: "Vale da Lua" }],
  places: [{ name: "Mirante", address: "Estrada, km 3" }],
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
  caption: "Que viagem!",
  items: [{ title: "Trilha", location: "Vale da Lua" }],
  places: [{ name: "Mirante", address: "Estrada, km 3" }],
  cover_path: null,
  created_at: "2026-11-16T10:00:00Z",
  updated_at: "2026-11-16T10:00:00Z",
}

const CHAVES_DO_POST = [
  "caption",
  "cover_path",
  "created_at",
  "destination",
  "end_date",
  "id",
  "items",
  "places",
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
    expect(post).toMatchObject({
      id: POST,
      title: "Chapada",
      caption: "Que viagem!",
      items: [{ title: "Trilha", location: "Vale da Lua" }],
      places: [{ name: "Mirante", address: "Estrada, km 3" }],
    })
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

  it("items e places que não são lista viram lista vazia", async () => {
    const { cliente } = clienteFalso({
      rpc: { data: POST, error: null },
      respostas: [{ data: { ...LINHA, items: { title: "x" }, places: "Mirante" }, error: null }],
    })
    const post = await postDaViagem(cliente, VIAGEM)
    expect(post!.items).toEqual([])
    expect(post!.places).toEqual([])
  })

  it("o places gravado volta pela lista branca: notas, coordenadas e lugar sem nome não chegam à rota", async () => {
    const gravado = {
      ...LINHA,
      places: [
        { name: "Mirante", notes: "senha", latitude: -14, rating: 5, place_id: "ChIJ", category: "viewpoint" },
        { name: "Bar", address: "Rua B", visited: true },
        ["lista"],
        null,
        { address: "sem nome" },
      ],
    }
    const { cliente } = clienteFalso({ rpc: { data: POST, error: null }, respostas: [{ data: gravado, error: null }] })
    const post = await postDaViagem(cliente, VIAGEM)
    expect(post!.places).toStrictEqual([{ name: "Mirante", category: "viewpoint" }, { name: "Bar", address: "Rua B" }])
  })

  it.each([
    ["nula", null],
    ["vazia", ""],
    ["que não é texto", 42],
  ])("caption gravada %s volta null", async (_caso, caption) => {
    const { cliente } = clienteFalso({
      rpc: { data: POST, error: null },
      respostas: [{ data: { ...LINHA, caption }, error: null }],
    })
    expect((await postDaViagem(cliente, VIAGEM))!.caption).toBeNull()
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
          caption: "Que viagem!",
          items: [{ title: "Trilha", location: "Vale da Lua" }],
          places: [{ name: "Mirante", address: "Estrada, km 3" }],
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
          caption: "Que viagem!",
          items: [{ title: "Trilha", location: "Vale da Lua" }],
          places: [{ name: "Mirante", address: "Estrada, km 3" }],
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
