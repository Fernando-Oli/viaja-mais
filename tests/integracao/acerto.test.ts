import { randomUUID } from "node:crypto"
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { USUARIOS } from "../fixtures/usuarios"
import { admin, chamar, logar } from "./apoio"

/**
 * Acerto de contas na API (`/api/trips/:tripId/acerto` e `.../transferencias`),
 * com sessão e banco reais. Substitui `tests/api/acerto-route.test.ts` e
 * `acerto-transferencias-route.test.ts`, que simulavam o cliente do Supabase.
 * A conta em si é provada em `tests/lib/finance-*.test.ts`; aqui, a rota.
 *
 * Precisa do banco local: `npm run db:reset`.
 *
 * @RF06.11 saldo por membro · @RF06.13 transferências sugeridas e pagamento registrado
 * @RNF02.9 settlements visíveis e graváveis só por membros, e só em nome próprio
 */

const { ana, bruno, carla } = USUARIOS

let cookieAna: string
let cookieBruno: string
let cookieCarla: string
let viagem: string

type Transferencia = { de: { userId: string }; para: { userId: string }; valor: number }

async function acertoComo(cookie: string) {
  const r = await chamar("GET", `/api/trips/${viagem}/acerto`, { cookie })
  expect(r.status).toBe(200)
  return r.json()
}

async function esperarAte(condicao: () => Promise<boolean>, limiteMs = 10_000) {
  const fim = Date.now() + limiteMs
  while (!(await condicao())) {
    if (Date.now() > fim) throw new Error("os envios não chegaram a esperar no banco")
    await new Promise((r) => setTimeout(r, 20))
  }
}

const pagamento = (valor: number, chave = randomUUID()) => ({ de: bruno.id, para: ana.id, valor, moeda: "BRL", chave })
const transferir = (cookie: string | undefined, corpo: unknown) =>
  chamar("POST", `/api/trips/${viagem}/acerto/transferencias`, { cookie, corpo })

beforeAll(async () => {
  await admin.connect()
  ;[cookieAna, cookieBruno, cookieCarla] = await Promise.all([
    logar(ana.email, ana.senha),
    logar(bruno.email, bruno.senha),
    logar(carla.email, carla.senha),
  ])
  const { rows } = await admin.query(
    `insert into public.trips (user_id, title, destination, start_date, end_date)
     values ($1, 'Acerto (integração)', 'Recife', '2026-12-10', '2026-12-14') returning id`,
    [ana.id],
  )
  viagem = rows[0].id
  await admin.query(`insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member')`, [viagem, bruno.id])

  // Ana pagou R$ 100,00, dividido igual com o Bruno: ele deve R$ 50,00 a ela.
  await admin.query("begin")
  const despesa = await admin.query(
    `insert into public.expenses (trip_id, user_id, title, amount, category, date, split_type)
     values ($1, $2, 'Jantar', 100, 'food', '2026-12-11', 'equal') returning id`,
    [viagem, ana.id],
  )
  await admin.query(
    `insert into public.expense_shares (expense_id, user_id, amount) values ($1, $2, 50), ($1, $3, 50)`,
    [despesa.rows[0].id, ana.id, bruno.id],
  )
  await admin.query("commit")
})

afterAll(async () => {
  await admin.query("delete from public.settlements where trip_id = $1", [viagem])
  await admin.query("delete from public.trips where id = $1", [viagem])
  await admin.end()
})

describe("GET /api/trips/:tripId/acerto", () => {
  it("200: saldo por membro e transferência sugerida de quem deve para quem tem a receber", async () => {
    const acerto = await acertoComo(cookieBruno)
    expect(acerto.usuarioAtualId).toBe(bruno.id)
    expect(acerto.grupos).toHaveLength(1)
    const [brl] = acerto.grupos
    expect(brl.moeda).toBe("BRL")
    const saldo = (id: string) => brl.saldos.find((s: { userId: string }) => s.userId === id).valor
    expect(saldo(ana.id)).toBe(50)
    expect(saldo(bruno.id)).toBe(-50)
    expect(brl.transferencias).toEqual([
      expect.objectContaining({ de: expect.objectContaining({ userId: bruno.id }), para: expect.objectContaining({ userId: ana.id }), valor: 50 }),
    ])
  })

  it("401: sem sessão", async () => {
    expect((await chamar("GET", `/api/trips/${viagem}/acerto`)).status).toBe(401)
  })

  it("403: quem não participa não vê saldo nenhum", async () => {
    const r = await chamar("GET", `/api/trips/${viagem}/acerto`, { cookie: cookieCarla })
    expect(r.status).toBe(403)
    expect(await r.json()).not.toHaveProperty("grupos")
  })

  it("400: tripId que não é UUID", async () => {
    expect((await chamar("GET", "/api/trips/nao-e-uuid/acerto", { cookie: cookieAna })).status).toBe(400)
  })
})

