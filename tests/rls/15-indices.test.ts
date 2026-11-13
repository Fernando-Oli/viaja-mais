import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Client } from "pg"
import { CONEXAO } from "./apoio"

/**
 * Índices (S09-F, RNF01.5): toda coluna usada em filtro frequente tem índice,
 * verificável no plano de execução.
 *
 * Duas provas:
 *   1. estrutural: toda chave estrangeira do schema public tem um índice que
 *      começa por ela. O Postgres não cria esse índice sozinho, e são as
 *      colunas que as rotas usam em filtro (`trip_id`, `user_id`) e que a
 *      exclusão em cascata percorre;
 *   2. plano de execução: as consultas das quatro abas da viagem usam o índice,
 *      com volume sintético (dentro de transação desfeita no fim — nada fica no
 *      banco). Com as poucas linhas do seed o planejador prefere ler a tabela
 *      inteira, e o teste não provaria nada.
 *
 * @RNF01.5
 */


let db: Client

beforeAll(async () => {
  db = new Client({ connectionString: CONEXAO })
  await db.connect()
})

afterAll(async () => {
  await db.end()
})

describe("estrutura", () => {
  it("toda chave estrangeira do schema public tem índice que começa por ela", async () => {
    const { rows } = await db.query(`
      select c.conrelid::regclass::text as tabela, a.attname as coluna
      from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'f' and n.nspname = 'public'
        and not exists (
          select 1 from pg_index i where i.indrelid = c.conrelid and i.indkey[0] = c.conkey[1]
        )
      order by 1, 2
    `)
    expect(rows, rows.map((r) => `${r.tabela}.${r.coluna}`).join(", ")).toEqual([])
  })
})

describe("plano de execução das abas da viagem (volume sintético)", () => {
  let viagemAlvo: string

  beforeAll(async () => {
    await db.query("begin")
    const { rows: dono } = await db.query("select id from auth.users where email = 'teste.a@viajamais.local'")
    const idAna = dono[0].id as string

    // 300 viagens com 40 linhas em cada aba: 12 mil por tabela. O suficiente
    // para o planejador preferir o índice; pouco para o teste ficar lento.
    await db.query(
      `insert into public.trips (user_id, title, destination, start_date, end_date)
       select $1, 'perf ' || g, 'Goiás', date '2026-12-01', date '2026-12-10' from generate_series(1, 300) g`,
      [idAna],
    )
    const { rows: viagens } = await db.query("select id from public.trips where title like 'perf %'")
    viagemAlvo = viagens[0].id
    await db.query(
      `insert into public.itinerary_items (trip_id, title, date, start_time, category)
         select t.id, 'item', date '2026-12-01' + (g % 10), time '08:00' + (g || ' min')::interval, 'activity'
         from public.trips t, generate_series(1, 40) g where t.title like 'perf %';
       insert into public.expenses (trip_id, user_id, paid_by, title, amount, category, date, currency, split_type)
         select t.id, $1, $1, 'gasto', 10, 'food', date '2026-12-01' + (g % 10), 'BRL', 'equal'
         from public.trips t, generate_series(1, 40) g where t.title like 'perf %';
       insert into public.bookings (trip_id, user_id, type, title, start_date, status)
         select t.id, $1, 'hotel', 'reserva', date '2026-12-01' + (g % 10), 'confirmed'
         from public.trips t, generate_series(1, 40) g where t.title like 'perf %';
       insert into public.places (trip_id, user_id, name, latitude, longitude)
         select t.id, $1, 'lugar', -15.8, -48.9
         from public.trips t, generate_series(1, 40) g where t.title like 'perf %';`.replace(/\$1/g, `'${idAna}'`),
    )
    await db.query("analyze public.trips, public.itinerary_items, public.expenses, public.bookings, public.places")
  })

  afterAll(async () => {
    await db.query("rollback")
  })

  async function plano(sql: string) {
    const { rows } = await db.query(`explain ${sql}`, [viagemAlvo])
    return rows.map((r) => r["QUERY PLAN"] as string).join("\n")
  }

  it.each([
    ["itinerário", "select * from public.itinerary_items where trip_id = $1 order by date, start_time", "itinerary_items_trip_id_date_idx"],
    ["despesas", "select * from public.expenses where trip_id = $1 order by date desc", "expenses_trip_id_date_idx"],
    ["reservas", "select * from public.bookings where trip_id = $1 order by start_date", "bookings_trip_id_start_date_idx"],
    ["lugares", "select * from public.places where trip_id = $1 order by created_at desc", "places_trip_id_created_at_idx"],
  ])("aba %s usa o índice, sem ler a tabela inteira", async (_aba, sql, indice) => {
    const texto = await plano(sql)
    expect(texto).toContain(indice)
    expect(texto).not.toMatch(/Seq Scan on (itinerary_items|expenses|bookings|places)/)
  })
})
