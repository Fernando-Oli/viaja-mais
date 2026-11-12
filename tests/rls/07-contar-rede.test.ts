import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { Client } from "pg"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"

/**
 * Os contadores do perfil de outra pessoa (S05-M-seguir): a função
 * public.contar_rede(perfil), que devolve quantos seguidores e quantos seguidos
 * aceitos alguém tem.
 *
 * Mesmo princípio de 04-social: cada usuário loga de verdade pelo GoTrue com a
 * chave anon e chama a função pelo PostgREST, como a rota faz com a sessão.
 *
 * O que se prova aqui:
 *   - por que a função existe: pela RLS, um terceiro não enxerga um vínculo
 *     entre dois perfis privados, e contar com a sessão dele dá errado;
 *   - ela conta só os aceitos: a solicitação pendente não entra, e aprovar faz o
 *     número subir;
 *   - devolve só os dois números, e o mesmo para o dono e para um terceiro;
 *   - UUID que ninguém usa dá zero e zero: a função não distingue conta que não
 *     existe de conta sem vínculos aceitos (e, para quem tem sessão, profiles
 *     já é legível, então não há oráculo novo);
 *   - visitante sem sessão recebe 42501 (o EXECUTE saiu de anon), e, se o grant
 *     um dia voltar, o corpo da função ainda não devolve nada sem auth.uid();
 *   - no catálogo: SECURITY DEFINER, STABLE, search_path vazio e EXECUTE só
 *     para authenticated.
 *
 * Ana é pública, Bruno é privado, Carla é a terceira (seed).
 *
 * @RF02.8 @RNF02.4
 */

const API = exigirLocal(variavelObrigatoria("API_URL"), "API_URL")
const CHAVE = variavelObrigatoria("ANON_KEY")
// Conexão direta só para o catálogo e para chamar a função como authenticated
// sem sessão, numa transação desfeita no fim.
const CONEXAO = exigirLocal(variavelObrigatoria("DATABASE_URL"), "DATABASE_URL")

const ANA = { email: "teste.a@viajamais.local", senha: "viajamais123" }
const BRUNO = { email: "teste.b@viajamais.local", senha: "viajamais123" }
const CARLA = { email: "teste.c@viajamais.local", senha: "viajamais123" }

const VIOLA_RLS_OU_GRANT = "42501"
const NINGUEM = "00000000-0000-4000-8000-000000000000"

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
let db: Client
let idAna: string
let idBruno: string
let idCarla: string

/** Cada um apaga todo vínculo em que é parte — a policy de DELETE permite. */
async function limparVinculos() {
  for (const [cliente, id] of [
    [ana, idAna],
    [bruno, idBruno],
    [carla, idCarla],
  ] as const) {
    const { error } = await cliente.from("follows").delete().or(`follower_id.eq.${id},followee_id.eq.${id}`)
    if (error) throw new Error(`limpeza dos vínculos falhou: ${error.message}`)
  }
}

/**
 * Muda o próprio perfil, falhando alto se não conseguir (o mesmo de 04-social).
 * Confere a linha que voltou: um update que não acha a linha não dá erro, e um
 * perfil não restaurado quebraria a rodada seguinte longe da causa.
 */
async function restaurarPerfil(cliente: SupabaseClient, id: string, valores: Record<string, unknown>) {
  const { data, error } = await cliente.from("profiles").update(valores).eq("id", id).select("id")
  if (error || data?.length !== 1) {
    throw new Error(`não gravou ${JSON.stringify(valores)} no perfil ${id}: ${error?.message ?? "nenhuma linha"}`)
  }
}

/** A chamada da rota: uma linha, com os dois números. */
async function contar(cliente: SupabaseClient, perfil: string) {
  const { data, error } = await cliente.rpc("contar_rede", { perfil }).single()
  if (error) throw new Error(`contar_rede(${perfil}) falhou: ${error.message}`)
  return data as { seguidores: number; seguindo: number }
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

  db = new Client({ connectionString: CONEXAO })
  await db.connect()

  await limparVinculos()
})

afterAll(async () => {
  await limparVinculos()
  await db.end()
})

