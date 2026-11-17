import { randomUUID } from "node:crypto"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { USUARIOS } from "../fixtures/usuarios"
import { admin, chamar, logar } from "./apoio"

/**
 * A rede social na API (`/api/social/**`, menos a foto), com sessão e banco
 * reais. Substitui os `tests/api/social-*-route.test.ts` que simulavam o
 * Supabase (todos, menos o da foto, que continua no Next).
 *
 * No seed, a Ana, a Carla e o Davi têm perfil público e o Bruno, privado; não
 * há vínculo entre eles. Tudo o que este arquivo cria sai no fim.
 *
 * Precisa do banco local: `npm run db:reset`.
 *
 * @RF02.1 @RF02.5 @RF02.6 @RF02.8 perfil · @RF09.1 @RF09.2 @RF09.3 @RF09.4 @RF09.5 seguir e solicitações
 * @RF09.6 listas da rede · @RF09.9 remover seguidor e sem username · @RF09.10 busca
 * @RF09.12 histórico de pesquisa · @RF13.2 Zona 1 da central · @RNF02.7 sem atribuição em massa
 */

const { ana, bruno, carla, davi } = USUARIOS
const SEED = [ana.id, bruno.id, carla.id, davi.id]
const SUFIXO = Date.now().toString(36)

let cookieAna: string
let cookieBruno: string
let cookieCarla: string
let cookieDavi: string
let bioOriginal: string | null

/** Contas descartáveis, com username `si_<n>_<sufixo>`, direto no banco. */
const descartaveis: { id: string; username: string }[] = []
async function novaConta(comUsername = true) {
  const id = randomUUID()
  const username = `si_${descartaveis.length}_${SUFIXO}`
  await admin.query(
    `insert into auth.users (id, name, email, email_verified) values ($1, 'Conta descartável', $2, true)`,
    [id, `social-integracao-${id}@exemplo.local`],
  )
  if (comUsername) await admin.query("update public.profiles set username = $2 where id = $1", [id, username])
  descartaveis.push({ id, username })
  return { id, username }
}

const get = (cookie: string | undefined, caminho: string) => chamar("GET", `/api/social${caminho}`, { cookie })
const post = (cookie: string | undefined, caminho: string, corpo?: unknown) =>
  chamar("POST", `/api/social${caminho}`, { cookie, corpo })
const del = (cookie: string | undefined, caminho: string) => chamar("DELETE", `/api/social${caminho}`, { cookie })
const patch = (cookie: string | undefined, corpo: unknown) => chamar("PATCH", "/api/social/perfil", { cookie, corpo })

beforeAll(async () => {
  await admin.connect()
  ;[cookieAna, cookieBruno, cookieCarla, cookieDavi] = await Promise.all([
    logar(ana.email, ana.senha),
    logar(bruno.email, bruno.senha),
    logar(carla.email, carla.senha),
    logar(davi.email, davi.senha),
  ])
  bioOriginal = (await admin.query("select bio from public.profiles where id = $1", [ana.id])).rows[0].bio
})

afterAll(async () => {
  await admin.query("update public.profiles set bio = $2, username = 'ana' where id = $1", [ana.id, bioOriginal])
  await admin.query("delete from public.follows where follower_id = any($1) or followee_id = any($1)", [SEED])
  await admin.query("delete from public.search_history where user_id = any($1)", [SEED])
  await admin.query("delete from public.rate_limits where user_id = any($1) and chave = 'seguir'", [SEED])
  await admin.query("delete from auth.users where id = any($1)", [descartaveis.map((d) => d.id)])
  await admin.end()
})

describe("/api/social/perfil (o próprio)", () => {
  it("200: lê o próprio perfil, sem foto até o armazenamento de arquivos voltar", async () => {
    const r = await get(cookieAna, "/perfil")
    expect(r.status).toBe(200)
    expect(r.headers.get("cache-control")).toBe("private, no-store")
    expect((await r.json()).perfil).toMatchObject({ id: ana.id, username: "ana", avatar_url: null, is_public: true })
  })

  it("200: edita a bio; id e avatar_url no corpo não chegam ao banco", async () => {
    const r = await patch(cookieAna, { bio: "Gosto de praia", id: bruno.id, avatar_url: `${ana.id}/x.webp` })
    expect(r.status).toBe(200)
    expect((await r.json()).perfil.bio).toBe("Gosto de praia")
    const { rows } = await admin.query("select avatar_url from public.profiles where id = $1", [ana.id])
    expect(rows[0].avatar_url).toBeNull()
  })

  it("409: username já em uso, sem vazar a mensagem do banco", async () => {
    const r = await patch(cookieAna, { username: "bruno" })
    expect(r.status).toBe(409)
    expect((await r.json()).error).toBe("Esse nome de usuário já está em uso")
  })

  it("400: corpo vazio e username fora do formato; 401 sem sessão", async () => {
    expect((await patch(cookieAna, {})).status).toBe(400)
    expect((await patch(cookieAna, { username: "a b!" })).status).toBe(400)
    expect((await get(undefined, "/perfil")).status).toBe(401)
    expect((await patch(undefined, { bio: "x" })).status).toBe(401)
  })
})

