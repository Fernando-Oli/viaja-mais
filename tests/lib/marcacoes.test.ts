/**
 * @RF09.13 marcar no post só membros da viagem com username: quem pode ser marcado vem da função
 * social_membros_marcaveis, os perfis saem campo a campo com a foto assinada, e a sincronização confere
 * os permitidos antes de escrever, insere só os novos e apaga só os removidos. Quem removeu a própria
 * marca num post do autor (decisões de 18/11: vale para a viagem e o autor, lida pela função
 * social_recusas_da_viagem) sai com `recusou: true` e marcá-lo é 400 marcado_recusou
 */
import { describe, it, expect, beforeEach } from "vitest"
import { ErroHttp } from "@/lib/http"
import { esquecerLinksEmitidos } from "@/lib/social/avatar"
import {
  MARCADO_INVALIDO,
  MARCADO_RECUSOU,
  comRecusas,
  conferirMarcados,
  conferirRecusas,
  marcadosDoPost,
  membrosMarcaveis,
  recusasDaViagem,
  sincronizarMarcacoes,
} from "@/lib/social/marcacoes"

const VIAGEM = "99999999-9999-4999-8999-999999999999"
const POST = "77777777-7777-4777-8777-777777777777"
const AUTOR = "11111111-1111-4111-8111-111111111111"
const BIA = "22222222-2222-4222-8222-222222222222"
const CAIO = "33333333-3333-4333-8333-333333333333"
const DORA = "44444444-4444-4444-8444-444444444444"

const FOTO_BIA = `${BIA}/0b6f2c4e-5d7a-4a8e-9b1c-2f3e4d5a6b7c.webp`
const URL_BIA = `https://storage.teste/sign/avatars/${FOTO_BIA}?token=t`

type Resposta = { data: unknown; error: { code?: string; message?: string } | null }
type Chamada = [metodo: string, ...args: unknown[]]

/**
 * Cliente falso: cada `from(tabela)` consome a próxima resposta da fila e
 * registra a cadeia inteira; a cadeia é "thenable", como a do supabase-js, e
 * resolve com a resposta. `rpc` registra o nome e os argumentos.
 */
function clienteFalso({ rpc, respostas = [] }: { rpc?: Resposta; respostas?: Resposta[] }) {
  const consultas: { tabela: string; chamadas: Chamada[] }[] = []
  const rpcs: [string, unknown][] = []
  const fila = [...respostas]

  const from = (tabela: string) => {
    const consulta = { tabela, chamadas: [] as Chamada[] }
    consultas.push(consulta)
    const resposta = fila.shift() ?? { data: null, error: null }
    const construtor: Record<string, unknown> = {
      then: (resolver: (r: Resposta) => unknown, rejeitar?: (e: unknown) => unknown) =>
        Promise.resolve(resposta).then(resolver, rejeitar),
    }
    for (const metodo of ["select", "insert", "delete", "eq", "in", "not", "order"]) {
      construtor[metodo] = (...args: unknown[]) => {
        consulta.chamadas.push([metodo, ...args])
        return construtor
      }
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
  return { cliente: cliente as unknown as Parameters<typeof membrosMarcaveis>[0], consultas, rpcs }
}

/** A fábrica do cliente de serviço: conta quantas vezes foi criada e assina o que receber. */
function servicoFalso() {
  const estado = { criado: 0, assinados: [] as string[][] }
  const criarAdmin = () => {
    estado.criado += 1
    return {
      storage: {
        from: () => ({
          async createSignedUrls(caminhos: string[]) {
            estado.assinados.push(caminhos)
            return { data: caminhos.map((path) => ({ path, signedUrl: URL_BIA, error: null })), error: null }
          },
        }),
      },
    } as never
  }
  return { criarAdmin, estado }
}

const ERRO_CRU = { code: "XX000", message: 'relation "trip_members" secret detail' }

async function lancaSemMensagemCrua(promessa: Promise<unknown>) {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  )
  expect(erro).toBeInstanceOf(Error)
  expect(erro).not.toBeInstanceOf(ErroHttp)
  expect((erro as Error).message).not.toContain("secret")
  expect((erro as Error).cause).toBe(ERRO_CRU)
}

async function lancaHttp(promessa: Promise<unknown>, status: number, mensagem?: string) {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  )
  expect(erro).toBeInstanceOf(ErroHttp)
  expect((erro as ErroHttp).status).toBe(status)
  if (mensagem) expect((erro as ErroHttp).message).toBe(mensagem)
}