describe("POST /api/trips/:tripId/acerto/transferencias", () => {
  it("201: pagamento parcial com o pagador da sessão, e o saldo já o desconta", async () => {
    const r = await transferir(cookieBruno, { ...pagamento(20), id: randomUUID(), trip_id: randomUUID() })
    expect(r.status).toBe(201)
    expect((await r.json()).transferencia).toMatchObject({ trip_id: viagem, from_user_id: bruno.id, to_user_id: ana.id, amount: 20 })
    const [brl] = (await acertoComo(cookieAna)).grupos
    expect(brl.transferencias[0].valor).toBe(30)
  })

  it("200 ao reenviar a mesma chave: devolve o pagamento existente sem gravar outro", async () => {
    const corpo = pagamento(5)
    const primeiro = await transferir(cookieBruno, corpo)
    expect(primeiro.status).toBe(201)
    const segundo = await transferir(cookieBruno, corpo)
    expect(segundo.status).toBe(200)
    expect((await segundo.json()).transferencia.id).toBe((await primeiro.json()).transferencia.id)
    const { rows } = await admin.query("select 1 from public.settlements where idempotency_key = $1", [corpo.chave])
    expect(rows).toHaveLength(1)
  })

  it("401: sem sessão", async () => {
    expect((await transferir(undefined, pagamento(1))).status).toBe(401)
  })

  it("403: quem não participa, e quem tenta registrar o pagamento de outra pessoa", async () => {
    expect((await transferir(cookieCarla, pagamento(1))).status).toBe(403)
    expect((await transferir(cookieAna, pagamento(1))).status).toBe(403)
  })

  it("400: valor zero, chave que não é UUID e corpo que não é JSON", async () => {
    expect((await transferir(cookieBruno, pagamento(0))).status).toBe(400)
    expect((await transferir(cookieBruno, { ...pagamento(1), chave: "x" })).status).toBe(400)
    expect((await transferir(cookieBruno, "não é objeto")).status).toBe(400)
  })

  it("422: acima da dívida, e credor tentando pagar", async () => {
    expect((await transferir(cookieBruno, pagamento(1000))).status).toBe(422)
    const doCredor = { de: ana.id, para: bruno.id, valor: 1, moeda: "BRL", chave: randomUUID() }
    expect((await transferir(cookieAna, doCredor)).status).toBe(422)
  })

  /**
   * Regressão da limitação registrada em S08-Ab-transferencias: dois envios
   * com chaves diferentes passavam os dois pela conferência de saldo.
   *
   * Disparados juntos no mesmo processo, os envios chegam com 10 a 25 ms de
   * diferença e o primeiro grava antes de o segundo ler — o teste passaria sem
   * a trava. Para a corrida acontecer de fato, o teste segura as gravações em
   * `settlements` (EXCLUSIVE ainda deixa ler) até os três envios estarem
   * esperando no banco, e só então solta. Sem a trava por viagem, os três já
   * leram o saldo e gravam; com ela, o segundo e o terceiro leem depois do
   * primeiro e recebem 422.
   */
  it("pagamentos simultâneos da dívida inteira, com chaves diferentes: só um grava, os outros recebem 422", async () => {
    const [brl] = (await acertoComo(cookieBruno)).grupos
    const restante = (brl.transferencias as Transferencia[])[0].valor

    await admin.query("begin")
    await admin.query("lock table public.settlements in exclusive mode")
    const envios = Array.from({ length: 3 }, () => transferir(cookieBruno, pagamento(restante)))
    try {
      await esperarAte(async () => {
        // Dentro de uma transação o Postgres congela o pg_stat_activity na
        // primeira leitura; sem limpar, a espera nunca veria os envios chegarem.
        await admin.query("select pg_stat_clear_snapshot()")
        const { rows } = await admin.query(
          `select count(*)::int as n from pg_stat_activity
            where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid()`,
        )
        return rows[0].n === 3
      })
    } finally {
      await admin.query("commit")
    }

    const respostas = await Promise.all(envios)
    expect(respostas.map((r) => r.status).sort()).toEqual([201, 422, 422])

    const depois = await acertoComo(cookieAna)
    expect(depois.tudoAcertado).toBe(true)
    const { rows } = await admin.query("select sum(amount)::float as total from public.settlements where trip_id = $1", [viagem])
    expect(rows[0].total).toBe(50)
  })
})
