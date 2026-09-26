import { describe, it, expect, beforeAll } from "vitest"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"

/**
 * Rateio: isolamento e integridade, contra Postgres real.
 *
 * Duas coisas são provadas aqui, e as duas só existem no banco:
 *
 *   1. **Isolamento.** Quem não participa da viagem não lê nem escreve as
 *      partes do rateio. O teste de escrita é o que importa: `SELECT` vazio
 *      também acontece quando o dado não existe, então sozinho não prova nada.
 *
 *   2. **A soma das partes fecha com o valor da despesa.** É constraint
 *      trigger, não convenção — e por ser DEFERRABLE, precisa de transação
 *      real para ser exercitada de verdade.
 *
 * O membro convidado entra em cena de propósito: a policy pergunta por
 * *participação*, não por propriedade. Se ela perguntasse `user_id = auth.uid()`,
 * o Bruno convidado veria a própria dívida e nada mais — e o acerto de contas
 * do grupo seria impossível de montar.
 *
 * @RNF02.4 RLS por participação nas partes do rateio
 * @RNF-08.1 a soma das partes iguala o valor da despesa
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

/** Viagem só da Ana: o Bruno não participa. */
let viagemFechada: string
let despesaFechada: string

/** Viagem em que o Bruno foi aceito como membro. */
let viagemCompartilhada: string
let despesaCompartilhada: string

beforeAll(async () => {
  const a = await logar(ANA.email, ANA.senha)
  const b = await logar(BRUNO.email, BRUNO.senha)
  ana = a.cliente
  bruno = b.cliente
  usuarioAna = a.usuario
  usuarioBruno = b.usuario

  async function criarViagem(titulo: string) {
    const { data, error } = await ana
      .from("trips")
      .insert({
        user_id: usuarioAna.id,
        title: titulo,
        destination: "Lisboa",
        start_date: "2026-11-01",
        end_date: "2026-11-10",
      })
      .select()
      .single()
    if (error) throw new Error(`Ana não criou a viagem "${titulo}": ${error.message}`)
    return data.id as string
  }

  async function criarDespesa(tripId: string, valor: number) {
    const { data, error } = await ana
      .from("expenses")
      .insert({
        trip_id: tripId,
        user_id: usuarioAna.id,
        paid_by: usuarioAna.id,
        title: "Hotel",
        amount: valor,
        category: "accommodation",
        date: "2026-11-02",
        split_type: "equal",
      })
      .select()
      .single()
    if (error) throw new Error(`Ana não criou a despesa: ${error.message}`)
    return data.id as string
  }

  viagemFechada = await criarViagem("Viagem só da Ana")
  despesaFechada = await criarDespesa(viagemFechada, 300)

  viagemCompartilhada = await criarViagem("Viagem com o Bruno")
  despesaCompartilhada = await criarDespesa(viagemCompartilhada, 300)

  const { error: erroMembro } = await ana.from("trip_members").insert({
    trip_id: viagemCompartilhada,
    user_id: usuarioBruno.id,
    role: "member",
  })
  if (erroMembro) throw new Error(`Ana não conseguiu adicionar o Bruno: ${erroMembro.message}`)
})

describe("isolamento das partes do rateio", () => {
  it("Bruno não lê as partes de uma viagem da qual não participa", async () => {
    const { error } = await ana
      .from("expense_shares")
      .insert([
        { expense_id: despesaFechada, user_id: usuarioAna.id, amount: 150 },
        { expense_id: despesaFechada, user_id: usuarioBruno.id, amount: 150 },
      ])
    expect(error).toBeNull()

    const { data } = await bruno.from("expense_shares").select("*").eq("expense_id", despesaFechada)

    // Há duas linhas ali, e uma delas é nominalmente dele. Ainda assim ele não
    // participa da viagem, então não vê nenhuma.
    expect(data).toEqual([])
  })

  it("Bruno não cria parte numa despesa de viagem da qual não participa", async () => {
    const { error } = await bruno
      .from("expense_shares")
      .insert({ expense_id: despesaFechada, user_id: usuarioBruno.id, amount: 10 })

    expect(error).not.toBeNull()
  })

  it("Bruno não apaga parte de viagem da qual não participa", async () => {
    const { count } = await bruno
      .from("expense_shares")
      .delete({ count: "exact" })
      .eq("expense_id", despesaFechada)

    // Sem policy de DELETE que o alcance, a exclusão não atinge linha nenhuma.
    expect(count ?? 0).toBe(0)

    const { count: restantes } = await ana
      .from("expense_shares")
      .select("*", { count: "exact", head: true })
      .eq("expense_id", despesaFechada)
    expect(restantes).toBe(2)
  })

  it("membro convidado enxerga o rateio inteiro, não só a própria parte", async () => {
    const { error } = await ana
      .from("expense_shares")
      .insert([
        { expense_id: despesaCompartilhada, user_id: usuarioAna.id, amount: 150 },
        { expense_id: despesaCompartilhada, user_id: usuarioBruno.id, amount: 150 },
      ])
    expect(error).toBeNull()

    const { data } = await bruno
      .from("expense_shares")
      .select("user_id, amount")
      .eq("expense_id", despesaCompartilhada)

    expect(data).toHaveLength(2)
    expect(data?.map((l) => l.user_id).sort()).toEqual([usuarioAna.id, usuarioBruno.id].sort())
  })

  it("membro marca a própria parte como quitada", async () => {
    const { error } = await bruno
      .from("expense_shares")
      .update({ settled_at: new Date().toISOString() })
      .eq("expense_id", despesaCompartilhada)
      .eq("user_id", usuarioBruno.id)

    expect(error).toBeNull()
  })
})