const CHAVES_PESSOA = ["avatar_url", "full_name", "id", "username"]

beforeEach(() => {
  esquecerLinksEmitidos()
})

describe("membrosMarcaveis", () => {
  it("pergunta à função do banco, lê os perfis campo a campo e assina a foto", async () => {
    const { cliente, consultas, rpcs } = clienteFalso({
      rpc: { data: [BIA, CAIO], error: null },
      respostas: [
        {
          data: [
            { id: BIA, username: "bia", full_name: "Bia", avatar_url: FOTO_BIA, email: "bia@x.local" },
            { id: CAIO, username: "caio", full_name: null, avatar_url: null },
          ],
          error: null,
        },
      ],
    })
    const { criarAdmin, estado } = servicoFalso()

    const marcaveis = await membrosMarcaveis(cliente, VIAGEM, criarAdmin)

    expect(rpcs).toEqual([["social_membros_marcaveis", { viagem: VIAGEM }]])
    expect(consultas).toEqual([
      {
        tabela: "profiles",
        chamadas: [
          ["select", "id, username, full_name, avatar_url"],
          ["in", "id", [BIA, CAIO]],
          ["not", "username", "is", null],
          ["order", "username", { ascending: true }],
        ],
      },
    ])
    expect(marcaveis).toStrictEqual([
      { id: BIA, username: "bia", full_name: "Bia", avatar_url: URL_BIA },
      { id: CAIO, username: "caio", full_name: null, avatar_url: null },
    ])
    for (const pessoa of marcaveis) expect(Object.keys(pessoa).sort()).toEqual(CHAVES_PESSOA)
    expect(estado.assinados).toEqual([[FOTO_BIA]])
  })

  it("perfil sem username (por fora do filtro) não aparece", async () => {
    const { cliente } = clienteFalso({
      rpc: { data: [BIA, CAIO], error: null },
      respostas: [
        {
          data: [
            { id: BIA, username: null, full_name: "Bia", avatar_url: null },
            { id: CAIO, username: "caio", full_name: null, avatar_url: null },
          ],
          error: null,
        },
      ],
    })
    const marcaveis = await membrosMarcaveis(cliente, VIAGEM, servicoFalso().criarAdmin)
    expect(marcaveis.map((p) => p.username)).toEqual(["caio"])
  })

  it.each([
    ["lista vazia (não-membro ou ninguém com username)", []],
    ["nulo", null],
    ["algo que não é lista", { id: BIA }],
  ])("função responde %s: lista vazia, sem ler profiles nem criar o cliente de serviço", async (_caso, data) => {
    const { cliente, consultas } = clienteFalso({ rpc: { data, error: null } })
    const { criarAdmin, estado } = servicoFalso()
    expect(await membrosMarcaveis(cliente, VIAGEM, criarAdmin)).toEqual([])
    expect(consultas).toEqual([])
    expect(estado.criado).toBe(0)
  })

  it("ignora o que não é id em texto na resposta da função", async () => {
    const { cliente, consultas } = clienteFalso({
      rpc: { data: [BIA, 42, null], error: null },
      respostas: [{ data: [], error: null }],
    })
    await membrosMarcaveis(cliente, VIAGEM, servicoFalso().criarAdmin)
    expect(consultas[0].chamadas[1]).toEqual(["in", "id", [BIA]])
  })

  it("erro da função ou de profiles lança sem a mensagem crua; 42501 vira 403", async () => {
    await lancaSemMensagemCrua(
      membrosMarcaveis(clienteFalso({ rpc: { data: null, error: ERRO_CRU } }).cliente, VIAGEM, servicoFalso().criarAdmin),
    )
    await lancaSemMensagemCrua(
      membrosMarcaveis(
        clienteFalso({ rpc: { data: [BIA], error: null }, respostas: [{ data: null, error: ERRO_CRU }] }).cliente,
        VIAGEM,
        servicoFalso().criarAdmin,
      ),
    )
    await lancaHttp(
      membrosMarcaveis(
        clienteFalso({ rpc: { data: null, error: { code: "42501", message: "permission denied" } } }).cliente,
        VIAGEM,
        servicoFalso().criarAdmin,
      ),
      403,
    )
  })
})