describe("GET /api/social/perfis (busca)", () => {
  it("200: acha por nome ou username, sem quem busca e sem id", async () => {
    const r = await get(cookieAna, "/perfis?busca=teste")
    expect(r.status).toBe(200)
    const { pessoas } = await r.json()
    const nomes = pessoas.map((p: { username: string }) => p.username)
    expect(nomes).toEqual(expect.arrayContaining(["bruno", "carla", "davi"]))
    expect(nomes).not.toContain("ana")
    expect(pessoas[0]).not.toHaveProperty("id")
  })

  it("o username exato vem primeiro", async () => {
    const { pessoas } = await (await get(cookieAna, "/perfis?busca=davi")).json()
    expect(pessoas[0].username).toBe("davi")
  })

  it("400: termo curto demais; 401 sem sessão", async () => {
    expect((await get(cookieAna, "/perfis?busca=a")).status).toBe(400)
    expect((await get(undefined, "/perfis?busca=teste")).status).toBe(401)
  })
})

describe("perfil de outra pessoa, seguir e solicitações", () => {
  it("200: o perfil privado do Bruno é visível, sem vínculo e com contadores", async () => {
    const r = await get(cookieAna, "/perfis/bruno")
    expect(r.status).toBe(200)
    expect((await r.json()).perfil).toEqual({
      username: "bruno",
      full_name: expect.any(String),
      avatar_url: null,
      bio: expect.any(String),
      is_public: false,
      vinculo: "nenhum",
      seguidores: 0,
      seguindo: 0,
      sem_username: false,
    })
  })

  it("404 para username que ninguém usa, 400 fora do formato, 401 sem sessão", async () => {
    expect((await get(cookieAna, `/perfis/ninguem_${SUFIXO}`)).status).toBe(404)
    expect((await get(cookieAna, "/perfis/a")).status).toBe(400)
    expect((await get(undefined, "/perfis/bruno")).status).toBe(401)
  })

  it("seguir perfil privado vira solicitação; o Bruno a vê, aprova, e a Ana passa a seguir", async () => {
    const pedido = await post(cookieAna, "/perfis/bruno/seguir")
    expect(pedido.status).toBe(200)
    expect((await pedido.json()).perfil.vinculo).toBe("solicitado")

    expect(await (await get(cookieBruno, "/solicitacoes?contagem=1")).json()).toEqual({ total: 1 })
    const lista = await (await get(cookieBruno, "/solicitacoes")).json()
    expect(lista).toEqual({ solicitacoes: [{ username: "ana", full_name: expect.any(String), avatar_url: null, is_public: true }], total: 1 })

    expect((await post(cookieBruno, "/solicitacoes/ana")).status).toBe(200)
    expect(await (await post(cookieBruno, "/solicitacoes/ana")).json()).toMatchObject({ codigo: "sem_pendente" })

    const visto = (await (await get(cookieAna, "/perfis/bruno")).json()).perfil
    expect(visto).toMatchObject({ vinculo: "seguindo", seguidores: 1 })
  })

  it("seguir perfil público é imediato; seguir de novo não duplica; deixar de seguir desfaz", async () => {
    expect((await (await post(cookieAna, "/perfis/carla/seguir")).json()).perfil.vinculo).toBe("seguindo")
    expect((await (await post(cookieAna, "/perfis/carla/seguir")).json()).perfil.seguidores).toBe(1)
    expect((await (await del(cookieAna, "/perfis/carla/seguir")).json()).perfil).toMatchObject({ vinculo: "nenhum", seguidores: 0 })
  })

  it("recusar apaga a solicitação, em silêncio", async () => {
    await post(cookieDavi, "/perfis/bruno/seguir")
    expect((await del(cookieBruno, "/solicitacoes/davi")).status).toBe(200)
    const { rows } = await admin.query("select 1 from public.follows where follower_id = $1 and followee_id = $2", [davi.id, bruno.id])
    expect(rows).toHaveLength(0)
  })

  it("400 ao seguir a si mesmo; 404 com código para quem ninguém usa; 401 sem sessão", async () => {
    expect((await post(cookieAna, "/perfis/ana/seguir")).status).toBe(400)
    expect(await (await post(cookieBruno, `/solicitacoes/ninguem_${SUFIXO}`)).json()).toMatchObject({ codigo: "perfil_nao_encontrado" })
    expect((await post(undefined, "/perfis/carla/seguir")).status).toBe(401)
    expect((await get(undefined, "/solicitacoes")).status).toBe(401)
  })

  it("403 com código sem_username: quem não escolheu nome não segue ninguém", async () => {
    const semNome = await novaConta(false)
    await admin.query(
      `insert into auth.accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
       select gen_random_uuid(), $1::text, 'credential', $1::uuid, a.password, now(), now()
         from auth.accounts a where a.user_id = $2 and a.provider_id = 'credential'`,
      [semNome.id, ana.id],
    )
    const cookie = await logar(`social-integracao-${semNome.id}@exemplo.local`, ana.senha)
    const r = await post(cookie, "/perfis/carla/seguir")
    expect(r.status).toBe(403)
    expect((await r.json()).codigo).toBe("sem_username")
  })
})