describe("contar_rede — só os aceitos, os mesmos números para todos", () => {
  it("Carla solicita ao Bruno (privado): a solicitação pendente não conta", async () => {
    const { error } = await carla.from("follows").insert({ follower_id: idCarla, followee_id: idBruno })
    expect(error).toBeNull()

    expect(await contar(ana, idBruno)).toEqual({ seguidores: 0, seguindo: 0 })
    expect(await contar(ana, idCarla)).toEqual({ seguidores: 0, seguindo: 0 })
  })

  it("Bruno aprova, e os números sobem para quem quer que conte", async () => {
    const { data, error } = await bruno
      .from("follows")
      .update({ status: "accepted" })
      .eq("follower_id", idCarla)
      .eq("followee_id", idBruno)
      .select("status")
    expect(error).toBeNull()
    expect(data).toEqual([{ status: "accepted" }])

    expect(await contar(ana, idBruno)).toEqual({ seguidores: 1, seguindo: 0 })
    expect(await contar(ana, idCarla)).toEqual({ seguidores: 0, seguindo: 1 })
  })

  it("por que a função existe: entre dois perfis privados, a RLS esconde o vínculo da Ana, e a contagem daria zero", async () => {
    // Com a Carla pública, Carla→Bruno aparece na lista de seguidos dela, e a
    // Ana o vê (o comportamento do Instagram, em 04-social). O vínculo só some
    // para um terceiro quando os dois lados são privados: a Carla fica privada
    // aqui e volta a pública no fim.
    await restaurarPerfil(carla, idCarla, { is_public: false })
    try {
      const { count, error } = await ana
        .from("follows")
        .select("follower_id", { count: "exact", head: true })
        .eq("followee_id", idBruno)
        .eq("status", "accepted")
      expect(error).toBeNull()
      expect(count, "a Ana não segue nem o Bruno nem a Carla, os dois privados").toBe(0)
      expect(await contar(ana, idBruno)).toEqual({ seguidores: 1, seguindo: 0 })
      expect(await contar(ana, idCarla)).toEqual({ seguidores: 0, seguindo: 1 })
    } finally {
      await restaurarPerfil(carla, idCarla, { is_public: true })
    }
  })

  it("o dono e um terceiro recebem a mesma linha, só com os dois números", async () => {
    const { data, error } = await ana.rpc("contar_rede", { perfil: idBruno })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(Object.keys(data![0]).sort()).toEqual(["seguidores", "seguindo"])

    expect(await contar(bruno, idBruno)).toEqual(await contar(ana, idBruno))
  })

  it("UUID que ninguém usa dá zero e zero, como uma conta sem vínculos", async () => {
    expect(await contar(ana, NINGUEM)).toEqual({ seguidores: 0, seguindo: 0 })
  })
})

describe("contar_rede — quem pode chamar", () => {
  it("visitante sem sessão recebe 42501, e não números", async () => {
    for (const perfil of [idAna, idBruno]) {
      const { data, error } = await visitante.rpc("contar_rede", { perfil })
      expect(error?.code, "anon não pode ter EXECUTE em contar_rede").toBe(VIOLA_RLS_OU_GRANT)
      expect(data).toBeNull()
    }
  })

  it("sem auth.uid(), o corpo não devolve linha, mesmo com EXECUTE (a segunda barreira)", async () => {
    await db.query("begin")
    try {
      await db.query("set local role authenticated")
      const { rows } = await db.query("select * from public.contar_rede($1)", [idBruno])
      expect(rows).toEqual([])
    } finally {
      await db.query("rollback")
    }
  })

  it("no catálogo: SECURITY DEFINER, STABLE, search_path vazio, EXECUTE só para authenticated", async () => {
    // service_role também fica sem EXECUTE: sem sessão a função não responde, e
    // o grant só esconderia o erro de quem a chamasse com a chave de serviço.
    const { rows } = await db.query(
      `select p.prosecdef, p.provolatile, p.proconfig,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('service_role', p.oid, 'execute') as servico,
              has_function_privilege('authenticated', p.oid, 'execute') as autenticado
         from pg_proc p
        where p.oid = 'public.contar_rede(uuid)'::regprocedure`,
    )
    expect(rows).toEqual([
      { prosecdef: true, provolatile: "s", proconfig: ['search_path=""'], anon: false, servico: false, autenticado: true },
    ])
  })
})
