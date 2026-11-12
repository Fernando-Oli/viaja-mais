import { describe, it, expect, beforeAll } from "vitest"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"
import { entrarPorConvite } from "./convite"

/**
 * Avaliações de lugares (`place_reviews`).
 *
 * A leitura é aberta a qualquer autenticado por decisão do catálogo (RF11), então
 * o isolamento que este arquivo prova é o de **escrita**: só avalia quem tem o
 * lugar salvo numa viagem de que participa, e cada um mexe só na própria nota.
 * O teste da leitura de B sobre a nota de A existe para registrar que ela é
 * intencional — se alguém fechar a policy de SELECT, ele cai e a decisão volta
 * para a mesa.
 *
 * @RF11.1 avaliar · @RF11.2 ver avaliações de outros · @RF11.3 editar/excluir a própria
 * @RNF02.4 isolamento
 */

const API = exigirLocal(variavelObrigatoria("API_URL"), "API_URL")
const CHAVE = variavelObrigatoria("ANON_KEY")

const ANA = { email: "teste.a@viajamais.local", senha: "viajamais123" }
const BRUNO = { email: "teste.b@viajamais.local", senha: "viajamais123" }

/** Violação de policy ou de grant: o PostgREST devolve 42501 para os dois. */
const VIOLA_RLS_OU_GRANT = "42501"
const VIOLA_UNIQUE = "23505"
const VIOLA_CHECK = "23514"

