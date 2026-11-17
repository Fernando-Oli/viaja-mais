import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { USUARIOS } from "../fixtures/usuarios"
import { admin, chamar, logar } from "./apoio"

/**
 * Despesas na API (`/api/trips/:tripId/expenses/**` e `/api/expenses`), com
 * sessão e banco reais. Substitui `tests/lib/expenses-route.test.ts` e
 * `tests/api/expense-item-route.test.ts`, que simulavam o cliente do Supabase.
 *
 * Precisa do banco local: `npm run db:reset`.
 *
 * @RF06.1 adicionar despesa · @RF04.6 membros podem adicionar despesas
 * @RF06.2 editar despesa · @RF06.3 excluir despesa · @RF06.4 total de gastos
 * @RF06.9 tipo de rateio · @RF06.10 valor devido por membro
 * @RNF08.1 a soma das partes iguala o valor da despesa · @RNF02.7 sem atribuição em massa
 */

const { ana, bruno, carla, davi } = USUARIOS

let cookieAna: string
let cookieBruno: string
let cookieCarla: string
let cookieDavi: string
let viagem: string
let outraViagem: string

async function novaViagem(titulo: string) {
  const { rows } = await admin.query(
    `insert into public.trips (user_id, title, destination, start_date, end_date)
     values ($1, $2, 'Salvador', '2026-12-10', '2026-12-14') returning id`,
    [ana.id, titulo],
  )
  return rows[0].id as string
}

/** Despesa lançada direto no banco; `autor` é quem registrou e quem pagou. */
async function novaDespesa(tripId: string, autor: string = bruno.id, valor = 90) {
  const { rows } = await admin.query(
    `insert into public.expenses (trip_id, user_id, title, amount, category, date)
     values ($1, $2, 'Acarajé', $3, 'food', '2026-12-11') returning id`,
    [tripId, autor, valor],
  )
  return rows[0].id as string
}

/** Grava as partes numa transação, como a constraint trigger da soma exige. */
async function ratear(expenseId: string, tipo: string, partes: [string, number, number | null][]) {
  await admin.query("begin")
  await admin.query("update public.expenses set split_type = $2 where id = $1", [expenseId, tipo])
  for (const [userId, valor, peso] of partes) {
    await admin.query(
      "insert into public.expense_shares (expense_id, user_id, amount, weight) values ($1, $2, $3, $4)",
      [expenseId, userId, valor, peso],
    )
  }
  await admin.query("commit")
}

async function partesGravadas(expenseId: string) {
  const { rows } = await admin.query(
    "select user_id, amount::float as amount, weight::float as weight from public.expense_shares where expense_id = $1 order by user_id",
    [expenseId],
  )
  return rows as { user_id: string; amount: number; weight: number | null }[]
}

beforeAll(async () => {
  await admin.connect()
  ;[cookieAna, cookieBruno, cookieCarla, cookieDavi] = await Promise.all([
    logar(ana.email, ana.senha),
    logar(bruno.email, bruno.senha),
    logar(carla.email, carla.senha),
    logar(davi.email, davi.senha),
  ])
  viagem = await novaViagem("Despesas (integração)")
  outraViagem = await novaViagem("Outra viagem de despesas (integração)")
  await admin.query(
    `insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member'), ($1, $3, 'member')`,
    [viagem, bruno.id, davi.id],
  )
})

afterAll(async () => {
  await admin.query("delete from public.trips where id = any($1)", [[viagem, outraViagem]])
  await admin.end()
})

const despesa = { title: "Hotel", amount: 300, category: "accommodation", date: "2026-12-10" }

