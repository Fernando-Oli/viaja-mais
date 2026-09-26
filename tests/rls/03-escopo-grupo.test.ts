import { describe, it, expect, beforeAll } from "vitest"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"
import { selecaoPorViagem, selecaoDeViagens, FILTRO_POR_VIAGEM, FILTRO_EM_VIAGENS } from "@/lib/trips/escopo"

/**
 * O convidado enxerga o que é do grupo.
 *
 * Os outros arquivos desta pasta provam o lado negativo — quem não participa
 * não lê nem escreve. Este prova o lado positivo, que é o que estava quebrado:
 * as telas filtravam por `user_id`, então o convidado entrava na viagem e via
 * "nenhuma despesa" com o grupo tendo lançado várias.
 *
 * As consultas aqui usam **as mesmas funções que as telas usam**, de propósito.
 * Um teste que remontasse a string à mão passaria mesmo depois de alguém apagar
 * o `!inner` do `lib/trips/escopo.ts` — e é justamente esse apagão silencioso
 * que precisa ser pego.
 *
 * @RF04.4 os membros visualizam a viagem e seus dados
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

/** Viagem da Ana em que o Bruno foi aceito. */
let compartilhada: string
/** Viagem da Ana em que o Bruno não entrou. */
let particular: string

const TITULO_COMPARTILHADO = "Hotel do grupo"
const TITULO_PARTICULAR = "Hotel que o Bruno não vê"

beforeAll(async () => {
  const a = await logar(ANA.email, ANA.senha)
  const b = await logar(BRUNO.email, BRUNO.senha)
  ana = a.cliente
  bruno = b.cliente
  usuarioAna = a.usuario
  usuarioBruno = b.usuario

  async function viagem(titulo: string) {
    const { data, error } = await ana
      .from("trips")
      .insert({
        user_id: usuarioAna.id,
        title: titulo,
        destination: "Porto",
        start_date: "2026-12-01",
        end_date: "2026-12-10",
      })
      .select()
      .single()
    if (error) throw new Error(`Ana não criou "${titulo}": ${error.message}`)
    return data.id as string
  }

  /** Uma despesa, uma reserva e um lugar — as três telas desta atividade. */
  async function povoar(tripId: string, marcador: string) {
    const erros = [
      await ana.from("expenses").insert({
        trip_id: tripId,
        user_id: usuarioAna.id,
        title: marcador,
        amount: 200,
        category: "accommodation",
        date: "2026-12-02",
      }),
      await ana.from("bookings").insert({
        trip_id: tripId,
        user_id: usuarioAna.id,
        type: "hotel",
        title: marcador,
        start_date: "2026-12-01T14:00:00Z",
      }),
      await ana.from("places").insert({
        trip_id: tripId,
        user_id: usuarioAna.id,
        name: marcador,
        latitude: 41.1579,
        longitude: -8.6291,
      }),
    ].filter((r) => r.error)

    if (erros.length > 0) throw new Error(`Ana não povoou a viagem: ${erros[0].error?.message}`)
  }

  compartilhada = await viagem("Viagem compartilhada")
  particular = await viagem("Viagem particular da Ana")

  const { error } = await ana.from("trip_members").insert({
    trip_id: compartilhada,
    user_id: usuarioBruno.id,
    role: "member",
  })
  if (error) throw new Error(`Ana não adicionou o Bruno: ${error.message}`)

  await povoar(compartilhada, TITULO_COMPARTILHADO)
  await povoar(particular, TITULO_PARTICULAR)
})

describe("o convidado enxerga o que é do grupo", () => {
  it("vê a viagem compartilhada na lista, e não a particular", async () => {
    const { data, error } = await bruno
      .from("trips")
      .select(selecaoDeViagens())
      .eq(FILTRO_EM_VIAGENS, usuarioBruno.id)

    expect(error).toBeNull()
    const titulos = (data ?? []).map((t) => t.title)
    expect(titulos).toContain("Viagem compartilhada")
    expect(titulos).not.toContain("Viagem particular da Ana")
  })

  it("vê a despesa que a Ana lançou", async () => {
    // Era isto que quebrava: o filtro por `user_id` devolvia zero despesas ao
    // Bruno, e o total da viagem aparecia errado para ele.
    const { data, error } = await bruno
      .from("expenses")
      .select(selecaoPorViagem("title, currency"))
      .eq(FILTRO_POR_VIAGEM, usuarioBruno.id)

    expect(error).toBeNull()
    const titulos = (data ?? []).map((e) => e.title)
    expect(titulos).toContain(TITULO_COMPARTILHADO)
    expect(titulos).not.toContain(TITULO_PARTICULAR)
  })

  it("vê a reserva que a Ana cadastrou", async () => {
    const { data, error } = await bruno
      .from("bookings")
      .select(selecaoPorViagem("title, destination"))
      .eq(FILTRO_POR_VIAGEM, usuarioBruno.id)

    expect(error).toBeNull()
    const titulos = (data ?? []).map((b) => b.title)
    expect(titulos).toContain(TITULO_COMPARTILHADO)
    expect(titulos).not.toContain(TITULO_PARTICULAR)
  })

  it("vê o lugar que a Ana salvou", async () => {
    const { data, error } = await bruno
      .from("places")
      .select(selecaoPorViagem("title, destination"))
      .eq(FILTRO_POR_VIAGEM, usuarioBruno.id)

    expect(error).toBeNull()
    const nomes = (data ?? []).map((l) => l.name)
    expect(nomes).toContain(TITULO_COMPARTILHADO)
    expect(nomes).not.toContain(TITULO_PARTICULAR)
  })
})

describe("o escopo não vira porta dos fundos", () => {
  it("a mesma consulta não devolve dado de viagem alheia", async () => {
    // O escopo amplia o que o membro vê; não pode ampliar o que qualquer
    // autenticado vê. Aqui o Bruno pede explicitamente pelo id da viagem
    // particular da Ana — e continua sem alcançá-la.
    const { data } = await bruno
      .from("expenses")
      .select(selecaoPorViagem("title, currency"))
      .eq(FILTRO_POR_VIAGEM, usuarioBruno.id)
      .eq("trip_id", particular)

    expect(data).toEqual([])
  })

  it("nem sem o filtro de participação, porque a RLS é a segunda linha", async () => {
    // Se alguém apagar o `.eq(...)` da tela por engano, quem segura é a RLS.
    const { data } = await bruno.from("expenses").select("*").eq("trip_id", particular)

    expect(data).toEqual([])
  })
})
