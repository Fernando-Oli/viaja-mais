import { describe, it, expect, beforeAll } from "vitest"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"
import { entrarPorConvite } from "./convite"

/**
 * As três explorações que a S03-M reproduziu na plataforma, bloqueadas pela
 * migration `plataforma_membros_por_convite_e_cadastro`. Cada teste prova a
 * exploração **falhando**, não o caminho feliz — e o caminho feliz legítimo
 * (aceitar convite) é provado ao lado, para a correção não fechar demais.
 *
 * @RNF02.4 RLS por operação · @RF04.3 entrar na viagem é aceitar o convite
 * @RF01.1 cadastro com e-mail e senha
 */

const API = exigirLocal(variavelObrigatoria("API_URL"), "API_URL")
const CHAVE = variavelObrigatoria("ANON_KEY")

const ANA = { email: "teste.a@viajamais.local", senha: "viajamais123" }
const BRUNO = { email: "teste.b@viajamais.local", senha: "viajamais123" }

function cliente() {
  return createClient(API, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } })
}

async function logar(email: string, senha: string) {
  const c = cliente()
  const { data, error } = await c.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(`falha ao logar como ${email}: ${error.message}`)
  return { cliente: c, usuario: data.user as User }
}

let ana: SupabaseClient
let bruno: SupabaseClient
let usuarioAna: User
let usuarioBruno: User

async function viagemDaAna(titulo: string) {
  const { data, error } = await ana
    .from("trips")
    .insert({
      user_id: usuarioAna.id,
      title: titulo,
      destination: "Recife",
      start_date: "2027-01-10",
      end_date: "2027-01-15",
    })
    .select("id")
    .single()
  if (error) throw new Error(`Ana não criou "${titulo}": ${error.message}`)
  return data.id as string
}

beforeAll(async () => {
  const a = await logar(ANA.email, ANA.senha)
  const b = await logar(BRUNO.email, BRUNO.senha)
  ana = a.cliente
  bruno = b.cliente
  usuarioAna = a.usuario
  usuarioBruno = b.usuario
})

describe("entrar numa viagem é aceitar um convite", () => {
  it("a dona não põe o Bruno na viagem sem convite, e a viagem não aparece para ele", async () => {
    const tripId = await viagemDaAna("Viagem que o Bruno nunca aceitou")

    const { error } = await ana
      .from("trip_members")
      .insert({ trip_id: tripId, user_id: usuarioBruno.id, role: "member" })
    expect(error, "a dona inseriu um membro sem convite").not.toBeNull()

    const { data } = await bruno.from("trips").select("id").eq("id", tripId)
    expect(data).toEqual([])
  })

  it("a dona também não o põe quando há convite pendente: quem aceita é ele", async () => {
    const tripId = await viagemDaAna("Convite pendente")
    await ana
      .from("trip_invitations")
      .insert({ trip_id: tripId, inviter_id: usuarioAna.id, invitee_email: BRUNO.email })

    const { error } = await ana
      .from("trip_members")
      .insert({ trip_id: tripId, user_id: usuarioBruno.id, role: "member" })
    expect(error).not.toBeNull()
  })

  it("com convite recusado, o Bruno não entra", async () => {
    const tripId = await viagemDaAna("Convite recusado")
    const { data: convite } = await ana
      .from("trip_invitations")
      .insert({ trip_id: tripId, inviter_id: usuarioAna.id, invitee_email: BRUNO.email })
      .select("id")
      .single()
    await bruno.from("trip_invitations").update({ status: "declined" }).eq("id", convite!.id)

    const { error } = await bruno
      .from("trip_members")
      .insert({ trip_id: tripId, user_id: usuarioBruno.id, role: "member" })
    expect(error).not.toBeNull()
  })

  it("com convite pendente, o Bruno aceita e passa a ver a viagem", async () => {
    const tripId = await viagemDaAna("Convite aceito")

    await entrarPorConvite({
      dona: ana,
      idDona: usuarioAna.id,
      convidado: bruno,
      idConvidado: usuarioBruno.id,
      emailConvidado: BRUNO.email,
      tripId,
    })

    const { data } = await bruno.from("trips").select("id").eq("id", tripId)
    expect(data).toHaveLength(1)
  })

  it("criar viagem continua pondo a dona como membro", async () => {
    const tripId = await viagemDaAna("Dona é membro")

    const { data } = await ana
      .from("trip_members")
      .select("role")
      .eq("trip_id", tripId)
      .eq("user_id", usuarioAna.id)
      .single()
    expect(data?.role).toBe("owner")
  })
})

describe("as funções de participação só respondem sobre quem pergunta", () => {
  let tripId: string

  beforeAll(async () => {
    tripId = await viagemDaAna("Viagem consultada por RPC")
  })

  it("visitante sem login não descobre que a Ana participa da viagem", async () => {
    const visitante = cliente()
    for (const funcao of ["is_trip_member", "is_trip_owner", "can_access_trip"]) {
      const { data } = await visitante.rpc(funcao, { trip_uuid: tripId, user_uuid: usuarioAna.id })
      expect(data, `${funcao} respondeu sobre a Ana a um visitante`).not.toBe(true)
    }
  })

  it("o Bruno logado não descobre que a Ana é dona da viagem", async () => {
    for (const funcao of ["is_trip_member", "is_trip_owner", "can_access_trip"]) {
      const { data } = await bruno.rpc(funcao, { trip_uuid: tripId, user_uuid: usuarioAna.id })
      expect(data, `${funcao} respondeu sobre a Ana ao Bruno`).not.toBe(true)
    }
  })

  it("sobre si mesma, a Ana recebe a resposta certa", async () => {
    const { data } = await ana.rpc("is_trip_owner", { trip_uuid: tripId, user_uuid: usuarioAna.id })
    expect(data).toBe(true)
  })
})

describe("cadastro com nome longo", () => {
  it("cria a conta e guarda os 120 primeiros caracteres do nome", async () => {
    const novo = cliente()
    const nome = "N".repeat(121)
    const email = `nome-longo-${Date.now()}@viajamais.local`

    const { data, error } = await novo.auth.signUp({
      email,
      password: "viajamais123",
      options: { data: { full_name: nome } },
    })
    expect(error, "o cadastro falhou por causa do nome").toBeNull()

    const { data: perfil } = await novo.from("profiles").select("full_name").eq("id", data.user!.id).single()
    expect(perfil?.full_name).toBe(nome.slice(0, 120))
  })
})