describe("POST e GET /api/trips/:tripId/expenses", () => {
  it("200: membro lança despesa; autor da sessão e viagem da URL, mesmo que o corpo mande outros", async () => {
    const r = await chamar("POST", `/api/trips/${viagem}/expenses`, {
      cookie: cookieBruno,
      corpo: { ...despesa, user_id: ana.id, trip_id: outraViagem, paid_by: ana.id },
    })
    expect(r.status).toBe(200)
    const { expense, shares } = await r.json()
    expect(expense).toMatchObject({ title: "Hotel", amount: 300, currency: "BRL", user_id: bruno.id, paid_by: bruno.id, trip_id: viagem })
    expect(shares).toBeUndefined()
  })

  it("200: membro lista as despesas da viagem", async () => {
    const r = await chamar("GET", `/api/trips/${viagem}/expenses`, { cookie: cookieDavi })
    expect(r.status).toBe(200)
    expect((await r.json()).expenses.some((e: { title: string }) => e.title === "Hotel")).toBe(true)
  })

  it("401: sem sessão", async () => {
    expect((await chamar("GET", `/api/trips/${viagem}/expenses`)).status).toBe(401)
    expect((await chamar("POST", `/api/trips/${viagem}/expenses`, { corpo: despesa })).status).toBe(401)
  })

  it("403: quem não participa não lista nem lança", async () => {
    expect((await chamar("GET", `/api/trips/${viagem}/expenses`, { cookie: cookieCarla })).status).toBe(403)
    expect((await chamar("POST", `/api/trips/${viagem}/expenses`, { cookie: cookieCarla, corpo: despesa })).status).toBe(403)
  })

  it("400: valor zero e categoria fora da lista", async () => {
    const caminho = `/api/trips/${viagem}/expenses`
    expect((await chamar("POST", caminho, { cookie: cookieAna, corpo: { ...despesa, amount: 0 } })).status).toBe(400)
    expect((await chamar("POST", caminho, { cookie: cookieAna, corpo: { ...despesa, category: "x" } })).status).toBe(400)
  })
})

describe("POST /api/trips/:tripId/expenses — rateio", () => {
  const caminho = () => `/api/trips/${viagem}/expenses`
  // O centavo que sobra vai para o menor user_id, venha a lista na ordem que vier.
  const tres = [davi.id, ana.id, bruno.id]

  it("igual: R$ 10,00 entre 3 grava 3,34 + 3,33 + 3,33, com o centavo no menor user_id", async () => {
    const r = await chamar("POST", caminho(), {
      cookie: cookieAna,
      corpo: { ...despesa, amount: 10, rateio: { tipo: "equal", participantes: tres.map((user_id) => ({ user_id })) } },
    })
    expect(r.status).toBe(200)
    const { expense } = await r.json()
    expect(expense.split_type).toBe("equal")
    expect((await partesGravadas(expense.id)).map((p) => p.amount)).toEqual([3.34, 3.33, 3.33])
  })

  it("peso: grava o peso e as partes proporcionais", async () => {
    const r = await chamar("POST", caminho(), {
      cookie: cookieAna,
      corpo: {
        ...despesa,
        amount: 90,
        rateio: { tipo: "weight", participantes: [{ user_id: ana.id, peso: 2 }, { user_id: bruno.id, peso: 1 }] },
      },
    })
    expect(r.status).toBe(200)
    const partes = await partesGravadas((await r.json()).expense.id)
    expect(partes).toEqual([
      { user_id: ana.id, amount: 60, weight: 2 },
      { user_id: bruno.id, amount: 30, weight: 1 },
    ])
  })

  it("valor exato que não fecha: 400 e nada é gravado", async () => {
    const titulo = `Não fecha ${Date.now()}`
    const r = await chamar("POST", caminho(), {
      cookie: cookieAna,
      corpo: {
        ...despesa,
        title: titulo,
        amount: 100,
        rateio: { tipo: "exact", participantes: [{ user_id: ana.id, valor: 40 }, { user_id: bruno.id, valor: 50 }] },
      },
    })
    expect(r.status).toBe(400)
    const { rows } = await admin.query("select 1 from public.expenses where title = $1", [titulo])
    expect(rows).toHaveLength(0)
  })

  it("participante que não é membro da viagem: 400 e nada é gravado", async () => {
    const titulo = `Dívida alheia ${Date.now()}`
    const r = await chamar("POST", caminho(), {
      cookie: cookieAna,
      corpo: { ...despesa, title: titulo, rateio: { tipo: "equal", participantes: [{ user_id: ana.id }, { user_id: carla.id }] } },
    })
    expect(r.status).toBe(400)
    const { rows } = await admin.query("select 1 from public.expenses where title = $1", [titulo])
    expect(rows).toHaveLength(0)
  })
})

