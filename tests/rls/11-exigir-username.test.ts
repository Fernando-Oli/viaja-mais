import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { Client } from "pg"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"

/**
 * Exigir username para entrar na rede (S05-M-listas, achado I1 da revisão
 * independente; decisão do Micael em 10/11, como no Instagram).
 *
 * Sem isso, um seguidor sem username ficava invisível nas listas (que só
 * mostram quem tem página), não podia ser removido (a rota acha a pessoa pelo
 * username) e continuava vendo a rede do dono. A migration de proposta
 * `*_social_exigir_username.sql` fecha o caminho no banco, para quem grava pela
 * Data API e não pela rota:
 *   - a policy `follows_insert` exige username nas duas pontas;
 *   - um username que já existe não volta a nulo (trigger em `profiles`, que
 *     vale também para a chave de serviço e o SQL direto);
 *   - a `contar_rede` conta só vínculos em que a outra ponta tem username, como
 *     as listas;
 *   - os vínculos legados com uma ponta sem username saem na migration.
 *
 * Cada usuário loga de verdade pelo GoTrue com a chave anon. A conta sem
 * username nasce pelo cadastro (sem confirmação no ambiente local) e sai no fim,
 * com os vínculos em cascata. A conexão direta só monta estado e roda a
 * migration de novo dentro de uma transação desfeita.
 *
 * @RF09.9 @RF02.5 @RNF02.4
 */

const API = exigirLocal(variavelObrigatoria("API_URL"), "API_URL")
const CHAVE = variavelObrigatoria("ANON_KEY")
const CONEXAO = exigirLocal(variavelObrigatoria("DATABASE_URL"), "DATABASE_URL")

const ANA = { email: "teste.a@viajamais.local", senha: "viajamais123" }
const CARLA = { email: "teste.c@viajamais.local", senha: "viajamais123" }
const SENHA = "viajamais123"

const VIOLA_RLS_OU_GRANT = "42501"
const VIOLA_CHECK = "23514"

function novoCliente() {
  return createClient(API, CHAVE, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function logar(email: string, senha: string) {
  const cliente = novoCliente()
  const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(`falha ao logar como ${email}: ${error.message}`)
  return { cliente, usuario: data.user as User }
}

/** A migration desta correção, pelo nome: o timestamp vem do `migration new`. */
function sqlDaMigration() {
  const pasta = path.join(process.cwd(), "supabase", "migrations")
  const arquivo = readdirSync(pasta).find((nome) => /^\d{14}_social_exigir_username\.sql$/.test(nome))
  if (!arquivo) throw new Error("a migration *_social_exigir_username.sql não existe")
  return readFileSync(path.join(pasta, arquivo), "utf8")
}

let carla: SupabaseClient
let semNome: SupabaseClient
let db: Client
let idAna: string
let idCarla: string
let idSemNome: string

/** Dentro de uma transação: daqui em diante, age como o usuário, igual ao PostgREST. */
async function agirComo(id: string) {
  await db.query("set local role authenticated")
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: id, role: "authenticated" })])
}

async function limparVinculos() {
  await db.query("delete from public.follows where follower_id = any($1::uuid[]) or followee_id = any($1::uuid[])", [
    [idAna, idCarla, idSemNome],
  ])
}

beforeAll(async () => {
  const a = await logar(ANA.email, ANA.senha)
  const c = await logar(CARLA.email, CARLA.senha)
  carla = c.cliente
  idAna = a.usuario.id
  idCarla = c.usuario.id

  // Conta nova pelo cadastro, como qualquer pessoa: o perfil nasce sem username.
  semNome = novoCliente()
  const email = `semnome.${Date.now()}.${Math.floor(Math.random() * 1e6)}@viajamais.local`
  const { data, error } = await semNome.auth.signUp({ email, password: SENHA })
  if (error || !data.user) throw new Error(`falha no cadastro: ${error?.message}`)
  idSemNome = data.user.id
  const { data: perfil } = await semNome.from("profiles").select("username").eq("id", idSemNome).single()
  expect(perfil?.username, "a conta nova nasce sem username").toBeNull()

  db = new Client({ connectionString: CONEXAO })
  await db.connect()
  await limparVinculos()
})

afterEach(async () => {
  await limparVinculos()
})

afterAll(async () => {
  await limparVinculos()
  await db.query("update public.profiles set username = 'carla' where id = $1", [idCarla])
  if (idSemNome) await db.query("delete from auth.users where id = $1", [idSemNome])
  await db.end()
})

