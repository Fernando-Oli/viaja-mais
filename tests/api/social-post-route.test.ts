import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ErroHttp } from "@/lib/http"
import {
  ANA,
  CAPA,
  ITEM_HOTEL,
  ITEM_JANTAR,
  ITEM_MUSEU,
  POST_ID,
  TRIP,
  URL_CAPA,
  argumentosDe,
  estado,
  funcoesChamadas,
  postPadrao,
  reiniciar,
} from "./post-dubles"

/**
 * @RF09.7 @RNF02.11 — o post da sessão numa viagem
 * (GET/POST/PATCH/DELETE /api/social/viagens/[tripId]/post).
 *
 * O que prova a autorização: só membro vê a prévia, publica e atualiza
 * (`exigirMembro`, chamado com o id de getUser()); só quem tem username publica;
 * o DELETE vale para quem saiu da viagem, porque acha o post pela sessão e não
 * pelo vínculo com a viagem. A RLS de `trip_posts` (segunda linha) é provada em
 * tests/rls/12-trip-posts.test.ts.
 *
 * O que prova a cópia: o `montarPost` é o real, e o argumento passado ao
 * `publicar` é conferido inteiro. O corpo só escolhe ids e campos; texto, chave
 * extra ou campo proibido nele é 400 sem ler nada além da autorização.
 *
 * Em todo caminho, `ler()` confere o `Cache-Control: private, no-store` e que
 * nenhuma chave proibida aparece em nível nenhum do corpo; os 200 conferem
 * ainda as chaves exatas da prévia e do post.
 */

vi.mock("@/lib/supabase/server", async () => {
  const { clienteDaSessao } = await import("./post-dubles")
  return { createClient: async () => clienteDaSessao() }
})
vi.mock("@/lib/supabase/admin", async () => {
  const { clienteDeServico } = await import("./post-dubles")
  return { criarClienteAdmin: clienteDeServico }
})
vi.mock("@/lib/authz/trip", async () => {
  const { exigirMembro } = await import("./post-dubles")
  return { exigirMembro }
})
vi.mock("@/lib/social/perfil-visto", async () => {
  const { temUsername } = await import("./post-dubles")
  return { temUsername }
})
vi.mock("@/lib/trips/publico", async (original) => {
  const { projecaoPublicaDaViagem } = await import("./post-dubles")
  return { ...(await original<typeof import("@/lib/trips/publico")>()), projecaoPublicaDaViagem }
})
vi.mock("@/lib/social/posts", async (original) => {
  const dubles = await import("./post-dubles")
  // `montarPost` fica o real: a cópia gravada tem de sair da projeção.
  return {
    ...(await original<typeof import("@/lib/social/posts")>()),
    postDaViagem: dubles.postDaViagem,
    publicar: dubles.publicar,
    atualizar: dubles.atualizar,
    despublicar: dubles.despublicar,
  }
})
vi.mock("@/lib/social/capa", async () => {
  const { assinarCapa, removerCapa } = await import("./post-dubles")
  return { assinarCapa, removerCapa }
})

import { DELETE, GET, PATCH, POST } from "@/app/api/social/viagens/[tripId]/post/route"
import { criarClienteAdmin } from "@/lib/supabase/admin"

type Metodo = "GET" | "POST" | "PATCH" | "DELETE"

/** Chaves que não saem em resposta nenhuma, em nível nenhum. */
const PROIBIDAS = new Set([
  "trip_id",
  "author_id",
  "cover_path",
  "budget",
  "currency",
  "notes",
  "email",
  "members",
  "membros",
  "trip_members",
  "latitude",
  "longitude",
  "status",
  "user_id",
])

const CHAVES_PREVIA = ["destination", "end_date", "itens", "start_date", "title"]
const CHAVES_ITEM_PREVIA = ["category", "date", "description", "end_time", "id", "location", "start_time", "title"]
const CHAVES_POST = ["cover_url", "created_at", "destination", "end_date", "id", "items", "start_date", "title", "updated_at"]

