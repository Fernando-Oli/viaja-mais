import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { Client } from "pg"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"

/**
 * Limite de requisições por usuário: a tabela public.rate_limits e a função
 * public.consumir_limite() (migration plataforma_rate_limit, S06-F).
 *
 * Cada usuário loga de verdade pelo GoTrue com a chave anon e chama a função
 * pelo PostgREST, como a rota faz com a sessão.
 *
 * O que se prova aqui:
 *   - a função conta: dentro do máximo, permite; a primeira acima, recusa com
 *     retry_after > 0;
 *   - o contador é por usuário: a Ana estourar não afeta o Bruno;
 *   - **exploração bloqueada:** ninguém lê, cria, altera nem apaga
 *     rate_limits pela API — nem a própria linha. Se pudesse, zeraria o próprio
 *     contador e o limite não valeria nada;
 *   - parâmetro fora da faixa é recusado sem gravar;
 *   - visitante sem sessão recebe 42501;
 *   - no catálogo: SECURITY DEFINER, search_path vazio, EXECUTE só para
 *     authenticated e service_role.
 *
 * Cada caso usa uma chave própria (`rls-<caso>-<sufixo>`), para não depender da
 * ordem e não colidir com uma execução anterior na mesma janela.
 *
 * @RNF02.8 @RNF02.4
 */

const API = exigirLocal(variavelObrigatoria("API_URL"), "API_URL")
const CHAVE = variavelObrigatoria("ANON_KEY")
const CONEXAO = exigirLocal(variavelObrigatoria("DATABASE_URL"), "DATABASE_URL")

const ANA = { email: "teste.a@viajamais.local", senha: "viajamais123" }
const BRUNO = { email: "teste.b@viajamais.local", senha: "viajamais123" }

const VIOLA_RLS_OU_GRANT = "42501"
const PARAMETRO_INVALIDO = "22023"

const SUFIXO = Math.random().toString(36).slice(2, 8)
const chave = (caso: string) => `rls-${caso}-${SUFIXO}`