describe("marcadosDoPost", () => {
  it("lê as marcas do post com o perfil embutido, na ordem em que foram feitas", async () => {
    const { cliente, consultas } = clienteFalso({
      respostas: [
        {
          data: [
            { perfil: { id: CAIO, username: "caio", full_name: "Caio", avatar_url: null } },
            { perfil: { id: BIA, username: "bia", full_name: null, avatar_url: FOTO_BIA } },
          ],
          error: null,
        },
      ],
    })

    const marcados = await marcadosDoPost(cliente, POST, servicoFalso().criarAdmin)

    expect(consultas).toEqual([
      {
        tabela: "post_tags",
        chamadas: [
          ["select", "perfil:profiles!post_tags_tagged_id_fkey(id, username, full_name, avatar_url)"],
          ["eq", "post_id", POST],
          ["order", "created_at", { ascending: true }],
        ],
      },
    ])
    expect(marcados).toStrictEqual([
      { id: CAIO, username: "caio", full_name: "Caio", avatar_url: null },
      { id: BIA, username: "bia", full_name: null, avatar_url: URL_BIA },
    ])
  })

  it("perfil ausente no embed ou sem username fica de fora; sem marcas, lista vazia", async () => {
    const { cliente } = clienteFalso({
      respostas: [
        {
          data: [{ perfil: null }, { perfil: { id: BIA, username: null, full_name: null, avatar_url: null } }],
          error: null,
        },
      ],
    })
    expect(await marcadosDoPost(cliente, POST, servicoFalso().criarAdmin)).toEqual([])
    expect(await marcadosDoPost(clienteFalso({}).cliente, POST, servicoFalso().criarAdmin)).toEqual([])
  })

  it("erro lança sem a mensagem crua", async () => {
    await lancaSemMensagemCrua(
      marcadosDoPost(clienteFalso({ respostas: [{ data: null, error: ERRO_CRU }] }).cliente, POST, servicoFalso().criarAdmin),
    )
  })
})

describe("conferirMarcados", () => {
  it("aceita lista vazia e marcados dentro dos permitidos, sem diferenciar maiúsculas", () => {
    expect(() => conferirMarcados([], [])).not.toThrow()
    expect(() => conferirMarcados([BIA.toUpperCase()], [CAIO, BIA])).not.toThrow()
    expect(() => conferirMarcados([BIA], new Set([BIA.toUpperCase()]))).not.toThrow()
  })

  it("um marcado fora dos permitidos é 400 marcado_invalido", () => {
    let erro: unknown
    try {
      conferirMarcados([BIA, DORA], [BIA, CAIO])
    } catch (e) {
      erro = e
    }
    expect(erro).toBeInstanceOf(ErroHttp)
    expect(erro).toMatchObject({ status: 400, message: MARCADO_INVALIDO })
    expect(MARCADO_INVALIDO).toBe("marcado_invalido")
  })

  it("sem permitidos, qualquer marcado é inválido (a própria sessão, por exemplo)", () => {
    expect(() => conferirMarcados([AUTOR], [])).toThrow(MARCADO_INVALIDO)
  })
})

describe("recusasDaViagem", () => {
  it("pergunta à função do banco, sem ler tabela, e devolve em minúsculas, ignorando o que não é id em texto", async () => {
    const { cliente, consultas, rpcs } = clienteFalso({
      rpc: { data: [CAIO.toUpperCase(), DORA, 42, null], error: null },
    })

    const recusas = await recusasDaViagem(cliente, VIAGEM)

    expect(rpcs).toEqual([["social_recusas_da_viagem", { viagem: VIAGEM }]])
    // A sessão não lê post_tag_recusas direto: o trip_id não é legível.
    expect(consultas).toEqual([])
    expect([...recusas]).toEqual([CAIO, DORA])
  })

  it.each([
    ["lista vazia", []],
    ["nulo", null],
    ["algo que não é lista", { id: CAIO }],
  ])("função responde %s: conjunto vazio", async (_caso, data) => {
    expect((await recusasDaViagem(clienteFalso({ rpc: { data, error: null } }).cliente, VIAGEM)).size).toBe(0)
  })

  it("erro lança sem a mensagem crua; 42501 vira 403", async () => {
    await lancaSemMensagemCrua(recusasDaViagem(clienteFalso({ rpc: { data: null, error: ERRO_CRU } }).cliente, VIAGEM))
    await lancaHttp(
      recusasDaViagem(clienteFalso({ rpc: { data: null, error: { code: "42501", message: "x" } } }).cliente, VIAGEM),
      403,
    )
  })
})