function chavesProibidas(valor: unknown, caminho = "corpo"): string[] {
  if (Array.isArray(valor)) return valor.flatMap((v, i) => chavesProibidas(v, `${caminho}[${i}]`))
  if (typeof valor !== "object" || valor === null) return []
  return Object.entries(valor).flatMap(([chave, v]) => [
    ...(PROIBIDAS.has(chave) ? [`${caminho}.${chave}`] : []),
    ...chavesProibidas(v, `${caminho}.${chave}`),
  ])
}

/** Confere o cabeçalho e as chaves proibidas, e devolve o corpo. */
async function ler(resposta: Response) {
  expect(resposta.headers.get("cache-control")).toBe("private, no-store")
  const corpo = await resposta.json()
  expect(chavesProibidas(corpo)).toEqual([])
  return corpo
}

function pedido(metodo: Metodo, corpo?: unknown, { tripId = TRIP, cru }: { tripId?: string; cru?: string } = {}) {
  // GET e DELETE não têm corpo (e o Request recusa corpo em GET).
  const temCorpo = (metodo === "POST" || metodo === "PATCH") && (corpo !== undefined || cru !== undefined)
  const request = new Request(`http://localhost/api/social/viagens/${tripId}/post`, {
    method: metodo,
    ...(temCorpo
      ? { body: cru ?? JSON.stringify(corpo), headers: { "content-type": "application/json" } }
      : {}),
  })
  const contexto = { params: Promise.resolve({ tripId }) }
  return { GET, POST, PATCH, DELETE }[metodo](request, contexto)
}

const CORPO_VALIDO = {
  // Fora de ordem, um em maiúsculas e um id que não está na projeção (inventado ou cancelado).
  itens: [ITEM_JANTAR, ITEM_MUSEU.toUpperCase(), "99999999-9999-4999-8999-999999999999"],
  mostrar: { local: true },
}

/** A cópia que o `montarPost` real monta da projeção do dublê para o CORPO_VALIDO. */
const COPIA_ESPERADA = {
  title: "Lisboa em família",
  destination: "Lisboa, Portugal",
  start_date: "2026-12-10",
  end_date: "2026-12-17",
  items: [{ title: "Museu dos Coches", location: "Belém" }, { title: "Jantar" }],
}

let log: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  reiniciar()
  log = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  // A rota nunca lê tabela direto: nem trips, nem itinerary_items, nem trip_posts.
  expect(estado.consultasDiretas).toEqual([])
  log.mockRestore()
})

/** O cliente da sessão criado nesta requisição. */
const sessao = () => estado.clientesDaSessao[0]

describe.each<Metodo>(["GET", "POST", "PATCH", "DELETE"])("%s /api/social/viagens/[tripId]/post — comum", (metodo) => {
  it("401 sem sessão, sem consultar nada", async () => {
    estado.usuario = null

    const resposta = await pedido(metodo, CORPO_VALIDO)

    expect(resposta.status).toBe(401)
    expect(await ler(resposta)).toEqual({ error: "Não autenticado" })
    expect(estado.chamadas).toEqual([])
  })

  it("400 com tripId fora do formato de uuid, antes da autorização", async () => {
    const resposta = await pedido(metodo, CORPO_VALIDO, { tripId: "nao-e-uuid" })

    expect(resposta.status).toBe(400)
    expect((await ler(resposta)).error).toBe("Dados inválidos")
    expect(estado.chamadas).toEqual([])
  })
})