function novoCliente() {
  return createClient(API, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function logar(email: string, senha: string) {
  const cliente = novoCliente()
  const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(`falha ao logar como ${email}: ${error.message}`)
  return { cliente, id: data.user.id }
}

let ana: SupabaseClient
let bruno: SupabaseClient
let visitante: SupabaseClient
let idAna: string
let db: Client

type Veredito = { permitido: boolean; retry_after: number }

async function consumir(cliente: SupabaseClient, p_chave: string, p_maximo: number, p_janela_segundos = 3600) {
  const { data, error } = await cliente.rpc("consumir_limite", { p_chave, p_maximo, p_janela_segundos })
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
  return (data as Veredito[])[0]
}

beforeAll(async () => {
  ;({ cliente: ana, id: idAna } = await logar(ANA.email, ANA.senha))
  ;({ cliente: bruno } = await logar(BRUNO.email, BRUNO.senha))
  visitante = novoCliente()
  db = new Client({ connectionString: CONEXAO })
  await db.connect()
})

afterAll(async () => {
  await db.query("delete from public.rate_limits where chave like $1", [`rls-%-${SUFIXO}`])
  await db.end()
})

describe("consumir_limite — contagem", () => {
  it("permite até o máximo e recusa o seguinte, com retry_after", async () => {
    const k = chave("conta")
    for (let i = 1; i <= 10; i++) {
      expect(await consumir(ana, k, 10), `chamada ${i}`).toEqual({ permitido: true, retry_after: 0 })
    }
    const decima_primeira = await consumir(ana, k, 10)
    expect(decima_primeira.permitido).toBe(false)
    expect(decima_primeira.retry_after).toBeGreaterThan(0)
    expect(decima_primeira.retry_after).toBeLessThanOrEqual(3600)
  })

  it("o contador é por usuário: a Ana estourar não afeta o Bruno", async () => {
    const k = chave("isola")
    await consumir(ana, k, 1)
    expect((await consumir(ana, k, 1)).permitido).toBe(false)

    expect(await consumir(bruno, k, 1)).toEqual({ permitido: true, retry_after: 0 })
  })

  it("a linha gravada é de quem chamou, sempre", async () => {
    const k = chave("dono")
    await consumir(ana, k, 5)
    const { rows } = await db.query("select user_id, contagem from public.rate_limits where chave = $1", [k])
    expect(rows).toEqual([{ user_id: idAna, contagem: 1 }])
  })

  it("janela vencida recomeça a contagem", async () => {
    const k = chave("janela")
    await consumir(ana, k, 1)
    expect((await consumir(ana, k, 1)).permitido).toBe(false)
    // Simula a passagem do tempo: a janela gravada fica no passado.
    await db.query("update public.rate_limits set janela_inicio = janela_inicio - interval '2 hours' where chave = $1", [k])

    expect(await consumir(ana, k, 1)).toEqual({ permitido: true, retry_after: 0 })
  })
})

describe("rate_limits — exploração bloqueada: ninguém zera o próprio contador", () => {
  let k: string

  beforeAll(async () => {
    k = chave("zerar")
    await consumir(ana, k, 1)
    await consumir(ana, k, 1)
  })

  it("SELECT pela API é recusado", async () => {
    const { data, error } = await ana.from("rate_limits").select("*")
    expect(data).toBeNull()
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("UPDATE da própria linha é recusado e a contagem não muda", async () => {
    const { error } = await ana.from("rate_limits").update({ contagem: 1 }).eq("chave", k)
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    const { rows } = await db.query("select contagem from public.rate_limits where chave = $1", [k])
    expect(rows).toEqual([{ contagem: 2 }])
  })

  it("DELETE da própria linha é recusado e a linha continua lá", async () => {
    const { error } = await ana.from("rate_limits").delete().eq("chave", k)
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    const { rows } = await db.query("select count(*)::int as n from public.rate_limits where chave = $1", [k])
    expect(rows).toEqual([{ n: 1 }])
  })

  it("INSERT direto é recusado", async () => {
    const { error } = await ana.from("rate_limits").insert({
      user_id: idAna,
      chave: chave("forjada"),
      janela_inicio: new Date().toISOString(),
      contagem: 1,
    })
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("chamar a função com um máximo enorme não zera nada: o contador só sobe", async () => {
    expect((await consumir(ana, k, 1000)).permitido).toBe(true)
    const { rows } = await db.query("select contagem from public.rate_limits where chave = $1", [k])
    expect(rows).toEqual([{ contagem: 3 }])
    // E a rota, que chama com o próprio máximo, continua recusando.
    expect((await consumir(ana, k, 1)).permitido).toBe(false)
  })

  it("se o grant voltasse, a policy ainda negaria (rodando como authenticated, sem grant revogado)", async () => {
    await db.query("begin")
    try {
      await db.query("grant select, update, delete on public.rate_limits to authenticated")
      await db.query("set local role authenticated")
      await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: idAna, role: "authenticated" })])
      const lidas = await db.query("select * from public.rate_limits")
      const alteradas = await db.query("update public.rate_limits set contagem = 1")
      const apagadas = await db.query("delete from public.rate_limits")
      expect([lidas.rowCount, alteradas.rowCount, apagadas.rowCount]).toEqual([0, 0, 0])
    } finally {
      await db.query("rollback")
    }
  })
})

describe("consumir_limite — entrada e acesso", () => {
  it.each([
    ["máximo zero", { p_chave: "x", p_maximo: 0, p_janela_segundos: 60 }],
    ["máximo acima de 1000", { p_chave: "x", p_maximo: 1001, p_janela_segundos: 60 }],
    ["janela zero", { p_chave: "x", p_maximo: 5, p_janela_segundos: 0 }],
    ["janela acima de um dia", { p_chave: "x", p_maximo: 5, p_janela_segundos: 86401 }],
    ["chave vazia", { p_chave: "", p_maximo: 5, p_janela_segundos: 60 }],
    ["chave com maiúscula", { p_chave: "Convite", p_maximo: 5, p_janela_segundos: 60 }],
    ["chave com 65 caracteres", { p_chave: "a".repeat(65), p_maximo: 5, p_janela_segundos: 60 }],
  ])("%s é recusado sem gravar", async (_caso, args) => {
    const antes = await db.query("select count(*)::int as n from public.rate_limits where user_id = $1", [idAna])
    const { error } = await ana.rpc("consumir_limite", args)
    expect(error?.code).toBe(PARAMETRO_INVALIDO)
    const depois = await db.query("select count(*)::int as n from public.rate_limits where user_id = $1", [idAna])
    expect(depois.rows).toEqual(antes.rows)
  })

  it("visitante sem sessão recebe 42501", async () => {
    const { error } = await visitante.rpc("consumir_limite", { p_chave: "x", p_maximo: 5, p_janela_segundos: 60 })
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("no catálogo: SECURITY DEFINER, search_path vazio e EXECUTE só para authenticated e service_role", async () => {
    const { rows } = await db.query(`
      select p.prosecdef as definer, p.proconfig as config,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
             has_function_privilege('service_role', p.oid, 'execute') as service
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'consumir_limite'
    `)
    expect(rows).toEqual([
      { definer: true, config: ['search_path=""'], anon: false, authenticated: true, service: true },
    ])
  })
})