describe("/api/trips/:tripId/expenses/:expenseId", () => {
  it("200: autor carrega e edita a própria despesa", async () => {
    const id = await novaDespesa(viagem)
    const caminho = `/api/trips/${viagem}/expenses/${id}`
    expect((await chamar("GET", caminho, { cookie: cookieBruno })).status).toBe(200)
    const r = await chamar("PATCH", caminho, { cookie: cookieBruno, corpo: { title: "Acarajé e abará", amount: 95.5 } })
    expect(r.status).toBe(200)
    expect((await r.json()).expense).toMatchObject({ title: "Acarajé e abará", amount: 95.5 })
  })

  it("200: o dono da viagem edita e exclui despesa de outro membro", async () => {
    const id = await novaDespesa(viagem)
    const caminho = `/api/trips/${viagem}/expenses/${id}`
    expect((await chamar("PATCH", caminho, { cookie: cookieAna, corpo: { notes: "corrigido" } })).status).toBe(200)
    expect((await chamar("DELETE", caminho, { cookie: cookieAna })).status).toBe(200)
    const { rows } = await admin.query("select 1 from public.expenses where id = $1", [id])
    expect(rows).toHaveLength(0)
  })

  it("403: membro que não registrou a despesa e não é dono não carrega, edita nem exclui", async () => {
    const caminho = `/api/trips/${viagem}/expenses/${await novaDespesa(viagem)}`
    expect((await chamar("GET", caminho, { cookie: cookieDavi })).status).toBe(403)
    expect((await chamar("PATCH", caminho, { cookie: cookieDavi, corpo: { title: "x" } })).status).toBe(403)
    expect((await chamar("DELETE", caminho, { cookie: cookieDavi })).status).toBe(403)
  })

  it("401 e 403 para quem não participa", async () => {
    const caminho = `/api/trips/${viagem}/expenses/${await novaDespesa(viagem)}`
    expect((await chamar("PATCH", caminho, { corpo: { title: "x" } })).status).toBe(401)
    expect((await chamar("DELETE", caminho)).status).toBe(401)
    expect((await chamar("PATCH", caminho, { cookie: cookieCarla, corpo: { title: "x" } })).status).toBe(403)
    expect((await chamar("DELETE", caminho, { cookie: cookieCarla })).status).toBe(403)
  })

  it("400: valor zero, categoria fora da lista e corpo vazio", async () => {
    const caminho = `/api/trips/${viagem}/expenses/${await novaDespesa(viagem)}`
    expect((await chamar("PATCH", caminho, { cookie: cookieBruno, corpo: { amount: 0 } })).status).toBe(400)
    expect((await chamar("PATCH", caminho, { cookie: cookieBruno, corpo: { category: "x" } })).status).toBe(400)
    expect((await chamar("PATCH", caminho, { cookie: cookieBruno, corpo: {} })).status).toBe(400)
  })

  it("404: despesa de outra viagem, mesmo para o dono das duas", async () => {
    const caminho = `/api/trips/${viagem}/expenses/${await novaDespesa(outraViagem, ana.id)}`
    expect((await chamar("GET", caminho, { cookie: cookieAna })).status).toBe(404)
    expect((await chamar("PATCH", caminho, { cookie: cookieAna, corpo: { title: "x" } })).status).toBe(404)
    expect((await chamar("DELETE", caminho, { cookie: cookieAna })).status).toBe(404)
  })

  it("trip_id, user_id e id no corpo não mudam a despesa (mass-assignment)", async () => {
    const id = await novaDespesa(viagem)
    await chamar("PATCH", `/api/trips/${viagem}/expenses/${id}`, {
      cookie: cookieBruno,
      corpo: { title: "Mesma", trip_id: outraViagem, user_id: davi.id, id: outraViagem },
    })
    const { rows } = await admin.query("select trip_id, user_id from public.expenses where id = $1", [id])
    expect(rows[0]).toEqual({ trip_id: viagem, user_id: bruno.id })
  })
})