describe("GET /api/social/viagens/[tripId]/post", () => {
  it("200 sem post: a prévia campo a campo, com o id do item só para marcar, e post nulo", async () => {
    const resposta = await pedido("GET")

    expect(resposta.status).toBe(200)
    const corpo = await ler(resposta)
    expect(Object.keys(corpo).sort()).toEqual(["post", "previa"])
    expect(corpo.post).toBeNull()
    expect(Object.keys(corpo.previa).sort()).toEqual(CHAVES_PREVIA)
    for (const item of corpo.previa.itens) expect(Object.keys(item).sort()).toEqual(CHAVES_ITEM_PREVIA)
    expect(corpo.previa.itens.map((i: { id: string }) => i.id)).toEqual([ITEM_HOTEL, ITEM_MUSEU, ITEM_JANTAR])
    expect(corpo.previa.itens[0]).toEqual({
      id: ITEM_HOTEL,
      title: "Check-in no hotel",
      date: "2026-12-10",
      start_time: "14:00:00",
      end_time: null,
      category: "accommodation",
      location: "Av. da Liberdade",
      description: "quarto 12",
    })
    // Autorização com o cliente e o id da sessão, antes de ler qualquer coisa.
    expect(funcoesChamadas()[0]).toBe("exigirMembro")
    expect(argumentosDe("exigirMembro")).toEqual([sessao(), TRIP, ANA])
    expect(funcoesChamadas()).not.toContain("assinarCapa")
  })

  it("200 com post: a capa vira URL assinada pelo cliente de serviço, sem o caminho cru", async () => {
    estado.post = postPadrao({ cover_path: CAPA })

    const resposta = await pedido("GET")

    expect(resposta.status).toBe(200)
    const corpo = await ler(resposta)
    expect(Object.keys(corpo.post).sort()).toEqual(CHAVES_POST)
    expect(corpo.post).toEqual({
      id: POST_ID,
      title: "Lisboa em família",
      destination: "Lisboa, Portugal",
      start_date: "2026-12-10",
      end_date: "2026-12-17",
      items: [{ title: "Museu dos Coches", location: "Belém" }],
      cover_url: URL_CAPA,
      created_at: "2026-11-16T12:00:00.000Z",
      updated_at: "2026-11-16T12:00:00.000Z",
    })
    expect(argumentosDe("assinarCapa")).toEqual([criarClienteAdmin, CAPA])
  })

  it("200 com a assinatura da capa falhando: cover_url nulo, e a resposta continua", async () => {
    estado.post = postPadrao({ cover_path: CAPA })
    estado.urlCapa = null

    const corpo = await ler(await pedido("GET"))

    expect(corpo.post.cover_url).toBeNull()
  })

  it("403 não-membro, sem ler a projeção nem o post", async () => {
    estado.membro = false

    const resposta = await pedido("GET")

    expect(resposta.status).toBe(403)
    expect(await ler(resposta)).toEqual({ error: "Sem permissão para acessar esta viagem" })
    expect(funcoesChamadas()).toEqual(["exigirMembro"])
  })

  it("404 quando a projeção não existe para a sessão", async () => {
    estado.projecao = null

    const resposta = await pedido("GET")

    expect(resposta.status).toBe(404)
    expect(await ler(resposta)).toEqual({ error: "Viagem não encontrada" })
  })

  it("500 sem a mensagem crua quando a leitura do post falha", async () => {
    estado.erroPost = new Error('[post da viagem] não foi possível ler a publicação', {
      cause: { message: 'relation "trip_posts" secreta' },
    })

    const resposta = await pedido("GET")

    expect(resposta.status).toBe(500)
    expect(await ler(resposta)).toEqual({ error: "Erro interno do servidor" })
  })
})

