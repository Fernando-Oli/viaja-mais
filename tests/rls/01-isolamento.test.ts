import { describe, it, expect, beforeAll } from "vitest"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"

/**
 * Isolamento entre contas, provado com os dois usuários do seed.
 *
 * Os três clientes Supabase da aplicação usam a chave anon, então a RLS é a
 * fronteira real de autorização: o que a policy não bloquear, qualquer usuário
 * autenticado alcança. Testar isso com conexão de superusuário não provaria
 * nada — por isso aqui cada usuário loga de verdade pelo GoTrue e fala com o
 * PostgREST exatamente como o navegador fala.
 *
 * O bloco de escrita é o que costuma faltar: `SELECT` vazio não prova nada se
 * o `INSERT` passa. Existe policy de leitura e não existe de escrita.
 *
 * @RNF02
 */

const API = exigirLocal(variavelObrigatoria("API_URL"), "API_URL")
const CHAVE = variavelObrigatoria("ANON_KEY")

const ANA = { email: "teste.a@viajamais.local", senha: "viajamais123" }
const BRUNO = { email: "teste.b@viajamais.local", senha: "viajamais123" }

async function logar(email: string, senha: string) {
  const cliente = createClient(API, CHAVE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(`falha ao logar como ${email}: ${error.message}`)

  return { cliente, usuario: data.user as User }
}

let ana: SupabaseClient
let bruno: SupabaseClient
let usuarioAna: User
let usuarioBruno: User

/** Dados que pertencem à Ana. O Bruno não pode enxergar nem tocar em nada disto. */
let viagemDaAna: string
let despesaDaAna: string
let reservaDaAna: string
let itemDaAna: string
let lugarDaAna: string

beforeAll(async () => {
  const a = await logar(ANA.email, ANA.senha)
  const b = await logar(BRUNO.email, BRUNO.senha)
  ana = a.cliente
  bruno = b.cliente
  usuarioAna = a.usuario
  usuarioBruno = b.usuario

  const { data: viagem, error: erroViagem } = await ana
    .from("trips")
    .insert({
      user_id: usuarioAna.id,
      title: "Viagem da Ana",
      destination: "Paris",
      start_date: "2026-10-01",
      end_date: "2026-10-10",
    })
    .select()
    .single()
  if (erroViagem) throw new Error(`Ana não conseguiu criar a própria viagem: ${erroViagem.message}`)
  viagemDaAna = viagem.id

  const { data: despesa, error: erroDespesa } = await ana
    .from("expenses")
    .insert({
      trip_id: viagemDaAna,
      user_id: usuarioAna.id,
      title: "Hotel",
      amount: 500,
      category: "accommodation",
      date: "2026-10-02",
    })
    .select()
    .single()
  if (erroDespesa) throw new Error(`Ana não conseguiu criar a própria despesa: ${erroDespesa.message}`)
  despesaDaAna = despesa.id

  const { data: reserva, error: erroReserva } = await ana
    .from("bookings")
    .insert({
      trip_id: viagemDaAna,
      user_id: usuarioAna.id,
      type: "hotel",
      title: "Hotel em Paris",
      start_date: "2026-10-01T14:00:00Z",
    })
    .select()
    .single()
  if (erroReserva) throw new Error(`Ana não conseguiu criar a própria reserva: ${erroReserva.message}`)
  reservaDaAna = reserva.id

  const { data: item, error: erroItem } = await ana
    .from("itinerary_items")
    .insert({ trip_id: viagemDaAna, title: "Louvre", date: "2026-10-03" })
    .select()
    .single()
  if (erroItem) throw new Error(`Ana não conseguiu criar o próprio item: ${erroItem.message}`)
  itemDaAna = item.id

  const { data: lugar, error: erroLugar } = await ana
    .from("places")
    .insert({
      trip_id: viagemDaAna,
      user_id: usuarioAna.id,
      name: "Torre Eiffel",
      latitude: 48.8584,
      longitude: 2.2945,
    })
    .select()
    .single()
  if (erroLugar) throw new Error(`Ana não conseguiu criar o próprio lugar: ${erroLugar.message}`)
  lugarDaAna = lugar.id
})

describe("viagem", () => {
  it("Bruno não lê a viagem da Ana", async () => {
    const { data } = await bruno.from("trips").select("*").eq("id", viagemDaAna)
    expect(data).toEqual([])
  })

  it("Bruno não altera a viagem da Ana", async () => {
    const { data } = await bruno
      .from("trips")
      .update({ title: "sequestrada" })
      .eq("id", viagemDaAna)
      .select()
    expect(data).toEqual([])

    // Confirma pelo lado da dona: o título continua o original.
    const { data: original } = await ana.from("trips").select("title").eq("id", viagemDaAna).single()
    expect(original?.title).toBe("Viagem da Ana")
  })

  it("Bruno não apaga a viagem da Ana", async () => {
    const { data } = await bruno.from("trips").delete().eq("id", viagemDaAna).select()
    expect(data).toEqual([])

    const { data: aindaExiste } = await ana.from("trips").select("id").eq("id", viagemDaAna).single()
    expect(aindaExiste?.id).toBe(viagemDaAna)
  })
})

describe("dados dentro da viagem da Ana", () => {
  const tabelas = ["expenses", "bookings", "itinerary_items", "places"] as const

  it.each(tabelas)("Bruno não lê %s da viagem da Ana", async (tabela) => {
    const { data } = await bruno.from(tabela).select("*").eq("trip_id", viagemDaAna)
    expect(data).toEqual([])
  })

  it("Bruno não cria despesa na viagem da Ana", async () => {
    const { error } = await bruno.from("expenses").insert({
      trip_id: viagemDaAna,
      user_id: usuarioBruno.id,
      title: "despesa injetada",
      amount: 1,
      category: "other",
      date: "2026-10-05",
    })
    expect(error).not.toBeNull()
  })

  it("Bruno não cria reserva na viagem da Ana", async () => {
    const { error } = await bruno.from("bookings").insert({
      trip_id: viagemDaAna,
      user_id: usuarioBruno.id,
      type: "hotel",
      title: "reserva injetada",
      start_date: "2026-10-01T14:00:00Z",
    })
    expect(error).not.toBeNull()
  })

  it("Bruno não cria item de itinerário na viagem da Ana", async () => {
    const { error } = await bruno
      .from("itinerary_items")
      .insert({ trip_id: viagemDaAna, title: "item injetado", date: "2026-10-04" })
    expect(error).not.toBeNull()
  })

  it("Bruno não cria lugar na viagem da Ana", async () => {
    const { error } = await bruno.from("places").insert({
      trip_id: viagemDaAna,
      user_id: usuarioBruno.id,
      name: "lugar injetado",
      latitude: 0,
      longitude: 0,
    })
    expect(error).not.toBeNull()
  })

  it("Bruno não altera a despesa da Ana", async () => {
    const { data } = await bruno
      .from("expenses")
      .update({ amount: 1 })
      .eq("id", despesaDaAna)
      .select()
    expect(data).toEqual([])
  })

  it("Bruno não apaga dados da Ana", async () => {
    for (const [tabela, id] of [
      ["expenses", despesaDaAna],
      ["bookings", reservaDaAna],
      ["itinerary_items", itemDaAna],
      ["places", lugarDaAna],
    ] as const) {
      const { data } = await bruno.from(tabela).delete().eq("id", id).select()
      expect(data, `${tabela} foi apagada por quem não participa da viagem`).toEqual([])
    }
  })
})

describe("participação na viagem", () => {
  it("Bruno não lê a lista de membros da viagem da Ana", async () => {
    const { data } = await bruno.from("trip_members").select("*").eq("trip_id", viagemDaAna)
    expect(data).toEqual([])
  })

  it("Bruno não convida ninguém para a viagem da Ana", async () => {
    const { error } = await bruno.from("trip_invitations").insert({
      trip_id: viagemDaAna,
      inviter_id: usuarioBruno.id,
      invitee_email: "invasor@viajamais.local",
    })
    expect(error).not.toBeNull()
  })

  // Escalada de privilégio: se o Bruno puder inserir a própria linha em
  // trip_members, ele vira participante da viagem alheia — e a partir daí
  // `can_access_trip` passa a devolver true e todo o resto acima cai junto.
  it("Bruno não se auto-adiciona como membro da viagem da Ana", async () => {
    const { error } = await bruno
      .from("trip_members")
      .insert({ trip_id: viagemDaAna, user_id: usuarioBruno.id, role: "member" })

    if (!error) {
      await bruno.from("trip_members").delete().eq("trip_id", viagemDaAna).eq("user_id", usuarioBruno.id)
    }

    expect(error, "qualquer usuário autenticado consegue entrar em qualquer viagem").not.toBeNull()
  })
})

/**
 * Estes casos ficam por último de propósito: aqui o Bruno vira membro de
 * verdade, convidado pela dona. A partir daqui ele *deve* enxergar a viagem —
 * o que se prova é que virar membro não é virar dono.
 */
describe("membro legítimo", () => {
  beforeAll(async () => {
    const { error } = await ana
      .from("trip_members")
      .insert({ trip_id: viagemDaAna, user_id: usuarioBruno.id, role: "member" })
    if (error) throw new Error(`Ana não conseguiu adicionar Bruno à própria viagem: ${error.message}`)
  })

  it("Bruno passa a enxergar a viagem depois de adicionado", async () => {
    // Guarda contra correção exagerada: fechar o buraco não pode quebrar o
    // compartilhamento, que é a razão de existir da viagem em grupo.
    const { data } = await bruno.from("trips").select("id").eq("id", viagemDaAna)
    expect(data).toHaveLength(1)
  })

  it("Bruno não se promove a dono da viagem da Ana", async () => {
    const { data } = await bruno
      .from("trip_members")
      .update({ role: "owner" })
      .eq("trip_id", viagemDaAna)
      .eq("user_id", usuarioBruno.id)
      .select()
    expect(data).toEqual([])

    const { data: papel } = await ana
      .from("trip_members")
      .select("role")
      .eq("trip_id", viagemDaAna)
      .eq("user_id", usuarioBruno.id)
      .single()
    expect(papel?.role).toBe("member")
  })

  it("Bruno continua podendo sair da viagem por conta própria", async () => {
    // Sair é DELETE da própria linha e deve continuar permitido — do contrário
    // a pessoa fica presa na viagem de outra.
    const { data } = await bruno
      .from("trip_members")
      .delete()
      .eq("trip_id", viagemDaAna)
      .eq("user_id", usuarioBruno.id)
      .select()
    expect(data).toHaveLength(1)
  })
})
