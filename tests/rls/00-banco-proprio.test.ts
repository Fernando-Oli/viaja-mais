import { describe, it, expect, beforeAll, afterAll } from "vitest"
import pg from "pg"
import fs from "node:fs"
import { exigirLocal } from "./guarda-ambiente"
import { USUARIOS } from "../fixtures/usuarios"

/**
 * O banco próprio, sem Supabase, isola os usuários como o anterior isolava.
 *
 * Sem o PostgREST, quem conecta no banco é a nossa API, com o papel `app_api`.
 * A RLS só vale se cada transação assumir o papel do usuário — e o modo de
 * falha, se alguém esquecer, não pode ser vazamento. Estes testes provam as
 * duas coisas: com o papel assumido, Ana e Bruno ficam isolados; sem ele, a
 * conexão não lê nada.
 *
 * É o protótipo do `comoUsuario()` da API (etapa 1): `set local role` e
 * `set_config(..., true)`, que valem só até o fim da transação.
 *
 * Precisa do banco local de pé e semeado: `npm run db:reset`.
 *
 * @RNF02.4 RLS em toda tabela · @RNF02.10 conexão da aplicação sem privilégio
 * próprio · @RNF04.3 schema reproduzível do repositório
 */

const URL_API = exigirLocal(
  process.env.DB_APP_API_URL ?? "postgresql://app_api:app_api_local@localhost:55432/avori",
  "DB_APP_API_URL",
)
const URL_AUTH = exigirLocal(
  process.env.DB_APP_AUTH_URL ?? "postgresql://app_auth:app_auth_local@localhost:55432/avori",
  "DB_APP_AUTH_URL",
)
const URL_ADMIN = exigirLocal(
  process.env.DATABASE_ADMIN_URL ?? "postgresql://postgres:postgres@localhost:55432/avori",
  "DATABASE_ADMIN_URL",
)

const { ana, bruno } = USUARIOS

let api: pg.Pool
let auth: pg.Client
let admin: pg.Client
let viagemDaAna: string

/** Roda `fn` como o usuário, do jeito que a API vai rodar. */
async function comoUsuario<T>(usuarioId: string, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const cliente = await api.connect()
  try {
    await cliente.query("begin")
    await cliente.query("set local role authenticated")
    await cliente.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: usuarioId, role: "authenticated" }),
    ])
    const resultado = await fn(cliente)
    await cliente.query("commit")
    return resultado
  } catch (erro) {
    await cliente.query("rollback")
    throw erro
  } finally {
    cliente.release()
  }
}

/** Mensagem do erro que `promessa` lança — para comparar o motivo, não só a falha. */
async function erroDe(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa
  } catch (erro) {
    return (erro as Error).message
  }
  throw new Error("era esperado um erro, e a operação passou")
}

beforeAll(async () => {
  // max: 1 — todas as transações passam pela mesma conexão física. É o que
  // permite provar que nada de uma transação sobra para a seguinte.
  api = new pg.Pool({ connectionString: URL_API, max: 1 })
  auth = new pg.Client({ connectionString: URL_AUTH })
  admin = new pg.Client({ connectionString: URL_ADMIN })
  await Promise.all([auth.connect(), admin.connect()])

  viagemDaAna = await comoUsuario(ana.id, async (c) => {
    const { rows } = await c.query(
      `insert into public.trips (user_id, title, destination, start_date, end_date)
       values ($1, 'Viagem da Ana (00-banco-proprio)', 'Lisboa', '2026-12-10', '2026-12-15')
       returning id`,
      [ana.id],
    )
    return rows[0].id as string
  })
})

afterAll(async () => {
  if (viagemDaAna) await admin.query("delete from public.trips where id = $1", [viagemDaAna])
  await Promise.all([api?.end(), auth?.end(), admin?.end()])
})

