import { describe, it, expect, beforeAll } from "vitest"
import { randomUUID } from "node:crypto"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"
import { entrarPorConvite } from "./convite"

/**
 * Pagamentos do acerto de contas (`settlements`): isolamento e imutabilidade,
 * contra Postgres real.
 *
 *   1. **Leitura por participação.** Quem participa da viagem lê todos os
 *      pagamentos dela; quem não participa não lê nenhum.
 *   2. **Escrita só em nome próprio.** O pagador registra o próprio pagamento;
 *      ninguém registra em nome de outra pessoa, nem numa viagem da qual não
 *      participa. O teste de escrita é o que importa: `SELECT` vazio também
 *      acontece quando o dado não existe.
 *   3. **Imutável.** Nem UPDATE nem DELETE, nem para quem pagou.
 *
 * A regra de saldo (valor até a dívida e o crédito) não é da RLS: fica na rota
 * (`app/api/trips/[tripId]/acerto/transferencias`), que é a primeira linha.
 *
 * @RNF02.9 settlements visíveis e graváveis só por membros da viagem
 * @RF06.13 registrar como paga uma transferência do acerto
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
let pagamentoFechado: string

/** Viagem em que o Bruno foi aceito como membro. */
let viagemCompartilhada: string
let pagamentoCompartilhado: string

const pagamento = (tripId: string, de: string, para: string, amount = 10) => ({
  trip_id: tripId,
  from_user_id: de,
  to_user_id: para,
  amount,
  currency: "BRL",
  idempotency_key: randomUUID(),
})

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
        destination: "Goiás Velho",
        start_date: "2026-12-01",
        end_date: "2026-12-05",
      })
      .select()
      .single()
    if (error) throw new Error(`Ana não criou a viagem "${titulo}": ${error.message}`)
    return data.id as string
  }

  async function registrar(cliente: SupabaseClient, linha: ReturnType<typeof pagamento>) {
    const { data, error } = await cliente.from("settlements").insert(linha).select("id").single()
    if (error) throw new Error(`pagamento não registrado: ${error.message}`)
    return data.id as string
  }

  viagemFechada = await criarViagem("Acerto só da Ana")
  viagemCompartilhada = await criarViagem("Acerto com o Bruno")

  await entrarPorConvite({
    dona: ana,
    idDona: usuarioAna.id,
    convidado: bruno,
    idConvidado: usuarioBruno.id,
    emailConvidado: BRUNO.email,
    tripId: viagemCompartilhada,
  })

  // A RLS não confere saldo, e o recebedor aqui é só um id válido.
  pagamentoFechado = await registrar(ana, pagamento(viagemFechada, usuarioAna.id, usuarioBruno.id))
  pagamentoCompartilhado = await registrar(ana, pagamento(viagemCompartilhada, usuarioAna.id, usuarioBruno.id))
})

describe("leitura dos pagamentos", () => {
  it("membro lê os pagamentos da própria viagem, inclusive os de outra pessoa", async () => {
    const { data, error } = await bruno.from("settlements").select("id, from_user_id").eq("trip_id", viagemCompartilhada)

    expect(error).toBeNull()
    expect(data?.map((l) => l.id)).toContain(pagamentoCompartilhado)
    expect(data?.find((l) => l.id === pagamentoCompartilhado)?.from_user_id).toBe(usuarioAna.id)
  })

  it("quem não participa da viagem não lê nenhum pagamento dela", async () => {
    const { data, error } = await bruno.from("settlements").select("id").eq("trip_id", viagemFechada)

    expect(error).toBeNull()
    expect(data).toEqual([])

    const porId = await bruno.from("settlements").select("id").eq("id", pagamentoFechado)
    expect(porId.data).toEqual([])
  })

  it("visitante anônimo não lê pagamento nenhum", async () => {
    const anonimo = createClient(API, CHAVE, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data } = await anonimo.from("settlements").select("id")
    expect(data ?? []).toEqual([])
  })
})