describe("comRecusas", () => {
  const BIA_P = { id: BIA, username: "bia", full_name: "Bia", avatar_url: URL_BIA }
  const CAIO_P = { id: CAIO.toUpperCase(), username: "caio", full_name: null, avatar_url: null }

  it("marca recusou em quem recusou (sem diferenciar maiúsculas), nas chaves exatas", () => {
    const marcaveis = comRecusas([{ ...BIA_P, email: "x" } as typeof BIA_P, CAIO_P], new Set([CAIO]))

    expect(marcaveis).toStrictEqual([
      { ...BIA_P, recusou: false },
      { ...CAIO_P, recusou: true },
    ])
    for (const p of marcaveis) expect(Object.keys(p).sort()).toEqual([...CHAVES_PESSOA, "recusou"].sort())
  })

  it("sem recusas, todos com recusou false", () => {
    expect(comRecusas([BIA_P, CAIO_P], new Set()).map((p) => p.recusou)).toEqual([false, false])
  })
})

describe("conferirRecusas", () => {
  it("aceita lista vazia e quem não recusou", () => {
    expect(() => conferirRecusas([], [CAIO])).not.toThrow()
    expect(() => conferirRecusas([BIA], [CAIO])).not.toThrow()
    expect(() => conferirRecusas([BIA], [])).not.toThrow()
  })

  it("quem recusou é 400 marcado_recusou, sem diferenciar maiúsculas", () => {
    let erro: unknown
    try {
      conferirRecusas([BIA, CAIO.toUpperCase()], new Set([CAIO]))
    } catch (e) {
      erro = e
    }
    expect(erro).toBeInstanceOf(ErroHttp)
    expect(erro).toMatchObject({ status: 400, message: MARCADO_RECUSOU })
    expect(MARCADO_RECUSOU).toBe("marcado_recusou")
    expect(() => conferirRecusas([CAIO], [CAIO.toUpperCase()])).toThrow(MARCADO_RECUSOU)
  })
})

