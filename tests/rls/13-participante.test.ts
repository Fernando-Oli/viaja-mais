import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { type SupabaseClient } from "@supabase/supabase-js"
import { Client } from "pg"
import { entrarPorConvite } from "./convite"
import { CONEXAO, logar } from "./apoio"

/**
 * O que um **participante** consegue fazer além do devido (issue #37).
 *
 * A suíte já provava bem o isolamento de quem está de fora da viagem
 * (01-isolamento, 03-escopo-grupo). Este arquivo cobre o outro lado: quem está
 * dentro, ou quem consegue um convite qualquer, tentando passar da regra da
 * aplicação direto pelo PostgREST, com o JWT que está no navegador.
 *
 * A causa comum: cada tabela herdada do dump do projeto original tinha duas
 * famílias de policy, as nossas (estritas) e as herdadas (frouxas, nomes em
 * inglês). Policies permissivas somam por OU, então a frouxa vencia. E os
 * grants deixavam `authenticated` alterar qualquer coluna, inclusive `user_id`
 * e `trip_id`.
 *
 * A regra da aplicação, que este arquivo cobra do banco:
 *   - viagem: só o dono edita, e ninguém troca o dono;
 *   - convite: o convidado só muda o `status`;
 *   - membro: a linha não é editada por ninguém (só inserida pelo convite e
 *     removida);
 *   - despesa e as partes do rateio: só o autor ou o dono da viagem alteram;
 *   - reserva, lugar e itinerário: qualquer membro edita, mas ninguém troca o
 *     autor nem a viagem.
 *
 * Ana é a dona, Bruno é membro, Carla é de fora (seed).
 *
 * @RNF02.4 isolamento · @RF04.3 entrar só por convite · @RF06.2 editar despesa
 */


const EMAIL = {
  ana: "teste.a@viajamais.local",
  bruno: "teste.b@viajamais.local",
  carla: "teste.c@viajamais.local",
}

const VIOLA_GRANT = "42501"

let ana: SupabaseClient, bruno: SupabaseClient, carla: SupabaseClient
let idAna: string, idBruno: string, idCarla: string
let db: Client

const SUFIXO = Date.now()
let viagem: string // da Ana, com o Bruno de membro
let viagemCarla: string // da Carla, sozinha
let despesaAna: string
let despesaBruno: string
let reservaAna: string
let lugarAna: string
let itemAna: string

async function linha<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T> {
  const { rows } = await db.query(sql, params)
  return rows[0] as T
}

async function criar(cliente: SupabaseClient, tabela: string, valores: Record<string, unknown>) {
  const { data, error } = await cliente.from(tabela).insert(valores).select("id").single()
  if (error) throw new Error(`preparo: insert em ${tabela} falhou: ${error.message}`)
  return (data as { id: string }).id
}

beforeAll(async () => {
  ;({ cliente: ana, id: idAna } = await logar(EMAIL.ana))
  ;({ cliente: bruno, id: idBruno } = await logar(EMAIL.bruno))
  ;({ cliente: carla, id: idCarla } = await logar(EMAIL.carla))
  db = new Client({ connectionString: CONEXAO })
  await db.connect()

  const base = { start_date: "2026-12-01", end_date: "2026-12-05", currency: "BRL", status: "planning" }
  viagem = await criar(ana, "trips", { ...base, title: `Participante ${SUFIXO}`, destination: "Goiás", user_id: idAna })
  viagemCarla = await criar(carla, "trips", { ...base, title: `Da Carla ${SUFIXO}`, destination: "Bahia", user_id: idCarla })
  await entrarPorConvite({ dona: ana, idDona: idAna, convidado: bruno, idConvidado: idBruno, emailConvidado: EMAIL.bruno, tripId: viagem })

  const despesa = { trip_id: viagem, category: "food", date: "2026-12-02", currency: "BRL", split_type: "equal" }
  despesaAna = await criar(ana, "expenses", { ...despesa, title: "Jantar", amount: 90, user_id: idAna, paid_by: idAna })
  despesaBruno = await criar(bruno, "expenses", { ...despesa, title: "Táxi", amount: 40, user_id: idBruno, paid_by: idBruno })
  const { error: erroPartes } = await ana.from("expense_shares").insert([
    { expense_id: despesaAna, user_id: idAna, amount: 45 },
    { expense_id: despesaAna, user_id: idBruno, amount: 45 },
  ])
  if (erroPartes) throw new Error(`preparo: partes da despesa da Ana: ${erroPartes.message}`)

  reservaAna = await criar(ana, "bookings", {
    trip_id: viagem, user_id: idAna, type: "hotel", title: "Pousada", start_date: "2026-12-01", status: "confirmed",
  })
  lugarAna = await criar(ana, "places", { trip_id: viagem, user_id: idAna, name: "Cachoeira", latitude: -15.8, longitude: -48.9 })
  itemAna = await criar(ana, "itinerary_items", { trip_id: viagem, title: "Trilha", date: "2026-12-02", category: "activity" })
})