describe("exigir username — quem entra na rede", () => {
  it("uma conta sem username não segue ninguém pela Data API (regressão)", async () => {
    const { error } = await semNome.from("follows").insert({ follower_id: idSemNome, followee_id: idAna })

    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    const { rows } = await db.query("select 1 from public.follows where follower_id = $1", [idSemNome])
    expect(rows).toEqual([])
  })

  it("ninguém segue uma conta sem username (regressão)", async () => {
    const { error } = await carla.from("follows").insert({ follower_id: idCarla, followee_id: idSemNome })

    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("com username escolhido, a mesma conta segue: a primeira escolha continua livre", async () => {
    await db.query("begin")
    try {
      await db.query("update public.profiles set username = $2 where id = $1", [idSemNome, `semnome_${Date.now().toString(36)}`])
      await agirComo(idSemNome)
      const { rowCount } = await db.query("insert into public.follows (follower_id, followee_id) values ($1, $2)", [idSemNome, idAna])
      expect(rowCount).toBe(1)
    } finally {
      await db.query("rollback")
    }
  })
})

describe("exigir username — quem já tem não volta a nulo", () => {
  it("o seguidor aceito não zera o próprio username pela Data API (regressão)", async () => {
    const seguir = await carla.from("follows").insert({ follower_id: idCarla, followee_id: idAna })
    expect(seguir.error).toBeNull()

    try {
      const { data, error } = await carla.from("profiles").update({ username: null }).eq("id", idCarla).select("username")
      expect(error?.code).toBe(VIOLA_CHECK)
      expect(data).toBeNull()
      const { rows } = await db.query("select username from public.profiles where id = $1", [idCarla])
      expect(rows[0].username).toBe("carla")
    } finally {
      await db.query("update public.profiles set username = 'carla' where id = $1", [idCarla])
      await limparVinculos()
    }
  })

  it("vale também para quem grava sem a Data API: o SQL direto também é recusado (regressão)", async () => {
    await db.query("begin")
    try {
      await expect(db.query("update public.profiles set username = null where id = $1", [idAna])).rejects.toMatchObject({
        code: VIOLA_CHECK,
      })
    } finally {
      await db.query("rollback")
    }
  })

  it("trocar um username por outro continua livre", async () => {
    await db.query("begin")
    try {
      const { rowCount } = await db.query("update public.profiles set username = 'carla_nova' where id = $1", [idCarla])
      expect(rowCount).toBe(1)
    } finally {
      await db.query("rollback")
    }
  })
})

describe("exigir username — a contagem e o legado", () => {
  it("a contar_rede não conta um seguidor sem username, como a lista não o mostra (regressão)", async () => {
    await db.query("begin")
    try {
      // O vínculo legado só entra pelo papel do banco: pela Data API ele já é recusado.
      await db.query("insert into public.follows (follower_id, followee_id) values ($1, $2)", [idSemNome, idAna])
      await agirComo(idCarla)
      const { rows } = await db.query("select seguidores::int from public.contar_rede($1)", [idAna])
      const { rows: lista } = await db.query(
        `select count(*)::int as n from public.follows f join public.profiles p on p.id = f.follower_id
          where f.followee_id = $1 and f.status = 'accepted' and p.username is not null`,
        [idAna],
      )
      expect(rows[0].seguidores).toBe(lista[0].n)
      expect(rows[0].seguidores).toBe(0)
    } finally {
      await db.query("rollback")
    }
  })

  it("a migration apaga os vínculos legados com uma ponta sem username, e só eles (regressão)", async () => {
    const sql = sqlDaMigration()
    await db.query("begin")
    try {
      await db.query("insert into public.follows (follower_id, followee_id) values ($1, $2), ($3, $1)", [idSemNome, idAna, idCarla])
      await db.query("update public.follows set status = 'accepted' where follower_id = $1 and followee_id = $2", [idCarla, idSemNome])
      await db.query("insert into public.follows (follower_id, followee_id) values ($1, $2)", [idCarla, idAna])

      await db.query(sql)

      const { rows } = await db.query(
        `select follower_id, followee_id from public.follows
          where follower_id = any($1::uuid[]) or followee_id = any($1::uuid[])`,
        [[idSemNome, idAna, idCarla]],
      )
      expect(rows).toEqual([{ follower_id: idCarla, followee_id: idAna }])
    } finally {
      await db.query("rollback")
    }
  })
})
