import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"
import { aprovarSolicitacao, contarSolicitacoes, listarSolicitacoes, recusarSolicitacao } from "@/lib/social/solicitacoes"

/**
 * As solicitações para seguir (S05-M-solicitacoes): a Zona 1 da central de
 * Notificações, que são os vínculos `pending` de `follows` em que o dono é o
 * followee. Não há tabela nem policy nova: aqui se prova que a RLS e os grants
 * da S03 (migration 20261007105848) seguram o aprovar e o recusar.
 *
 * Mesmo princípio de 04-social: cada usuário loga de verdade pelo GoTrue com a
 * chave anon e fala com o PostgREST como o navegador. As funções da lib, que as
 * rotas usam, rodam aqui contra o PostgREST de verdade, com a sessão de cada um.
 *
 * O que se prova aqui:
 *   - o dono (Bruno, privado) vê a solicitação da Ana, aprova e recusa;
 *   - quem pediu não se auto-aprova;
 *   - uma terceira pessoa (Carla) não vê, não aprova e não recusa;
 *   - o dono não troca quem pediu nem rebaixa um vínculo aceito;
 *   - visitante sem sessão não lê;
 *   - a lista traz só as pendentes do dono, com o total, sem conta sem username;
 *   - a contagem do sino (head, sem linhas) conta o mesmo que a lista, só do dono.
 *
 * Ana, Bruno e Carla são do seed, sem vínculos entre si, como o seed os deixa.
 *
 * @RF09.3 @RF09.4 @RF13.2 @RNF02.4
 */

const API = exigirLocal(variavelObrigatoria("API_URL"), "API_URL")
const CHAVE = variavelObrigatoria("ANON_KEY")

const ANA = { email: "teste.a@viajamais.local", senha: "viajamais123" }
const BRUNO = { email: "teste.b@viajamais.local", senha: "viajamais123" }
const CARLA = { email: "teste.c@viajamais.local", senha: "viajamais123" }

const VIOLA_RLS_OU_GRANT = "42501"

/** As fotos não entram nestes testes: ninguém do seed tem foto, e o Storage não é chamado. */
const semStorage = () => {
  throw new Error("o Storage não deveria ser chamado: ninguém do seed tem foto")
}