describe("banco montado do repositório", () => {
  it("toda migration de db/migrations/ está registrada como aplicada", async () => {
    const arquivos = fs
      .readdirSync("db/migrations")
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort()
    const { rows } = await admin.query("select versao from controle.schema_migrations order by versao")
    expect(rows.map((r) => r.versao)).toEqual(arquivos)
  })

  it("toda tabela de public tem RLS habilitada", async () => {
    const { rows } = await admin.query(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`,
    )
    expect(rows.map((r) => r.relname)).toEqual([])
  })

  it("o perfil nasce do usuário do Better Auth, com o nome em auth.users.name", async () => {
    const { rows } = await admin.query("select full_name from public.profiles where id = $1", [ana.id])
    expect(rows[0]?.full_name).toBe(ana.nome)
  })
})

describe("auth.uid() lê a identidade da transação", () => {
  it("devolve o sub das claims", async () => {
    const uid = await comoUsuario(bruno.id, async (c) => (await c.query("select auth.uid() as uid")).rows[0].uid)
    expect(uid).toBe(bruno.id)
  })

  it("devolve null sem claims", async () => {
    const cliente = await api.connect()
    try {
      await cliente.query("begin")
      await cliente.query("set local role authenticated")
      const { rows } = await cliente.query("select auth.uid() as uid")
      expect(rows[0].uid).toBeNull()
    } finally {
      await cliente.query("rollback")
      cliente.release()
    }
  })
})

describe("isolamento entre Ana e Bruno", () => {
  it("Ana vê a própria viagem", async () => {
    const linhas = await comoUsuario(ana.id, async (c) =>
      (await c.query("select id from public.trips where id = $1", [viagemDaAna])).rows,
    )
    expect(linhas).toHaveLength(1)
  })

  it("a viagem nasce com a Ana como dona em trip_members", async () => {
    const papel = await comoUsuario(ana.id, async (c) =>
      (await c.query("select role from public.trip_members where trip_id = $1 and user_id = $2", [viagemDaAna, ana.id]))
        .rows[0]?.role,
    )
    expect(papel).toBe("owner")
  })

  it("Bruno não vê a viagem da Ana (leitura)", async () => {
    const linhas = await comoUsuario(bruno.id, async (c) =>
      (await c.query("select id from public.trips where id = $1", [viagemDaAna])).rows,
    )
    expect(linhas).toEqual([])
  })

  it("Bruno não altera a viagem da Ana (escrita: update)", async () => {
    const alteradas = await comoUsuario(bruno.id, async (c) =>
      (await c.query("update public.trips set title = 'invadida' where id = $1", [viagemDaAna])).rowCount,
    )
    expect(alteradas).toBe(0)
    const { rows } = await admin.query("select title from public.trips where id = $1", [viagemDaAna])
    expect(rows[0].title).not.toBe("invadida")
  })

  it("Bruno não cria item no itinerário da Ana (escrita: insert)", async () => {
    const motivo = await erroDe(
      comoUsuario(bruno.id, (c) =>
        c.query(
          "insert into public.itinerary_items (trip_id, title, date) values ($1, 'intruso', '2026-12-11')",
          [viagemDaAna],
        ),
      ),
    )
    expect(motivo).toMatch(/row-level security/)
  })

  it("Bruno não apaga a viagem da Ana (escrita: delete)", async () => {
    const apagadas = await comoUsuario(bruno.id, async (c) =>
      (await c.query("delete from public.trips where id = $1", [viagemDaAna])).rowCount,
    )
    expect(apagadas).toBe(0)
  })
})

describe("exploração bloqueada", () => {
  it("app_api sem assumir papel não lê public.trips", async () => {
    const motivo = await erroDe(api.query("select id from public.trips limit 1"))
    expect(motivo).toMatch(/permission denied/)
  })

  it("app_api, mesmo como authenticated, não lê os hashes de senha em auth.accounts", async () => {
    const motivo = await erroDe(comoUsuario(ana.id, (c) => c.query("select password from auth.accounts limit 1")))
    expect(motivo).toMatch(/permission denied/)
  })

  it("app_api, mesmo como authenticated, não lê auth.sessions", async () => {
    const motivo = await erroDe(comoUsuario(ana.id, (c) => c.query("select token from auth.sessions limit 1")))
    expect(motivo).toMatch(/permission denied/)
  })

  it("app_api não assume o papel de superusuário", async () => {
    const motivo = await erroDe(api.query("set role postgres"))
    expect(motivo).toMatch(/permission denied/)
  })

  it("app_auth não lê public.trips", async () => {
    const motivo = await erroDe(auth.query("select id from public.trips limit 1"))
    expect(motivo).toMatch(/permission denied/)
  })

  it("depois da transação, a conexão volta ao pool sem papel nem identidade", async () => {
    await comoUsuario(ana.id, async () => undefined)
    // Pool com uma conexão só: esta consulta usa a mesma conexão física.
    const { rows } = await api.query(
      "select current_user as papel, nullif(current_setting('request.jwt.claims', true), '') as claims",
    )
    expect(rows[0]).toEqual({ papel: "app_api", claims: null })
  })
})