function novoCliente() {
  return createClient(API, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function logar(email: string, senha: string) {
  const cliente = novoCliente()
  const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(`falha ao logar como ${email}: ${error.message}`)
  return { cliente, usuario: data.user as User }
}

let ana: SupabaseClient
let bruno: SupabaseClient
let usuarioAna: User
let usuarioBruno: User
let viagemDaAna: string
let idAvaliacaoDaAna: string

// Identificador do Google único por execução: a suíte roda sobre o banco do
// seed sem reset entre execuções, e a unique (lugar, pessoa) recusaria a
// segunda rodada.
const LUGAR = `rls-avaliacao-${Date.now()}`

beforeAll(async () => {
  const a = await logar(ANA.email, ANA.senha)
  const b = await logar(BRUNO.email, BRUNO.senha)
  ana = a.cliente
  bruno = b.cliente
  usuarioAna = a.usuario
  usuarioBruno = b.usuario

  const { data: trip, error: erroViagem } = await ana
    .from("trips")
    .insert({
      user_id: usuarioAna.id,
      title: "Viagem das avaliações",
      destination: "Recife",
      start_date: "2026-12-01",
      end_date: "2026-12-05",
    })
    .select()
    .single()
  if (erroViagem) throw new Error(`Ana não criou a viagem: ${erroViagem.message}`)
  viagemDaAna = trip.id

  const { error: erroLugar } = await ana.from("places").insert({
    trip_id: viagemDaAna,
    user_id: usuarioAna.id,
    name: "Marco Zero",
    latitude: -8.063,
    longitude: -34.871,
    place_id: LUGAR,
  })
  if (erroLugar) throw new Error(`Ana não salvou o lugar: ${erroLugar.message}`)
})

describe("place_reviews — quem pode avaliar", () => {
  it("A avalia um lugar salvo numa viagem dela", async () => {
    const { data, error } = await ana
      .from("place_reviews")
      .insert({ google_place_id: LUGAR, place_name: "Marco Zero", user_id: usuarioAna.id, rating: 4, comment: "Vista linda" })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.rating).toBe(4)
    idAvaliacaoDaAna = data!.id
  })

  it("A não avalia o mesmo lugar duas vezes", async () => {
    const { error } = await ana
      .from("place_reviews")
      .insert({ google_place_id: LUGAR, place_name: "Marco Zero", user_id: usuarioAna.id, rating: 2 })

    expect(error?.code).toBe(VIOLA_UNIQUE)
  })

  it("B, sem o lugar em viagem nenhuma, não avalia", async () => {
    const { error } = await bruno
      .from("place_reviews")
      .insert({ google_place_id: LUGAR, place_name: "Marco Zero", user_id: usuarioBruno.id, rating: 1 })

    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("B não grava avaliação em nome de A", async () => {
    const { error } = await bruno
      .from("place_reviews")
      .insert({ google_place_id: LUGAR, place_name: "Marco Zero", user_id: usuarioAna.id, rating: 1 })

    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })
})

describe("place_reviews — leitura", () => {
  it("B lê a avaliação de A (pública a autenticados, por decisão do RF11)", async () => {
    const { data, error } = await bruno.from("place_reviews").select("id, rating, user_id").eq("google_place_id", LUGAR)

    expect(error).toBeNull()
    expect(data).toEqual([{ id: idAvaliacaoDaAna, rating: 4, user_id: usuarioAna.id }])
  })

  it("anônimo não lê nada", async () => {
    const { data, error } = await novoCliente().from("place_reviews").select("id").eq("google_place_id", LUGAR)

    // 42501 e não lista vazia: é o revoke de anon que está sendo provado.
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    expect(data).toBeNull()
  })
})

describe("place_reviews — editar e excluir", () => {
  it("B não edita a avaliação de A", async () => {
    const { data, error } = await bruno.from("place_reviews").update({ rating: 1 }).eq("id", idAvaliacaoDaAna).select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const { data: depois } = await ana.from("place_reviews").select("rating").eq("id", idAvaliacaoDaAna).single()
    expect(depois?.rating).toBe(4)
  })

  it("B não exclui a avaliação de A", async () => {
    const { data, error } = await bruno.from("place_reviews").delete().eq("id", idAvaliacaoDaAna).select()

    expect(error).toBeNull()
    expect(data).toEqual([])

    const { data: depois } = await ana.from("place_reviews").select("id").eq("id", idAvaliacaoDaAna)
    expect(depois).toHaveLength(1)
  })

  it("A não move a própria avaliação para outro lugar", async () => {
    const { error } = await ana
      .from("place_reviews")
      .update({ google_place_id: "lugar-que-a-nunca-salvou" })
      .eq("id", idAvaliacaoDaAna)

    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("A não passa a própria avaliação para o nome de B", async () => {
    const { error } = await ana.from("place_reviews").update({ user_id: usuarioBruno.id }).eq("id", idAvaliacaoDaAna)

    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("nota fora de 1 a 5 é recusada pelo banco", async () => {
    const zero = await ana.from("place_reviews").update({ rating: 0 }).eq("id", idAvaliacaoDaAna)
    const seis = await ana.from("place_reviews").update({ rating: 6 }).eq("id", idAvaliacaoDaAna)

    expect(zero.error?.code).toBe(VIOLA_CHECK)
    expect(seis.error?.code).toBe(VIOLA_CHECK)
  })

  it("A edita a própria nota e o comentário", async () => {
    const { data, error } = await ana
      .from("place_reviews")
      .update({ rating: 5, comment: "Melhor ainda à noite" })
      .eq("id", idAvaliacaoDaAna)
      .select()
      .single()

    expect(error).toBeNull()
    expect(data).toMatchObject({ rating: 5, comment: "Melhor ainda à noite" })
  })
})

describe("place_reviews — o predicado é participação", () => {
  it("B passa a poder avaliar depois de entrar na viagem que tem o lugar", async () => {
    await entrarPorConvite({
      dona: ana,
      idDona: usuarioAna.id,
      convidado: bruno,
      idConvidado: usuarioBruno.id,
      emailConvidado: BRUNO.email,
      tripId: viagemDaAna,
    })

    const { data, error } = await bruno
      .from("place_reviews")
      .insert({ google_place_id: LUGAR, place_name: "Marco Zero", user_id: usuarioBruno.id, rating: 3 })
      .select()
      .single()

    expect(error).toBeNull()
    expect(data?.user_id).toBe(usuarioBruno.id)
  })

  it("A exclui a própria avaliação", async () => {
    const { data, error } = await ana.from("place_reviews").delete().eq("id", idAvaliacaoDaAna).select("id")

    expect(error).toBeNull()
    expect(data).toEqual([{ id: idAvaliacaoDaAna }])
  })
})