afterAll(async () => {
  await db.query("delete from public.trips where id = any($1)", [[viagem, viagemCarla].filter(Boolean)])
  await db.end()
})

describe("H1 — viagem: membro não edita e ninguém troca o dono", () => {
  it("membro tentando se tornar dono: recusado, e a dona continua a Ana", async () => {
    const { error } = await bruno.from("trips").update({ user_id: idBruno }).eq("id", viagem)
    expect(error?.code).toBe(VIOLA_GRANT)
    expect(await linha("select user_id from public.trips where id = $1", [viagem])).toEqual({ user_id: idAna })
  })

  it("membro editando o título: nenhuma linha muda", async () => {
    const { data } = await bruno.from("trips").update({ title: "Sequestrada" }).eq("id", viagem).select("id")
    expect(data).toEqual([])
    expect(await linha("select title from public.trips where id = $1", [viagem])).toEqual({ title: `Participante ${SUFIXO}` })
  })

  it("a dona edita o título normalmente (regressão do PATCH)", async () => {
    const { data, error } = await ana.from("trips").update({ title: `Participante ${SUFIXO}` }).eq("id", viagem).select("id")
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})

describe("H2 — convite: ninguém o redireciona para a viagem de outra pessoa", () => {
  let conviteCarla: string

  beforeAll(async () => {
    // A Carla convida o próprio e-mail para a viagem dela: é permitido, ela é a dona.
    conviteCarla = await criar(carla, "trip_invitations", { trip_id: viagemCarla, inviter_id: idCarla, invitee_email: EMAIL.carla })
  })

  it("trocar o trip_id do próprio convite: recusado", async () => {
    const { error } = await carla.from("trip_invitations").update({ trip_id: viagem }).eq("id", conviteCarla)
    expect(error?.code).toBe(VIOLA_GRANT)
    expect(await linha("select trip_id from public.trip_invitations where id = $1", [conviteCarla])).toEqual({ trip_id: viagemCarla })
  })

  it("e, sem convite para a viagem da Ana, a Carla não entra nela", async () => {
    const { error } = await carla.from("trip_members").insert({ trip_id: viagem, user_id: idCarla, role: "member" })
    expect(error).not.toBeNull()
    expect(await linha("select count(*)::int as n from public.trip_members where trip_id = $1 and user_id = $2", [viagem, idCarla])).toEqual({ n: 0 })
  })

  it("trocar o e-mail convidado: recusado", async () => {
    const { error } = await carla.from("trip_invitations").update({ invitee_email: EMAIL.bruno }).eq("id", conviteCarla)
    expect(error?.code).toBe(VIOLA_GRANT)
  })

  it("aceitar e recusar continuam funcionando (só o status)", async () => {
    const { data, error } = await carla.from("trip_invitations").update({ status: "declined" }).eq("id", conviteCarla).select("id")
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })
})

describe("H4 — linha de membro: ninguém a edita", () => {
  it("a dona trocando o user_id de um membro (pôr alguém sem convite): recusado", async () => {
    const { error } = await ana.from("trip_members").update({ user_id: idCarla }).eq("trip_id", viagem).eq("user_id", idBruno)
    expect(error?.code).toBe(VIOLA_GRANT)
    expect(await linha("select count(*)::int as n from public.trip_members where trip_id = $1 and user_id = $2", [viagem, idCarla])).toEqual({ n: 0 })
  })

  it("promover um membro a dono: recusado", async () => {
    const { error } = await ana.from("trip_members").update({ role: "owner" }).eq("trip_id", viagem).eq("user_id", idBruno)
    expect(error?.code).toBe(VIOLA_GRANT)
    expect(await linha("select role from public.trip_members where trip_id = $1 and user_id = $2", [viagem, idBruno])).toEqual({ role: "member" })
  })
})

describe("H3 — despesa: só o autor ou o dono da viagem", () => {
  it("membro alterando o valor da despesa de outro: nenhuma linha muda", async () => {
    const { data } = await bruno.from("expenses").update({ title: "Alterada" }).eq("id", despesaAna).select("id")
    expect(data).toEqual([])
    expect(await linha("select title from public.expenses where id = $1", [despesaAna])).toEqual({ title: "Jantar" })
  })

  it("membro apagando a despesa de outro: nada é apagado", async () => {
    await bruno.from("expenses").delete().eq("id", despesaAna)
    expect(await linha("select count(*)::int as n from public.expenses where id = $1", [despesaAna])).toEqual({ n: 1 })
  })

  it("trocar o autor da própria despesa: recusado", async () => {
    const { error } = await bruno.from("expenses").update({ user_id: idAna }).eq("id", despesaBruno)
    expect(error?.code).toBe(VIOLA_GRANT)
  })

  it("mover a própria despesa para outra viagem: recusado", async () => {
    const { error } = await bruno.from("expenses").update({ trip_id: viagemCarla }).eq("id", despesaBruno)
    expect(error?.code).toBe(VIOLA_GRANT)
  })

  it("o autor edita a própria despesa", async () => {
    const { data } = await bruno.from("expenses").update({ title: "Táxi do aeroporto" }).eq("id", despesaBruno).select("id")
    expect(data).toHaveLength(1)
  })

  it("a dona da viagem edita a despesa do membro (regra da rota)", async () => {
    const { data } = await ana.from("expenses").update({ notes: "conferido" }).eq("id", despesaBruno).select("id")
    expect(data).toHaveLength(1)
  })
})

describe("H5 — partes do rateio: só o autor da despesa ou o dono da viagem", () => {
  it("participante marcando a própria parte como paga: nada muda (sumiria do acerto)", async () => {
    const { data } = await bruno
      .from("expense_shares")
      .update({ settled_at: new Date().toISOString() })
      .eq("expense_id", despesaAna)
      .eq("user_id", idBruno)
      .select("id")
    expect(data).toEqual([])
    expect(
      await linha("select settled_at from public.expense_shares where expense_id = $1 and user_id = $2", [despesaAna, idBruno]),
    ).toEqual({ settled_at: null })
  })

  it("participante apagando as partes da despesa de outro: nada é apagado", async () => {
    await bruno.from("expense_shares").delete().eq("expense_id", despesaAna)
    expect(await linha("select count(*)::int as n from public.expense_shares where expense_id = $1", [despesaAna])).toEqual({ n: 2 })
  })

  it("participante enxerga as partes (o acerto é do grupo)", async () => {
    const { data } = await bruno.from("expense_shares").select("user_id").eq("expense_id", despesaAna)
    expect(data).toHaveLength(2)
  })

  it("trocar a despesa ou a pessoa de uma parte: recusado", async () => {
    const { error } = await ana.from("expense_shares").update({ user_id: idCarla }).eq("expense_id", despesaAna).eq("user_id", idBruno)
    expect(error?.code).toBe(VIOLA_GRANT)
  })

  it("o autor da despesa regrava as partes (como a rota faz ao editar o valor)", async () => {
    const { error } = await ana
      .from("expense_shares")
      .upsert(
        [
          { expense_id: despesaAna, user_id: idAna, amount: 45 },
          { expense_id: despesaAna, user_id: idBruno, amount: 45 },
        ],
        { onConflict: "expense_id,user_id" },
      )
    expect(error).toBeNull()
  })
})

describe("H3 — reserva, lugar e itinerário: coisa do grupo, sem trocar autor nem viagem", () => {
  it("membro edita a reserva da dona (é do grupo)", async () => {
    const { data } = await bruno.from("bookings").update({ notes: "check-in 14h" }).eq("id", reservaAna).select("id")
    expect(data).toHaveLength(1)
  })

  it.each([
    ["bookings", "user_id"],
    ["bookings", "trip_id"],
    ["places", "user_id"],
    ["places", "trip_id"],
    ["itinerary_items", "trip_id"],
  ] as const)("%s: trocar o %s é recusado", async (tabela, coluna) => {
    const id = { bookings: reservaAna, places: lugarAna, itinerary_items: itemAna }[tabela]
    const valor = coluna === "user_id" ? idBruno : viagemCarla
    const { error } = await bruno.from(tabela).update({ [coluna]: valor }).eq("id", id)
    expect(error?.code).toBe(VIOLA_GRANT)
  })

  it("membro marca o lugar como visitado e edita o item do itinerário", async () => {
    const lugar = await bruno.from("places").update({ visited: true }).eq("id", lugarAna).select("id")
    const item = await bruno.from("itinerary_items").update({ status: "completed" }).eq("id", itemAna).select("id")
    expect([lugar.data?.length, item.data?.length]).toEqual([1, 1])
  })
})

describe("transferência: quem recebe participa da viagem", () => {
  it("registrar pagamento para alguém de fora da viagem: recusado", async () => {
    const { error } = await bruno.from("settlements").insert({
      trip_id: viagem,
      from_user_id: idBruno,
      to_user_id: idCarla,
      amount: 10,
      currency: "BRL",
      idempotency_key: crypto.randomUUID(),
    })
    expect(error?.code).toBe(VIOLA_GRANT)
  })

  it("para um membro da viagem, continua permitido", async () => {
    const { error } = await bruno.from("settlements").insert({
      trip_id: viagem,
      from_user_id: idBruno,
      to_user_id: idAna,
      amount: 10,
      currency: "BRL",
      idempotency_key: crypto.randomUUID(),
    })
    expect(error).toBeNull()
  })
})

describe("estrutura: nenhuma policy herdada duplicada sobrevive", () => {
  it("só policies com nome em snake_case nas tabelas da viagem", async () => {
    const { rows } = await db.query(`
      select tablename, policyname from pg_policies
      where schemaname = 'public'
        and tablename in ('trips','expenses','bookings','places','itinerary_items')
        and policyname ~ '[A-Z ]'
      order by 1, 2
    `)
    expect(rows).toEqual([])
  })
})