describe("POST /api/social/viagens/[tripId]/post", () => {
  it("201 grava a cópia montada da projeção, nunca do corpo, em nome da sessão", async () => {
    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(201)
    const corpo = await ler(resposta)
    expect(Object.keys(corpo)).toEqual(["post"])
    expect(Object.keys(corpo.post).sort()).toEqual(CHAVES_POST)
    expect(corpo.post).toMatchObject({ ...COPIA_ESPERADA, id: POST_ID, cover_url: null })

    // A ordem: sessão, autorização, username, corpo, projeção, gravação.
    expect(funcoesChamadas()).toEqual(["exigirMembro", "temUsername", "projecaoPublicaDaViagem", "publicar"])
    expect(argumentosDe("exigirMembro")).toEqual([sessao(), TRIP, ANA])
    expect(argumentosDe("temUsername")).toEqual([sessao(), ANA])
    expect(argumentosDe("publicar")).toEqual([sessao(), { tripId: TRIP, autorId: ANA, copia: COPIA_ESPERADA }])
  })

  it("201 com a lista vazia publica a viagem sem itinerário, e todos os campos ligados mostram só o que existe", async () => {
    const resposta = await pedido("POST", {
      itens: [ITEM_HOTEL],
      mostrar: { local: true, descricao: true, horario: true, categoria: true },
    })

    expect(resposta.status).toBe(201)
    await ler(resposta)
    const { copia } = (argumentosDe("publicar") as [unknown, { copia: { items: unknown[] } }])[1]
    expect(copia.items).toEqual([
      {
        title: "Check-in no hotel",
        date: "2026-12-10",
        start_time: "14:00:00",
        category: "accommodation",
        location: "Av. da Liberdade",
        description: "quarto 12",
      },
    ])

    reiniciar()
    await ler(await pedido("POST", { itens: [], mostrar: {} }))
    expect((argumentosDe("publicar") as [unknown, { copia: { items: unknown[] } }])[1].copia.items).toEqual([])
  })

  it("403 não-membro, sem gravar nem ler a projeção", async () => {
    estado.membro = false

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(403)
    expect(await ler(resposta)).toEqual({ error: "Sem permissão para acessar esta viagem" })
    expect(funcoesChamadas()).toEqual(["exigirMembro"])
  })

  it("403 sem_username: a sessão sem nome de usuário não publica, e nada é gravado", async () => {
    estado.username = false

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(403)
    expect(await ler(resposta)).toEqual({
      error: "Escolha um nome de usuário para publicar uma viagem",
      codigo: "sem_username",
    })
    expect(funcoesChamadas()).toEqual(["exigirMembro", "temUsername"])
  })

  it.each([
    ["title e notes no corpo (escrever o post por fora)", { ...CORPO_VALIDO, title: "Inventado", notes: "x" }],
    ["trip_id e author_id no corpo", { ...CORPO_VALIDO, trip_id: TRIP, author_id: ANA }],
    ["chave extra em mostrar", { itens: [], mostrar: { local: true, notas: true } }],
    ["item fora do formato de uuid", { itens: ["abc"], mostrar: {} }],
    ["mais de 200 itens", { itens: Array.from({ length: 201 }, () => ITEM_MUSEU), mostrar: {} }],
    ["sem mostrar", { itens: [] }],
    ["mostrar com valor que não é booleano", { itens: [], mostrar: { local: "sim" } }],
    ["corpo que não é objeto", ["itens"]],
  ])("400 com %s, sem ler a projeção nem gravar", async (_caso, corpo) => {
    const resposta = await pedido("POST", corpo)

    expect(resposta.status).toBe(400)
    const lido = await ler(resposta)
    expect(lido.error).toBe("Dados inválidos")
    expect(lido.detalhes).toBeDefined()
    expect(funcoesChamadas()).toEqual(["exigirMembro", "temUsername"])
  })

  it("400 com JSON malformado, e não o 500 de um SyntaxError", async () => {
    const resposta = await pedido("POST", undefined, { cru: "{ itens: [" })

    expect(resposta.status).toBe(400)
    expect((await ler(resposta)).error).toBe("Dados inválidos")
    expect(funcoesChamadas()).toEqual(["exigirMembro", "temUsername"])
  })

  it("404 quando a projeção não existe, sem gravar", async () => {
    estado.projecao = null

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(404)
    await ler(resposta)
    expect(funcoesChamadas()).not.toContain("publicar")
  })

  it("409 quando a sessão já publicou esta viagem", async () => {
    estado.erroPublicar = new ErroHttp(409, "Você já publicou esta viagem")

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(409)
    expect(await ler(resposta)).toEqual({ error: "Você já publicou esta viagem" })
  })

  it("500 sem a mensagem crua quando o banco falha ao gravar", async () => {
    const cru = { code: "XX000", message: 'violates check constraint "trip_posts_items_validos" segredo' }
    estado.erroPublicar = new Error("[post da viagem] não foi possível publicar esta viagem", { cause: cru })

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(500)
    const texto = JSON.stringify(await ler(resposta))
    expect(texto).toBe(JSON.stringify({ error: "Erro interno do servidor" }))
    expect(texto).not.toContain("segredo")
    expect(resposta.headers.get("x-codigo-erro")).toMatch(/^[0-9a-f]{8}$/)
  })

  it("500 sem a mensagem crua quando a leitura do itinerário falha", async () => {
    estado.erroProjecao = new Error("Não foi possível ler o itinerário da viagem")

    const resposta = await pedido("POST", CORPO_VALIDO)

    expect(resposta.status).toBe(500)
    expect(await ler(resposta)).toEqual({ error: "Erro interno do servidor" })
    expect(funcoesChamadas()).not.toContain("publicar")
  })
})