describe("a soma das partes fecha com o valor da despesa", () => {
  it("rejeita rateio que não soma o total", async () => {
    const despesa = await (async () => {
      const { data, error } = await ana
        .from("expenses")
        .insert({
          trip_id: viagemCompartilhada,
          user_id: usuarioAna.id,
          paid_by: usuarioAna.id,
          title: "Jantar",
          amount: 100,
          category: "food",
          date: "2026-11-03",
          split_type: "exact",
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      return data.id as string
    })()

    // 40 + 40 = 80, e a despesa é 100. Os 20 que faltam sairiam do bolso de
    // ninguém — é exatamente o erro que a trigger existe para impedir.
    const { error } = await ana.from("expense_shares").insert([
      { expense_id: despesa, user_id: usuarioAna.id, amount: 40 },
      { expense_id: despesa, user_id: usuarioBruno.id, amount: 40 },
    ])

    expect(error).not.toBeNull()
    expect(error?.message).toMatch(/não fecha com o valor da despesa/)
  })

  it("aceita rateio que soma o total, inserido em partes", async () => {
    const { data: despesa, error: erroDespesa } = await ana
      .from("expenses")
      .insert({
        trip_id: viagemCompartilhada,
        user_id: usuarioAna.id,
        paid_by: usuarioAna.id,
        title: "Passeio",
        amount: 90,
        category: "activities",
        date: "2026-11-04",
        split_type: "equal",
      })
      .select()
      .single()
    if (erroDespesa) throw new Error(erroDespesa.message)

    const { error } = await ana.from("expense_shares").insert([
      { expense_id: despesa.id, user_id: usuarioAna.id, amount: 45 },
      { expense_id: despesa.id, user_id: usuarioBruno.id, amount: 45 },
    ])

    expect(error).toBeNull()
  })

  it("despesa sem rateio nenhum continua válida", async () => {
    const { error } = await ana.from("expenses").insert({
      trip_id: viagemCompartilhada,
      user_id: usuarioAna.id,
      paid_by: usuarioAna.id,
      title: "Café",
      amount: 12,
      category: "food",
      date: "2026-11-05",
    })

    // Lançar a despesa e ratear depois é fluxo normal: a trigger só cobra a
    // soma quando existe ao menos uma parte.
    expect(error).toBeNull()
  })

  it("a mesma pessoa não entra duas vezes no mesmo rateio", async () => {
    const { data: despesa, error: erroDespesa } = await ana
      .from("expenses")
      .insert({
        trip_id: viagemCompartilhada,
        user_id: usuarioAna.id,
        paid_by: usuarioAna.id,
        title: "Táxi",
        amount: 50,
        category: "transport",
        date: "2026-11-06",
        split_type: "exact",
      })
      .select()
      .single()
    if (erroDespesa) throw new Error(erroDespesa.message)

    const { error } = await ana.from("expense_shares").insert([
      { expense_id: despesa.id, user_id: usuarioAna.id, amount: 25 },
      { expense_id: despesa.id, user_id: usuarioAna.id, amount: 25 },
    ])

    // A soma até fecharia. A unicidade é que impede duplicar a dívida de alguém.
    expect(error).not.toBeNull()
  })
})