describe("listas da rede e remover seguidor", () => {
  it("403: quem não segue o perfil privado não vê a rede; a seguidora aceita vê", async () => {
    // A Ana segue o Bruno desde o bloco anterior.
    expect((await get(cookieDavi, "/perfis/bruno/seguidores")).status).toBe(403)
    const r = await get(cookieAna, "/perfis/bruno/seguidores")
    expect(r.status).toBe(200)
    const corpo = await r.json()
    expect(corpo.pessoas.map((p: { username: string }) => p.username)).toEqual(["ana"])
    expect(corpo).toMatchObject({ proximo: null, proprio: false })
  })

  it("paginação: 25 seguidores com a mesma data saem em 20 + 5, em ordem, sem repetir nem pular", async () => {
    const contas = []
    for (let i = 0; i < 25; i++) contas.push(await novaConta())
    // Uma instrução só: o mesmo `now()` para todos, o empate que o cursor precisa desfazer.
    await admin.query(
      `insert into public.follows (follower_id, followee_id) select unnest($1::uuid[]), $2`,
      [contas.map((c) => c.id), carla.id],
    )

    const primeira = await (await get(cookieCarla, "/perfis/carla/seguidores")).json()
    expect(primeira.pessoas).toHaveLength(20)
    expect(primeira.proprio).toBe(true)
    const segunda = await (await get(cookieCarla, `/perfis/carla/seguidores?cursor=${primeira.proximo}`)).json()
    expect(segunda.pessoas).toHaveLength(5)
    expect(segunda.proximo).toBeNull()

    const vistos = [...primeira.pessoas, ...segunda.pessoas].map((p: { username: string }) => p.username)
    expect(vistos).toEqual(contas.map((c) => c.username).sort())
  })

  it("400 cursor_invalido quando a pessoa do cursor saiu da lista", async () => {
    const r = await get(cookieCarla, `/perfis/carla/seguidores?cursor=ninguem_${SUFIXO}`)
    expect(r.status).toBe(400)
    expect((await r.json()).codigo).toBe("cursor_invalido")
  })

  it("seguindo: o lado de quem segue", async () => {
    const { pessoas } = await (await get(cookieAna, "/perfis/ana/seguindo")).json()
    expect(pessoas.map((p: { username: string }) => p.username)).toEqual(["bruno"])
  })

  it("remover seguidor: 200, e de novo 404 nao_e_seguidor; desconhecido é perfil_nao_encontrado", async () => {
    const alvo = descartaveis.find((d) => d.username.startsWith("si_1_"))!.username
    expect((await del(cookieCarla, `/seguidores/${alvo}`)).status).toBe(200)
    expect(await (await del(cookieCarla, `/seguidores/${alvo}`)).json()).toMatchObject({ codigo: "nao_e_seguidor" })
    expect(await (await del(cookieCarla, `/seguidores/ninguem_${SUFIXO}`)).json()).toMatchObject({
      codigo: "perfil_nao_encontrado",
    })
    expect((await del(undefined, `/seguidores/${alvo}`)).status).toBe(401)
  })
})

describe("/api/social/pesquisas (histórico)", () => {
  it("registra no topo, lista sem id, tira uma entrada e limpa tudo", async () => {
    expect((await post(cookieAna, "/pesquisas", { username: "carla", user_id: bruno.id })).status).toBe(200)
    expect((await post(cookieAna, "/pesquisas", { username: "davi" })).status).toBe(200)
    expect((await post(cookieAna, "/pesquisas", { username: "carla" })).status).toBe(200)

    const { recentes } = await (await get(cookieAna, "/pesquisas")).json()
    expect(recentes.map((p: { username: string }) => p.username)).toEqual(["carla", "davi"])
    expect(recentes[0]).not.toHaveProperty("id")
    const { rows } = await admin.query("select user_id from public.search_history where user_id = $1", [bruno.id])
    expect(rows).toHaveLength(0)

    expect((await del(cookieAna, "/pesquisas/carla")).status).toBe(200)
    expect((await (await get(cookieAna, "/pesquisas")).json()).recentes).toHaveLength(1)
    expect((await del(cookieAna, "/pesquisas")).status).toBe(200)
    expect((await (await get(cookieAna, "/pesquisas")).json()).recentes).toEqual([])
  })

  it("400 para o próprio perfil e username fora do formato; 404 para quem ninguém usa; 401", async () => {
    expect((await post(cookieAna, "/pesquisas", { username: "ana" })).status).toBe(400)
    expect((await post(cookieAna, "/pesquisas", { username: "a" })).status).toBe(400)
    expect((await post(cookieAna, "/pesquisas", { username: `ninguem_${SUFIXO}` })).status).toBe(404)
    expect((await get(undefined, "/pesquisas")).status).toBe(401)
  })
})