describe("PATCH /api/social/viagens/[tripId]/post", () => {
  beforeEach(() => {
    estado.post = postPadrao({ cover_path: CAPA })
  })

  it("200 copia a viagem de novo para o post da sessão", async () => {
    estado.atualizado = postPadrao({ ...COPIA_ESPERADA, cover_path: CAPA, updated_at: "2026-11-16T14:00:00.000Z" })

    const resposta = await pedido("PATCH", CORPO_VALIDO)

    expect(resposta.status).toBe(200)
    const corpo = await ler(resposta)
    expect(Object.keys(corpo.post).sort()).toEqual(CHAVES_POST)
    expect(corpo.post).toMatchObject({ ...COPIA_ESPERADA, cover_url: URL_CAPA, updated_at: "2026-11-16T14:00:00.000Z" })
    expect(funcoesChamadas()).toEqual([
      "exigirMembro",
      "postDaViagem",
      "projecaoPublicaDaViagem",
      "atualizar",
      "assinarCapa",
    ])
    expect(argumentosDe("exigirMembro")).toEqual([sessao(), TRIP, ANA])
    expect(argumentosDe("atualizar")).toEqual([sessao(), POST_ID, COPIA_ESPERADA])
  })

  it("403 de quem saiu da viagem, sem atualizar", async () => {
    estado.membro = false

    const resposta = await pedido("PATCH", CORPO_VALIDO)

    expect(resposta.status).toBe(403)
    await ler(resposta)
    expect(funcoesChamadas()).toEqual(["exigirMembro"])
  })

  it("403 quando a policy recusa (42501 vira 403 na lib)", async () => {
    estado.erroAtualizar = new ErroHttp(403, "Sem permissão para atualizar esta publicação")

    const resposta = await pedido("PATCH", CORPO_VALIDO)

    expect(resposta.status).toBe(403)
    expect(await ler(resposta)).toEqual({ error: "Sem permissão para atualizar esta publicação" })
  })

  it("404 sem post da sessão nesta viagem, sem ler a projeção nem atualizar", async () => {
    estado.post = null

    const resposta = await pedido("PATCH", CORPO_VALIDO)

    expect(resposta.status).toBe(404)
    expect(await ler(resposta)).toEqual({ error: "Publicação não encontrada" })
    expect(funcoesChamadas()).toEqual(["exigirMembro", "postDaViagem"])
  })

  it("404 quando o post some entre a leitura e a escrita", async () => {
    estado.atualizado = null

    const resposta = await pedido("PATCH", CORPO_VALIDO)

    expect(resposta.status).toBe(404)
    await ler(resposta)
  })

  it.each([
    ["title no corpo", { ...CORPO_VALIDO, title: "Inventado" }],
    ["cover_path no corpo", { ...CORPO_VALIDO, cover_path: "outro/caminho.webp" }],
    ["item fora do formato", { itens: [42], mostrar: {} }],
  ])("400 com %s, sem ler o post nem atualizar", async (_caso, corpo) => {
    const resposta = await pedido("PATCH", corpo)

    expect(resposta.status).toBe(400)
    expect((await ler(resposta)).error).toBe("Dados inválidos")
    expect(funcoesChamadas()).toEqual(["exigirMembro"])
  })

  it("500 sem a mensagem crua quando o banco falha ao atualizar", async () => {
    estado.erroAtualizar = new Error("[post da viagem] x", { cause: { message: "segredo do postgres" } })

    const resposta = await pedido("PATCH", CORPO_VALIDO)

    expect(resposta.status).toBe(500)
    expect(await ler(resposta)).toEqual({ error: "Erro interno do servidor" })
  })
})

