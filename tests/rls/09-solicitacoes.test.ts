import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest"
import { type Cliente } from "./apoio"
import { USUARIOS } from "../fixtures/usuarios"
import { logar, naApi, novoCliente } from "./apoio"
import * as repo from "@/api/modulos/social/repositorio"

/**
 * As solicitações para seguir (S05-M-solicitacoes): a Zona 1 da central de
 * Notificações, que são os vínculos `pending` de `follows` em que o dono é o
 * followee. Não há tabela nem policy nova: aqui se prova que a RLS e os grants
 * da S03 (migration 20261007105848) seguram o aprovar e o recusar.
 *
 * Mesmo princípio de 04-social: cada consulta roda com o papel e a identidade de
 * quem a faz (`cliente-sql.ts`). Os auxiliares abaixo chamam o repositório da
 * API (`api/modulos/social/repositorio.ts`) pelo `comoUsuario()` de produção; a
 * rota em si é provada em `tests/integracao/social.test.ts`.
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


const ANA = USUARIOS.ana
const BRUNO = USUARIOS.bruno
const CARLA = USUARIOS.carla

const VIOLA_RLS_OU_GRANT = "42501"

/** As fotos não entram nestes testes: ninguém do seed tem foto. */
const semStorage = null

/**
 * O visitante não passa pela API (ela só age como usuário logado): para ele, a
 * mesma leitura vai direto ao banco com o papel `anon`, e o erro sobe.
 */
async function comoVisitante(cliente: Cliente, dono: string): Promise<never> {
  const { error } = await cliente.from("follows").select("follower_id").eq("followee_id", dono)
  throw error ?? new Error("o visitante leu follows sem erro")
}

async function listarSolicitacoes(cliente: Cliente, _semFotos: null, dono: string) {
  if (cliente.quem.papel === "anon") return comoVisitante(cliente, dono)
  const { perfis, total } = await naApi(cliente, (tx) => repo.listarSolicitacoes(tx, dono))
  return {
    solicitacoes: perfis.map(({ username, full_name, is_public }) => ({ username, full_name, avatar_url: null, is_public })),
    total,
  }
}

async function contarSolicitacoes(cliente: Cliente, dono: string) {
  if (cliente.quem.papel === "anon") return comoVisitante(cliente, dono)
  return naApi(cliente, (tx) => repo.contarSolicitacoes(tx, dono))
}

const aprovarSolicitacao = (cliente: Cliente, dono: string, quemPediu: string) =>
  naApi(cliente, (tx) => repo.resolverSolicitacao(tx, dono, quemPediu, "aprovar"))
const recusarSolicitacao = (cliente: Cliente, dono: string, quemPediu: string) =>
  naApi(cliente, (tx) => repo.resolverSolicitacao(tx, dono, quemPediu, "recusar"))

let ana: Cliente
let bruno: Cliente
let carla: Cliente
let visitante: Cliente
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
async function pedir(cliente: Cliente, de: string, para: string) {
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

  it("quem pediu não fica sem username depois de pedir, e a lista e a contagem não divergem", async () => {
    // Antes da migration 20261110200043, a Ana zerava o próprio username pela Data
    // API, sumia da lista e continuava contando (S05-M-listas, I1). Agora o banco
    // recusa, e a conta sem username nem chega a pedir (tests/rls/11).
    await pedir(carla, idCarla, idBruno)
    const { error } = await ana.from("profiles").update({ username: null }).eq("id", idAna)
    expect(error?.code).toBe("23514")

    const { solicitacoes, total } = await listarSolicitacoes(bruno, semStorage, idBruno)
    expect(solicitacoes.map((s) => s.username).sort()).toEqual(["ana", "carla"])
    expect(total).toBe(2)
    expect(await contarSolicitacoes(bruno, idBruno)).toBe(2)
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

  it("visitante sem sessão não conta: permissão negada, sem número, e a contagem lança em vez de devolver zero", async () => {
    const { error, count } = await visitante
      .from("follows")
      .select("*", { count: "exact", head: true })
      .eq("followee_id", idBruno)
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    expect(count).toBeNull()
    await expect(contarSolicitacoes(visitante, idBruno)).rejects.toBeTruthy()
  })
})