describe("PATCH de despesa já rateada (@RNF08.1)", () => {
  it("igual: o rateio é refeito sobre o valor novo e a soma fecha", async () => {
    const id = await novaDespesa(viagem, bruno.id, 90)
    await ratear(id, "equal", [
      [ana.id, 30, null],
      [bruno.id, 30, null],
      [davi.id, 30, null],
    ])
    const r = await chamar("PATCH", `/api/trips/${viagem}/expenses/${id}`, { cookie: cookieBruno, corpo: { amount: 100 } })
    expect(r.status).toBe(200)
    expect((await partesGravadas(id)).map((p) => p.amount)).toEqual([33.34, 33.33, 33.33])
  })

  it("peso: mantém os pesos", async () => {
    const id = await novaDespesa(viagem, bruno.id, 90)
    await ratear(id, "weight", [
      [ana.id, 60, 2],
      [bruno.id, 30, 1],
    ])
    expect((await chamar("PATCH", `/api/trips/${viagem}/expenses/${id}`, { cookie: cookieBruno, corpo: { amount: 120 } })).status).toBe(200)
    expect(await partesGravadas(id)).toEqual([
      { user_id: ana.id, amount: 80, weight: 2 },
      { user_id: bruno.id, amount: 40, weight: 1 },
    ])
  })

  it("409: valor exato não é adivinhado, e nada muda", async () => {
    const id = await novaDespesa(viagem, bruno.id, 90)
    await ratear(id, "exact", [
      [ana.id, 50, null],
      [bruno.id, 40, null],
    ])
    expect((await chamar("PATCH", `/api/trips/${viagem}/expenses/${id}`, { cookie: cookieBruno, corpo: { amount: 100 } })).status).toBe(409)
    const { rows } = await admin.query("select amount::float as amount from public.expenses where id = $1", [id])
    expect(rows[0].amount).toBe(90)
  })

  it("409: com parte já quitada, o valor não muda", async () => {
    const id = await novaDespesa(viagem, bruno.id, 90)
    await ratear(id, "equal", [
      [ana.id, 45, null],
      [bruno.id, 45, null],
    ])
    await admin.query("update public.expense_shares set settled_at = now() where expense_id = $1 and user_id = $2", [id, ana.id])
    expect((await chamar("PATCH", `/api/trips/${viagem}/expenses/${id}`, { cookie: cookieBruno, corpo: { amount: 100 } })).status).toBe(409)
  })

  it("mudar só o título não toca nas partes", async () => {
    const id = await novaDespesa(viagem, bruno.id, 90)
    await ratear(id, "exact", [
      [ana.id, 50, null],
      [bruno.id, 40, null],
    ])
    expect((await chamar("PATCH", `/api/trips/${viagem}/expenses/${id}`, { cookie: cookieBruno, corpo: { title: "Outro", amount: 90 } })).status).toBe(200)
    expect((await partesGravadas(id)).map((p) => p.amount)).toEqual([50, 40])
  })
})

describe("GET /api/expenses", () => {
  it("200: despesas das viagens de que participa, de qualquer autor, com a viagem junto", async () => {
    await novaDespesa(viagem, ana.id)
    await novaDespesa(outraViagem, ana.id)
    const r = await chamar("GET", "/api/expenses", { cookie: cookieDavi })
    expect(r.status).toBe(200)
    const { expenses } = await r.json()
    const daAna = expenses.find((e: { user_id: string; trip_id: string }) => e.user_id === ana.id && e.trip_id === viagem)
    expect(daAna.trips).toEqual({ title: "Despesas (integração)", currency: "BRL" })
    expect(expenses.some((e: { trip_id: string }) => e.trip_id === outraViagem)).toBe(false)
  })

  it("401: sem sessão", async () => {
    expect((await chamar("GET", "/api/expenses")).status).toBe(401)
  })
})