describe("DELETE /api/social/viagens/[tripId]/post", () => {
  beforeEach(() => {
    estado.post = postPadrao({ cover_path: CAPA })
    estado.despublicado = { capaAnterior: CAPA }
  })

  it("200 apaga o post e depois a capa, na pasta da sessão, com o cliente de serviço", async () => {
    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(200)
    expect(await ler(resposta)).toEqual({ post: null })
    expect(funcoesChamadas()).toEqual(["postDaViagem", "despublicar", "removerCapa"])
    expect(argumentosDe("postDaViagem")).toEqual([sessao(), TRIP])
    expect(argumentosDe("despublicar")).toEqual([sessao(), POST_ID])
    expect(argumentosDe("removerCapa")).toEqual([estado.clientesDeServico[0], CAPA, ANA])
    expect(log).not.toHaveBeenCalled()
  })

  it("200 para quem saiu da viagem: o post é do autor, e o exigirMembro não é chamado", async () => {
    estado.membro = false

    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(200)
    await ler(resposta)
    expect(funcoesChamadas()).not.toContain("exigirMembro")
    expect(funcoesChamadas()).toContain("despublicar")
  })

  it("200 sem capa: não cria o cliente de serviço nem vai ao Storage", async () => {
    estado.despublicado = { capaAnterior: null }

    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(200)
    await ler(resposta)
    expect(estado.clientesDeServico).toEqual([])
    expect(funcoesChamadas()).not.toContain("removerCapa")
  })

  it("200 mesmo se o Storage falhar ao apagar a capa: o post já saiu, e a falha vai para o log", async () => {
    const erro = new Error("[capa do post] remoção falhou")
    estado.erroRemoverCapa = erro

    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(200)
    expect(await ler(resposta)).toEqual({ post: null })
    expect(log).toHaveBeenCalledWith("[post da viagem] capa não apagada", CAPA, erro)
  })

  it("200 e log quando a capa não sai do bucket (arquivo já ausente ou fora da pasta)", async () => {
    estado.capaRemovida = false

    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(200)
    await ler(resposta)
    expect(log).toHaveBeenCalledWith("[post da viagem] capa não apagada", CAPA)
  })

  it("404 sem post da sessão nesta viagem, sem apagar nada", async () => {
    estado.post = null

    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(404)
    expect(await ler(resposta)).toEqual({ error: "Publicação não encontrada" })
    expect(funcoesChamadas()).toEqual(["postDaViagem"])
  })

  it("404 quando nada foi apagado (despublicado em outra aba), sem ir ao Storage", async () => {
    estado.despublicado = null

    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(404)
    await ler(resposta)
    expect(funcoesChamadas()).not.toContain("removerCapa")
  })

  it("500 sem a mensagem crua quando o banco falha ao apagar, e a capa fica", async () => {
    estado.erroDespublicar = new Error("[post da viagem] x", { cause: { message: "segredo do postgres" } })

    const resposta = await pedido("DELETE")

    expect(resposta.status).toBe(500)
    expect(await ler(resposta)).toEqual({ error: "Erro interno do servidor" })
    expect(funcoesChamadas()).not.toContain("removerCapa")
  })
})
