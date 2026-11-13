import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { Client } from "pg"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"

/**
 * public.meus_convites_pendentes() (S09-F): os convites pendentes do e-mail
 * da sessão, com título, destino e datas da viagem.
 *
 * Ela é SECURITY DEFINER — lê trips por cima da RLS —, então o que se prova é
 * o filtro: só o e-mail da sessão, só pendentes, e só as quatro colunas.
 *
 * @RF04.3 · @RNF02.4
 */

const API = exigirLocal(variavelObrigatoria("API_URL"), "API_URL")
const CHAVE = variavelObrigatoria("ANON_KEY")
const CONEXAO = exigirLocal(variavelObrigatoria("DATABASE_URL"), "DATABASE_URL")
const SENHA = "viajamais123"

function novoCliente() {
  return createClient(API, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } })
}
async function logar(email: string) {
  const cliente = novoCliente()
  const { data, error } = await cliente.auth.signInWithPassword({ email, password: SENHA })
  if (error) throw new Error(`falha ao logar como ${email}: ${error.message}`)
  return { cliente, id: data.user.id }
}

let ana: SupabaseClient, bruno: SupabaseClient, carla: SupabaseClient
let idAna: string
let db: Client
let viagem: string
let viagemRecusada: string
const TITULO = `Convite para a Carla ${Date.now()}`

beforeAll(async () => {
  ;({ cliente: ana, id: idAna } = await logar("teste.a@viajamais.local"))
  ;({ cliente: bruno } = await logar("teste.b@viajamais.local"))
  ;({ cliente: carla } = await logar("teste.c@viajamais.local"))
  db = new Client({ connectionString: CONEXAO })
  await db.connect()

  const base = { user_id: idAna, destination: "Pirenópolis", start_date: "2026-12-01", end_date: "2026-12-05", budget: 5000 }
  const criar = async (title: string) => {
    const { data, error } = await ana.from("trips").insert({ ...base, title }).select("id").single()
    if (error) throw new Error(error.message)
    return data.id as string
  }
  viagem = await criar(TITULO)
  viagemRecusada = await criar(`${TITULO} (recusada)`)

  for (const trip_id of [viagem, viagemRecusada]) {
    const { error } = await ana.from("trip_invitations").insert({ trip_id, inviter_id: idAna, invitee_email: "teste.c@viajamais.local" })
    if (error) throw new Error(error.message)
  }
  const { error } = await carla.from("trip_invitations").update({ status: "declined" }).eq("trip_id", viagemRecusada)
  if (error) throw new Error(error.message)
})

afterAll(async () => {
  await db.query("delete from public.trips where id = any($1)", [[viagem, viagemRecusada]])
  await db.end()
})

describe("meus_convites_pendentes", () => {
  it("a convidada vê o convite com o nome, o destino e as datas da viagem", async () => {
    const { data, error } = await carla.rpc("meus_convites_pendentes")
    expect(error).toBeNull()
    const meu = (data ?? []).find((c: { trip_id: string }) => c.trip_id === viagem)
    expect(meu).toMatchObject({ title: TITULO, destination: "Pirenópolis", start_date: "2026-12-01", end_date: "2026-12-05" })
  })

  it("só as quatro colunas da viagem: nada de orçamento", async () => {
    const { data } = await carla.rpc("meus_convites_pendentes")
    const meu = (data ?? []).find((c: { trip_id: string }) => c.trip_id === viagem)
    expect(Object.keys(meu).sort()).toEqual(["created_at", "destination", "end_date", "id", "start_date", "title", "trip_id"])
  })

  it("convite recusado não aparece", async () => {
    const { data } = await carla.rpc("meus_convites_pendentes")
    expect((data ?? []).map((c: { trip_id: string }) => c.trip_id)).not.toContain(viagemRecusada)
  })

  it("outra pessoa não vê o convite da Carla", async () => {
    const { data } = await bruno.rpc("meus_convites_pendentes")
    expect((data ?? []).map((c: { trip_id: string }) => c.trip_id)).not.toContain(viagem)
  })

  it("visitante sem sessão: 42501", async () => {
    const { error } = await novoCliente().rpc("meus_convites_pendentes")
    expect(error?.code).toBe("42501")
  })

  it("no catálogo: SECURITY DEFINER, search_path vazio, sem EXECUTE para anon", async () => {
    const { rows } = await db.query(`
      select p.prosecdef as definer, p.proconfig as config, has_function_privilege('anon', p.oid, 'execute') as anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'meus_convites_pendentes'`)
    expect(rows).toEqual([{ definer: true, config: ['search_path=""'], anon: false }])
  })
})