describe("sincronizarMarcacoes", () => {
  it("insere só os novos, campo a campo, e apaga só os removidos; os que ficam não são tocados", async () => {
    const { cliente, consultas } = clienteFalso({
      respostas: [
        { data: [{ tagged_id: BIA }, { tagged_id: CAIO.toUpperCase() }], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ],
    })

    await sincronizarMarcacoes(cliente, POST, AUTOR, [BIA, DORA], [BIA, CAIO, DORA])

    expect(consultas).toEqual([
      { tabela: "post_tags", chamadas: [["select", "tagged_id"], ["eq", "post_id", POST]] },
      { tabela: "post_tags", chamadas: [["insert", [{ post_id: POST, tagged_id: DORA, author_id: AUTOR }]]] },
      {
        tabela: "post_tags",
        chamadas: [["delete"], ["eq", "post_id", POST], ["in", "tagged_id", [CAIO]]],
      },
    ])
  })

  it("nada mudou: só lê", async () => {
    const { cliente, consultas } = clienteFalso({ respostas: [{ data: [{ tagged_id: BIA }], error: null }] })
    await sincronizarMarcacoes(cliente, POST, AUTOR, [BIA], [BIA])
    expect(consultas).toHaveLength(1)
  })

  it("lista vazia apaga todas as marcas", async () => {
    const { cliente, consultas } = clienteFalso({
      respostas: [{ data: [{ tagged_id: BIA }, { tagged_id: CAIO }], error: null }],
    })
    await sincronizarMarcacoes(cliente, POST, AUTOR, [], [])
    expect(consultas.map((c) => c.chamadas[0][0])).toEqual(["select", "delete"])
    expect(consultas[1].chamadas[2]).toEqual(["in", "tagged_id", [BIA, CAIO]])
  })

  it("post sem marcas e marcados novos: só insere", async () => {
    const { cliente, consultas } = clienteFalso({ respostas: [{ data: [], error: null }] })
    await sincronizarMarcacoes(cliente, POST, AUTOR, [BIA, CAIO], [BIA, CAIO])
    expect(consultas.map((c) => c.chamadas[0][0])).toEqual(["select", "insert"])
    expect(consultas[1].chamadas[0][1]).toEqual([
      { post_id: POST, tagged_id: BIA, author_id: AUTOR },
      { post_id: POST, tagged_id: CAIO, author_id: AUTOR },
    ])
  })

  it("marcado fora dos permitidos: 400 marcado_invalido sem ler nem escrever nada", async () => {
    const { cliente, consultas } = clienteFalso({})
    await lancaHttp(sincronizarMarcacoes(cliente, POST, AUTOR, [BIA, DORA], [BIA]), 400, MARCADO_INVALIDO)
    expect(consultas).toEqual([])
  })

  it("marcado que recusou, mesmo entre os permitidos: 400 marcado_recusou sem ler nem escrever nada", async () => {
    const { cliente, consultas } = clienteFalso({})
    await lancaHttp(sincronizarMarcacoes(cliente, POST, AUTOR, [BIA, CAIO], [BIA, CAIO], [CAIO]), 400, MARCADO_RECUSOU)
    expect(consultas).toEqual([])
  })

  it("com recusas, quem não recusou é marcado normalmente", async () => {
    const { cliente, consultas } = clienteFalso({ respostas: [{ data: [], error: null }] })
    await sincronizarMarcacoes(cliente, POST, AUTOR, [BIA], [BIA, CAIO], new Set([CAIO]))
    expect(consultas.map((c) => c.chamadas[0][0])).toEqual(["select", "insert"])
  })

  it("corrida (S1): a policy recusa o INSERT (42501) porque a pessoa acabou de remover a marca — 400 marcado_recusou, e nada é apagado", async () => {
    // Bia é nova; Caio estava marcado e sai. O INSERT falha antes da remoção.
    const { cliente, consultas } = clienteFalso({
      respostas: [{ data: [{ tagged_id: CAIO }], error: null }, { data: null, error: { code: "42501" } }],
    })
    await lancaHttp(sincronizarMarcacoes(cliente, POST, AUTOR, [BIA], [BIA, CAIO]), 400, MARCADO_RECUSOU)
    expect(consultas.map((c) => c.chamadas[0][0])).toEqual(["select", "insert"])
  })

  it("42501 na remoção continua 403: ali não há recusa possível, é a policy de DELETE", async () => {
    await lancaHttp(
      sincronizarMarcacoes(
        clienteFalso({ respostas: [{ data: [{ tagged_id: BIA }], error: null }, { data: null, error: { code: "42501" } }] })
          .cliente,
        POST,
        AUTOR,
        [],
        [],
      ),
      403,
    )
  })

  it("marca duplicada em corrida (23505) vira 409", async () => {
    await lancaHttp(
      sincronizarMarcacoes(
        clienteFalso({ respostas: [{ data: [], error: null }, { data: null, error: { code: "23505" } }] }).cliente,
        POST,
        AUTOR,
        [BIA],
        [BIA],
      ),
      409,
    )
  })

  it("erro ao ler, inserir ou apagar lança sem a mensagem crua", async () => {
    await lancaSemMensagemCrua(
      sincronizarMarcacoes(clienteFalso({ respostas: [{ data: null, error: ERRO_CRU }] }).cliente, POST, AUTOR, [], []),
    )
    await lancaSemMensagemCrua(
      sincronizarMarcacoes(
        clienteFalso({ respostas: [{ data: [], error: null }, { data: null, error: ERRO_CRU }] }).cliente,
        POST,
        AUTOR,
        [BIA],
        [BIA],
      ),
    )
    await lancaSemMensagemCrua(
      sincronizarMarcacoes(
        clienteFalso({ respostas: [{ data: [{ tagged_id: BIA }], error: null }, { data: null, error: ERRO_CRU }] })
          .cliente,
        POST,
        AUTOR,
        [],
        [],
      ),
    )
  })
})