describe("registro de pagamento", () => {
  it("o pagador registra o próprio pagamento numa viagem da qual participa", async () => {
    const { data, error } = await bruno
      .from("settlements")
      .insert(pagamento(viagemCompartilhada, usuarioBruno.id, usuarioAna.id, 12.34))
      .select("from_user_id, amount")
      .single()

    expect(error).toBeNull()
    expect(data).toEqual({ from_user_id: usuarioBruno.id, amount: 12.34 })
  })

  it("ninguém registra pagamento em nome de outra pessoa", async () => {
    // Bruno tenta "quitar" uma dívida da Ana com ele mesmo.
    const { error } = await bruno
      .from("settlements")
      .insert(pagamento(viagemCompartilhada, usuarioAna.id, usuarioBruno.id))

    expect(error).not.toBeNull()
    expect(error?.code).toBe("42501")
  })

  it("quem não participa da viagem não registra pagamento nela, nem em nome próprio", async () => {
    const { error } = await bruno.from("settlements").insert(pagamento(viagemFechada, usuarioBruno.id, usuarioAna.id))

    expect(error).not.toBeNull()
    expect(error?.code).toBe("42501")

    const conferencia = await ana.from("settlements").select("id").eq("trip_id", viagemFechada)
    expect(conferencia.data).toHaveLength(1)
  })

  it("o cliente não escolhe id nem data do registro", async () => {
    const { error } = await bruno.from("settlements").insert({
      ...pagamento(viagemCompartilhada, usuarioBruno.id, usuarioAna.id),
      created_at: "2020-01-01T00:00:00Z",
    })

    expect(error?.code).toBe("42501")
  })

  it("a mesma chave de registro do mesmo pagador não grava duas vezes", async () => {
    const linha = pagamento(viagemCompartilhada, usuarioBruno.id, usuarioAna.id, 1)
    const primeiro = await bruno.from("settlements").insert(linha)
    const segundo = await bruno.from("settlements").insert(linha)

    expect(primeiro.error).toBeNull()
    expect(segundo.error?.code).toBe("23505")
  })

  it.each([
    ["valor zero", { amount: 0 }],
    ["valor negativo", { amount: -5 }],
    ["pagador igual ao recebedor", { to_user_id: "__bruno__" }],
    ["moeda fora do formato", { currency: "real" }],
  ])("o banco recusa %s", async (_nome, mudanca) => {
    const linha = { ...pagamento(viagemCompartilhada, usuarioBruno.id, usuarioAna.id), ...mudanca }
    if (linha.to_user_id === "__bruno__") linha.to_user_id = usuarioBruno.id

    const { error } = await bruno.from("settlements").insert(linha)

    expect(error?.code).toBe("23514")
  })
})

describe("pagamento registrado é imutável", () => {
  it("nem quem pagou altera o valor", async () => {
    const { error } = await ana.from("settlements").update({ amount: 999 }).eq("id", pagamentoCompartilhado)

    expect(error?.code).toBe("42501")

    const { data } = await ana.from("settlements").select("amount").eq("id", pagamentoCompartilhado).single()
    expect(data?.amount).toBe(10)
  })

  it("outro membro também não altera", async () => {
    const { error } = await bruno
      .from("settlements")
      .update({ to_user_id: usuarioBruno.id })
      .eq("id", pagamentoCompartilhado)

    expect(error?.code).toBe("42501")
  })

  it("ninguém apaga, nem quem pagou", async () => {
    const pelaAna = await ana.from("settlements").delete().eq("id", pagamentoCompartilhado)
    const peloBruno = await bruno.from("settlements").delete().eq("id", pagamentoCompartilhado)

    expect(pelaAna.error?.code).toBe("42501")
    expect(peloBruno.error?.code).toBe("42501")

    const { data } = await ana.from("settlements").select("id").eq("id", pagamentoCompartilhado)
    expect(data).toHaveLength(1)
  })
})
