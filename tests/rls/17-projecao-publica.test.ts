import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Client } from "pg"
import { MAXIMO_ITENS_NO_POST, projecaoPublicaDaViagem } from "@/api/modulos/viagens/publico"
import { USUARIOS } from "../fixtures/usuarios"
import { type Cliente, CONEXAO, logar, naApi } from "./apoio"

/**
 * Projeção pública de uma viagem (`api/modulos/viagens/publico.ts`): o recorte
 * que pode virar post no feed. Roda pelo `comoUsuario()` de produção, contra o
 * banco, com a RLS valendo. Substitui `tests/lib/trips-publico.test.ts`, que
 * simulava o cliente do Supabase.
 *
 * @RF09.7 publicar uma viagem expõe só título, destino, datas e itinerário
 */

let ana: Cliente
let bruno: Cliente
let db: Client
let viagem: string
let vazia: string

async function item(tripId: string, campos: { title: string; date: string; start_time?: string | null; status?: string | null }) {
  await db.query(
    `insert into public.itinerary_items (trip_id, title, date, start_time, status, notes, latitude, longitude)
     values ($1, $2, $3, $4, $5, 'nota privada', -15.8, -47.9)`,
    [tripId, campos.title, campos.date, campos.start_time ?? null, campos.status === undefined ? "planned" : campos.status],
  )
}

beforeAll(async () => {
  const a = await logar(USUARIOS.ana.email)
  const b = await logar(USUARIOS.bruno.email)
  ana = a.cliente
  bruno = b.cliente
  db = new Client({ connectionString: CONEXAO })
  await db.connect()

  const criar = async (titulo: string) =>
    (
      await db.query(
        `insert into public.trips (user_id, title, destination, start_date, end_date, description, budget, currency)
         values ($1, $2, 'Lisboa', '2026-12-01', '2026-12-05', 'descrição privada', 5000, 'EUR') returning id`,
        [a.id, titulo],
      )
    ).rows[0].id as string
  viagem = await criar("Projeção pública")
  vazia = await criar("Projeção sem itens")

  await item(viagem, { title: "Tarde", date: "2026-12-02", start_time: "15:00" })
  await item(viagem, { title: "Sem hora", date: "2026-12-02", start_time: null })
  await item(viagem, { title: "Manhã", date: "2026-12-02", start_time: "09:00" })
  await item(viagem, { title: "Dia 1", date: "2026-12-01", start_time: "20:00" })
  await item(viagem, { title: "Sem status", date: "2026-12-03", status: null })
  await item(viagem, { title: "Cancelado", date: "2026-12-03", status: "cancelled" })
})

afterAll(async () => {
  await db.query("delete from public.trips where id = any($1::uuid[])", [[viagem, vazia]])
  await db.end()
})

describe("projecaoPublicaDaViagem", () => {
  it("devolve exatamente as chaves públicas da viagem e dos itens", async () => {
    const projecao = await naApi(ana, (tx) => projecaoPublicaDaViagem(tx, viagem))
    expect(Object.keys(projecao!).sort()).toEqual(["destination", "end_date", "itens", "start_date", "title"])
    expect(Object.keys(projecao!.itens[0]).sort()).toEqual(
      ["category", "date", "description", "end_time", "id", "location", "start_time", "title"].sort(),
    )
    expect(projecao).toMatchObject({
      title: "Projeção pública",
      destination: "Lisboa",
      start_date: "2026-12-01",
      end_date: "2026-12-05",
    })
    expect(JSON.stringify(projecao)).not.toMatch(/privada|5000|EUR|-15\.8/)
  })

  it("tira os cancelados (mantendo status nulo) e ordena por data e hora, sem hora por último", async () => {
    const projecao = await naApi(ana, (tx) => projecaoPublicaDaViagem(tx, viagem))
    expect(projecao!.itens.map((i) => i.title)).toEqual(["Dia 1", "Manhã", "Tarde", "Sem hora", "Sem status"])
  })

  it("viagem sem itens devolve lista vazia", async () => {
    expect((await naApi(ana, (tx) => projecaoPublicaDaViagem(tx, vazia)))!.itens).toEqual([])
  })

  it("viagem que a sessão não enxerga devolve null (RLS), e inexistente também", async () => {
    expect(await naApi(bruno, (tx) => projecaoPublicaDaViagem(tx, viagem))).toBeNull()
    expect(await naApi(ana, (tx) => projecaoPublicaDaViagem(tx, "00000000-0000-4000-8000-000000000000"))).toBeNull()
  })

  it(`para em ${MAXIMO_ITENS_NO_POST} itens, o teto do post no banco`, async () => {
    await db.query(
      `insert into public.itinerary_items (trip_id, title, date)
       select $1, 'Item ' || g, '2026-12-04' from generate_series(1, $2) g`,
      [vazia, MAXIMO_ITENS_NO_POST + 1],
    )
    expect((await naApi(ana, (tx) => projecaoPublicaDaViagem(tx, vazia)))!.itens).toHaveLength(MAXIMO_ITENS_NO_POST)
  })
})