function novoCliente() {
  return createClient(API, CHAVE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function logar(email: string, senha: string) {
  const cliente = novoCliente()
  const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(`falha ao logar como ${email}: ${error.message}`)
  return { cliente, usuario: data.user as User }
}

let ana: SupabaseClient
let bruno: SupabaseClient
let carla: SupabaseClient
let visitante: SupabaseClient
let idAna: string
let idBruno: string
let idCarla: string

/** Só os vínculos entre os três, cada um pelo próprio lado, falhando alto se não conseguir. */
async function limparVinculos() {
  for (const [cliente, id] of [
    [ana, idAna],
    [bruno, idBruno],
    [carla, idCarla],
  ] as const) {
    const outros = [idAna, idBruno, idCarla].filter((o) => o !== id)
    const { error } = await cliente.from("follows").delete().eq("follower_id", id).in("followee_id", outros)
    if (error) throw new Error(`limpeza dos vínculos falhou: ${error.message}`)
  }
}

/** Pede para seguir pelo PostgREST, como a rota de seguir; o status quem decide é o trigger. */
async function pedir(cliente: SupabaseClient, de: string, para: string) {
  const { error } = await cliente.from("follows").insert({ follower_id: de, followee_id: para })
  if (error) throw new Error(`não pediu ${de}→${para}: ${error.message}`)
}

/** O vínculo como o dono o vê. */
async function vinculo(followerId: string, followeeId: string) {
  const { data, error } = await bruno
    .from("follows")
    .select("status")
    .eq("follower_id", followerId)
    .eq("followee_id", followeeId)
    .maybeSingle()
  if (error) throw new Error(`leitura do vínculo falhou: ${error.message}`)
  return data
}

beforeAll(async () => {
  const a = await logar(ANA.email, ANA.senha)
  const b = await logar(BRUNO.email, BRUNO.senha)
  const c = await logar(CARLA.email, CARLA.senha)
  ana = a.cliente
  bruno = b.cliente
  carla = c.cliente
  idAna = a.usuario.id
  idBruno = b.usuario.id
  idCarla = c.usuario.id
  visitante = novoCliente()

  await limparVinculos()
})

beforeEach(async () => {
  await limparVinculos()
  // O Bruno é privado no seed: o pedido da Ana nasce pendente.
  await pedir(ana, idAna, idBruno)
})

afterAll(async () => {
  await limparVinculos()
})

describe("solicitações — o dono resolve as próprias", () => {
  it("o Bruno vê a solicitação da Ana na lista, com o total, e a Ana vê o próprio pedido pendente", async () => {
    expect(await listarSolicitacoes(bruno, semStorage, idBruno)).toEqual({
      solicitacoes: [{ username: "ana", full_name: expect.any(String), avatar_url: null, is_public: true }],
      total: 1,
    })
    const { data } = await ana.from("follows").select("status").eq("follower_id", idAna).eq("followee_id", idBruno)
    expect(data).toEqual([{ status: "pending" }])
  })

  it("o Bruno aprova: o vínculo vira aceito, sai da lista, e aprovar de novo não acha pendente", async () => {
    expect(await aprovarSolicitacao(bruno, idBruno, idAna)).toBe(true)

    expect(await vinculo(idAna, idBruno)).toEqual({ status: "accepted" })
    expect(await listarSolicitacoes(bruno, semStorage, idBruno)).toEqual({ solicitacoes: [], total: 0 })
    expect(await aprovarSolicitacao(bruno, idBruno, idAna)).toBe(false)
  })

  it("o Bruno recusa: a solicitação some, e a Ana pode pedir de novo", async () => {
    expect(await recusarSolicitacao(bruno, idBruno, idAna)).toBe(true)

    expect(await vinculo(idAna, idBruno)).toBeNull()
    expect(await recusarSolicitacao(bruno, idBruno, idAna)).toBe(false)
    await pedir(ana, idAna, idBruno)
    expect(await vinculo(idAna, idBruno)).toEqual({ status: "pending" })
  })

  it("recusar não apaga um vínculo já aceito: para isso existe remover seguidor", async () => {
    expect(await aprovarSolicitacao(bruno, idBruno, idAna)).toBe(true)

    expect(await recusarSolicitacao(bruno, idBruno, idAna)).toBe(false)
    expect(await vinculo(idAna, idBruno)).toEqual({ status: "accepted" })
  })
})

describe("solicitações — ninguém mais resolve", () => {
  it("quem pediu não se auto-aprova: o UPDATE da Ana não acha linha, e o vínculo continua pendente", async () => {
    const { data, error } = await ana
      .from("follows")
      .update({ status: "accepted" })
      .eq("follower_id", idAna)
      .eq("followee_id", idBruno)
      .select("status")
    expect(error).toBeNull()
    expect(data).toEqual([])
    // Nem pela função da rota, com a Ana se passando pelo dono.
    expect(await aprovarSolicitacao(ana, idBruno, idAna)).toBe(false)
    expect(await vinculo(idAna, idBruno)).toEqual({ status: "pending" })
  })

  it("a Carla não vê a solicitação da Ana ao Bruno", async () => {
    const { data, error } = await carla.from("follows").select("status").eq("followee_id", idBruno)
    expect(error).toBeNull()
    expect(data).toEqual([])
    // A lista com o Bruno forjado como dono, na sessão da Carla, vem vazia.
    expect(await listarSolicitacoes(carla, semStorage, idBruno)).toEqual({ solicitacoes: [], total: 0 })
  })

  it("a Carla não aprova nem recusa a solicitação alheia", async () => {
    expect(await aprovarSolicitacao(carla, idBruno, idAna)).toBe(false)
    expect(await recusarSolicitacao(carla, idBruno, idAna)).toBe(false)

    expect(await vinculo(idAna, idBruno)).toEqual({ status: "pending" })
  })

  it("o Bruno não troca quem pediu: o follower_id não é gravável (42501)", async () => {
    const { error } = await bruno
      .from("follows")
      .update({ follower_id: idCarla })
      .eq("follower_id", idAna)
      .eq("followee_id", idBruno)
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    expect(await vinculo(idAna, idBruno)).toEqual({ status: "pending" })
  })

  it("o Bruno não rebaixa um vínculo aceito para pendente (42501)", async () => {
    expect(await aprovarSolicitacao(bruno, idBruno, idAna)).toBe(true)

    const { error } = await bruno
      .from("follows")
      .update({ status: "pending" })
      .eq("follower_id", idAna)
      .eq("followee_id", idBruno)
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    expect(await vinculo(idAna, idBruno)).toEqual({ status: "accepted" })
  })

  it("visitante sem sessão não lê as solicitações", async () => {
    const { data, error } = await visitante.from("follows").select("status").eq("followee_id", idBruno)
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    expect(data).toBeNull()
  })
})

describe("solicitações — a lista do dono", () => {
  it("traz só as pendentes em que ele é o followee, da mais recente, sem vínculo aceito", async () => {
    await pedir(carla, idCarla, idBruno)
    // A Ana é pública: o pedido do Bruno a ela nasce aceito, e não é solicitação de ninguém.
    await pedir(bruno, idBruno, idAna)

    expect(await listarSolicitacoes(bruno, semStorage, idBruno)).toEqual({
      solicitacoes: [
        expect.objectContaining({ username: "carla" }),
        expect.objectContaining({ username: "ana" }),
      ],
      total: 2,
    })
    expect(await listarSolicitacoes(ana, semStorage, idAna)).toEqual({ solicitacoes: [], total: 0 })
  })

  it("conta sem username não aparece nem conta, porque não tem endereço para ser aprovada", async () => {
    await pedir(carla, idCarla, idBruno)
    const { error } = await ana.from("profiles").update({ username: null }).eq("id", idAna)
    expect(error).toBeNull()
    try {
      expect(await listarSolicitacoes(bruno, semStorage, idBruno)).toEqual({
        solicitacoes: [expect.objectContaining({ username: "carla" })],
        total: 1,
      })
      expect(await contarSolicitacoes(bruno, idBruno)).toBe(1)
    } finally {
      const { data, error: erroRestaurar } = await ana.from("profiles").update({ username: "ana" }).eq("id", idAna).select("id")
      if (erroRestaurar || data?.length !== 1) throw new Error(`não restaurou o username da Ana: ${erroRestaurar?.message}`)
    }
  })

  it("a contagem do sino conta só as pendentes do dono, e acompanha aprovar e recusar", async () => {
    // Com o Bruno forjado como dono, na sessão da Carla, a RLS esconde o pedido da
    // Ana. (Depois que a própria Carla pedir, ela passa a ver o dela, de propósito.)
    expect(await contarSolicitacoes(carla, idBruno)).toBe(0)

    await pedir(carla, idCarla, idBruno)
    await pedir(bruno, idBruno, idAna)

    expect(await contarSolicitacoes(bruno, idBruno)).toBe(2)
    // A Ana é pública: o pedido do Bruno a ela nasceu aceito e não conta para ninguém.
    expect(await contarSolicitacoes(ana, idAna)).toBe(0)

    expect(await aprovarSolicitacao(bruno, idBruno, idAna)).toBe(true)
    expect(await contarSolicitacoes(bruno, idBruno)).toBe(1)
    expect(await recusarSolicitacao(bruno, idBruno, idCarla)).toBe(true)
    expect(await contarSolicitacoes(bruno, idBruno)).toBe(0)
  })

  it("visitante sem sessão não conta: 401 sem número, e a função lança em vez de devolver zero", async () => {
    // Com head: true a resposta não tem corpo, então o erro vem sem código: quem diz é o status.
    const { status, count } = await visitante
      .from("follows")
      .select("perfil:profiles!follows_follower_id_fkey!inner(username)", { count: "exact", head: true })
      .eq("followee_id", idBruno)
    expect(status).toBe(401)
    expect(count).toBeNull()
    await expect(contarSolicitacoes(visitante, idBruno)).rejects.toBeTruthy()
  })
})
