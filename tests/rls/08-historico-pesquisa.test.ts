import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { Client } from "pg"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"

/**
 * O histórico de pesquisa da Rede social (S05-M-pesquisa): a tabela
 * public.search_history, com os perfis que cada um abriu pela pesquisa.
 *
 * Mesmo princípio de 04-social: cada usuário loga de verdade pelo GoTrue com a
 * chave anon e fala com o PostgREST como o navegador. O que precisa de estado
 * montado (16 entradas, uma entrada de 31 dias, o comando do job, apagar uma
 * conta) roda numa transação desfeita no fim, agindo como o usuário com o papel
 * `authenticated` e as claims do JWT, que é o que o PostgREST faz.
 *
 * O que se prova aqui:
 *   - cada um registra, lê e apaga só o próprio histórico;
 *   - ninguém grava em nome de outro, forja a data nem atualiza uma entrada;
 *   - ninguém registra a si mesmo;
 *   - ficam no máximo 15 entradas, e a mais antiga sai;
 *   - o que tem mais de 30 dias sai no próximo registro, o próprio dono o apaga
 *     (inclusive no "Limpar tudo"), e o job diário do pg_cron apaga o vencido de
 *     todo mundo;
 *   - apagar uma conta leva as entradas dela e as em que ela foi aberta;
 *   - visitante sem sessão não lê nem grava.
 *
 * Ana, Bruno e Carla são do seed. O histórico deles começa e termina vazio.
 *
 * @RF09.12 @RNF02.4
 */

const API = exigirLocal(variavelObrigatoria("API_URL"), "API_URL")
const CHAVE = variavelObrigatoria("ANON_KEY")
// Conexão direta só para montar estado e ler o catálogo, sempre numa transação
// desfeita no fim: o banco sai como entrou.
const CONEXAO = exigirLocal(variavelObrigatoria("DATABASE_URL"), "DATABASE_URL")

const ANA = { email: "teste.a@viajamais.local", senha: "viajamais123" }
const BRUNO = { email: "teste.b@viajamais.local", senha: "viajamais123" }
const CARLA = { email: "teste.c@viajamais.local", senha: "viajamais123" }

const VIOLA_RLS_OU_GRANT = "42501"
const VIOLA_UNICIDADE = "23505"
const VIOLA_CHECK = "23514"

const LIMITE = 15
const JOB = "social-apagar-pesquisas-vencidas"
/** O Davi do seed (supabase/seed.sql), que este arquivo não loga. */
const DAVI = "44444444-4444-4444-8444-444444444444"

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

let ana: SupabaseClient
let bruno: SupabaseClient
let carla: SupabaseClient
let visitante: SupabaseClient
let db: Client
let idAna: string
let idBruno: string
let idCarla: string

/** Cada um apaga o próprio histórico, falhando alto se não conseguir. */
async function limparHistoricos() {
  for (const [cliente, id] of [
    [ana, idAna],
    [bruno, idBruno],
    [carla, idCarla],
  ] as const) {
    const { error } = await cliente.from("search_history").delete().eq("user_id", id)
    if (error) throw new Error(`limpeza do histórico falhou: ${error.message}`)
  }
}

/** O histórico como o dono o vê, do mais recente para o mais antigo. */
async function historico(cliente: SupabaseClient) {
  const { data, error } = await cliente.from("search_history").select("user_id, profile_id").order("searched_at", { ascending: false })
  if (error) throw new Error(`leitura do histórico falhou: ${error.message}`)
  return data
}

/** Dentro de uma transação: daqui em diante, age como o usuário, igual ao PostgREST. */
async function agirComo(id: string, conexao: Client = db) {
  await conexao.query("set local role authenticated")
  await conexao.query("select set_config('request.jwt.claims', $1, true)", [
    JSON.stringify({ sub: id, role: "authenticated" }),
  ])
}

/**
 * Dentro de uma transação: grava todas as entradas e só depois as envelhece.
 * Gravada já vencida, uma entrada seria podada pelo trigger de INSERT na hora
 * (a dela ou a do próximo registro do mesmo dono), e o teste passaria sem provar
 * nada; o UPDATE direto no banco não dispara a poda.
 */
async function entradasComIdade(entradas: [dono: string, perfil: string, idade: string][]) {
  for (const [dono, perfil] of entradas) {
    await db.query("insert into public.search_history (user_id, profile_id) values ($1, $2)", [dono, perfil])
  }
  for (const [dono, perfil, idade] of entradas) {
    await db.query(
      "update public.search_history set searched_at = now() - $3::interval where user_id = $1 and profile_id = $2",
      [dono, perfil, idade],
    )
  }
}

/** Dentro de uma transação: cria N contas descartáveis (o perfil nasce pelo trigger). */
async function contasDescartaveis(n: number) {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (id, email)
     select gen_random_uuid(), 'descartavel.' || g || '.' || floor(random() * 1e9)::bigint || '@viajamais.local'
       from generate_series(1, $1) g
     returning id`,
    [n],
  )
  return rows.map((r) => r.id)
}

beforeAll(async () => {
  const a = await logar(ANA.email, ANA.senha)
  const b = await logar(BRUNO.email, BRUNO.senha)
  const c = await logar(CARLA.email, CARLA.senha)
  ana = a.cliente
  bruno = b.cliente
  carla = c.cliente
  idAna = a.usuario.id
  idBruno = b.usuario.id
  idCarla = c.usuario.id
  visitante = novoCliente()

  db = new Client({ connectionString: CONEXAO })
  await db.connect()

  await limparHistoricos()
})

afterAll(async () => {
  await limparHistoricos()
  await db.end()
})

describe("histórico — cada um só o próprio", () => {
  it("Ana registra a Carla e depois o Bruno, e lê os dois, do mais recente para o mais antigo", async () => {
    for (const perfil of [idCarla, idBruno]) {
      const { error } = await ana.from("search_history").insert({ user_id: idAna, profile_id: perfil })
      expect(error).toBeNull()
    }

    expect(await historico(ana)).toEqual([
      { user_id: idAna, profile_id: idBruno },
      { user_id: idAna, profile_id: idCarla },
    ])
  })

  it("Bruno não lê o histórico da Ana", async () => {
    const { data, error } = await bruno.from("search_history").select("profile_id").eq("user_id", idAna)
    expect(error).toBeNull()
    expect(data).toEqual([])
  })

  it("Bruno não grava no histórico da Ana (user_id forjado)", async () => {
    const { error } = await bruno.from("search_history").insert({ user_id: idAna, profile_id: idCarla })
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("Bruno não apaga o histórico da Ana: o DELETE não acha linha nenhuma", async () => {
    const { data, error } = await bruno.from("search_history").delete().eq("user_id", idAna).select("profile_id")
    expect(error).toBeNull()
    expect(data).toEqual([])

    const { rows } = await db.query("select count(*)::int as n from public.search_history where user_id = $1", [idAna])
    expect(rows[0].n).toBe(2)
  })

  it("nem sem filtro: um DELETE sem WHERE do Bruno só leva o histórico dele", async () => {
    // Com WHERE, a policy de SELECT já esconde as linhas da Ana. Sem WHERE, só a
    // policy de DELETE as protege: aberta, ela deixava o Bruno apagar tudo.
    await db.query("begin")
    try {
      // O Davi como a pessoa aberta: ninguém deste bloco o registra.
      await db.query("insert into public.search_history (user_id, profile_id) values ($1, $3), ($2, $3)", [
        idAna,
        idBruno,
        DAVI,
      ])
      await agirComo(idBruno)
      await db.query("delete from public.search_history")
      await db.query("reset role")
      const { rows } = await db.query("select user_id from public.search_history where profile_id = $1", [DAVI])
      expect(rows).toEqual([{ user_id: idAna }])
    } finally {
      await db.query("rollback")
    }
  })

  it("a data não é do cliente: searched_at no corpo dá 42501, e não existe UPDATE", async () => {
    const comData = await carla
      .from("search_history")
      .insert({ user_id: idCarla, profile_id: idAna, searched_at: "2099-01-01T00:00:00Z" })
    expect(comData.error?.code).toBe(VIOLA_RLS_OU_GRANT)

    const atualizar = await ana
      .from("search_history")
      .update({ searched_at: "2099-01-01T00:00:00Z" })
      .eq("user_id", idAna)
    expect(atualizar.error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("ninguém registra a si mesmo (constraint)", async () => {
    const { error } = await carla.from("search_history").insert({ user_id: idCarla, profile_id: idCarla })
    expect(error?.code).toBe(VIOLA_CHECK)
  })

  it("a mesma pessoa duas vezes esbarra na chave: por isso a rota apaga antes de gravar", async () => {
    const { error } = await ana.from("search_history").insert({ user_id: idAna, profile_id: idCarla })
    expect(error?.code).toBe(VIOLA_UNICIDADE)
  })

  it("o upsert da rota (ON CONFLICT DO NOTHING) passa pelos grants e não duplica", async () => {
    // A chamada de lib/social/pesquisas.ts, com a entrada já lá: é o caso de
    // dois cliques ao mesmo tempo, depois de os dois apagarem a antiga.
    const { error } = await ana
      .from("search_history")
      .upsert({ user_id: idAna, profile_id: idCarla }, { onConflict: "user_id,profile_id", ignoreDuplicates: true })
    expect(error).toBeNull()
    expect(await historico(ana)).toHaveLength(2)
  })

  it("Ana apaga uma entrada e depois o resto, só no próprio histórico", async () => {
    const um = await ana.from("search_history").delete().eq("user_id", idAna).eq("profile_id", idBruno)
    expect(um.error).toBeNull()
    expect(await historico(ana)).toEqual([{ user_id: idAna, profile_id: idCarla }])

    const tudo = await ana.from("search_history").delete().eq("user_id", idAna)
    expect(tudo.error).toBeNull()
    expect(await historico(ana)).toEqual([])
  })

  it("visitante sem sessão não lê nem grava", async () => {
    const ler = await visitante.from("search_history").select("profile_id")
    expect(ler.error?.code).toBe(VIOLA_RLS_OU_GRANT)

    const gravar = await visitante.from("search_history").insert({ user_id: idAna, profile_id: idCarla })
    expect(gravar.error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })
})

describe("histórico — 15 entradas e 30 dias", () => {
  it(`o ${LIMITE + 1}º registro apaga o mais antigo: ficam ${LIMITE}`, async () => {
    await db.query("begin")
    try {
      const outras = await contasDescartaveis(LIMITE + 1)
      // As 15 primeiras com datas escalonadas, direto no banco (a mais antiga é
      // outras[0]); a 16ª entra pela Ana, com a data do banco.
      for (const [i, perfil] of outras.slice(0, LIMITE).entries()) {
        await db.query(
          "insert into public.search_history (user_id, profile_id, searched_at) values ($1, $2, now() - make_interval(mins => $3))",
          [idAna, perfil, LIMITE - i],
        )
      }
      await agirComo(idAna)
      await db.query("insert into public.search_history (user_id, profile_id) values ($1, $2)", [idAna, outras[LIMITE]])

      const { rows } = await db.query<{ profile_id: string }>(
        "select profile_id from public.search_history where user_id = $1 order by searched_at desc",
        [idAna],
      )
      expect(rows).toHaveLength(LIMITE)
      expect(rows[0].profile_id, "a nova vai para o topo").toBe(outras[LIMITE])
      expect(rows.map((r) => r.profile_id), "a mais antiga saiu").not.toContain(outras[0])
    } finally {
      await db.query("rollback")
    }
  })

  it("o que tem mais de 30 dias sai no próximo registro de outra pessoa", async () => {
    await db.query("begin")
    try {
      await entradasComIdade([[idAna, idCarla, "31 days"]])
      const antes = await db.query("select count(*)::int as n from public.search_history where user_id = $1", [idAna])
      expect(antes.rows[0].n, "pré-condição: o vencido está no banco").toBe(1)

      await agirComo(idAna)
      await db.query("insert into public.search_history (user_id, profile_id) values ($1, $2)", [idAna, idBruno])
      await db.query("reset role")
      const { rows } = await db.query("select profile_id from public.search_history where user_id = $1", [idAna])
      expect(rows, "o registro novo podou o vencido").toEqual([{ profile_id: idBruno }])
    } finally {
      await db.query("rollback")
    }
  })

  it("o dono enxerga o próprio vencido: reabrir a mesma pessoa a traz de volta, e Limpar tudo o apaga (regressão)", async () => {
    // A primeira versão escondia o vencido na policy de SELECT. Como DELETE com
    // WHERE também passa por ela, o dono não apagava o próprio vencido: reabrir a
    // mesma pessoa batia na linha invisível (ON CONFLICT DO NOTHING) e não
    // registrava nada, e o "Limpar tudo" deixava o vencido no banco. Quem
    // esconde o vencido da tela agora é a leitura da rota (lib/social/pesquisas.ts).
    await db.query("begin")
    try {
      await entradasComIdade([[idAna, idCarla, "31 days"]])
      await agirComo(idAna)

      // As duas chamadas da rota para reabrir a Carla.
      await db.query("delete from public.search_history where user_id = $1 and profile_id = $2", [idAna, idCarla])
      await db.query(
        "insert into public.search_history (user_id, profile_id) values ($1, $2) on conflict (user_id, profile_id) do nothing",
        [idAna, idCarla],
      )
      const reaberta = await db.query<{ recente: boolean }>(
        "select searched_at > now() - interval '1 minute' as recente from public.search_history where profile_id = $1",
        [idCarla],
      )
      expect(reaberta.rows, "a Carla voltou ao histórico, com a data de agora").toEqual([{ recente: true }])

      // E o "Limpar tudo" leva o vencido junto (montado com o papel do banco).
      await db.query("reset role")
      await entradasComIdade([[idAna, idBruno, "31 days"]])
      await agirComo(idAna)
      await db.query("delete from public.search_history where user_id = $1", [idAna])
      await db.query("reset role")
      const { rows } = await db.query("select count(*)::int as n from public.search_history where user_id = $1", [idAna])
      expect(rows[0].n, "nada sobra no banco, nem o vencido").toBe(0)
    } finally {
      await db.query("rollback")
    }
  })

  it("o teto de 15 vale também com dois registros ao mesmo tempo (regressão)", async () => {
    // Sem um lock por dono, cada trigger via só o próprio registro e as 14 já
    // confirmadas, e ficavam 16. Aqui os dois registros são simultâneos de
    // verdade: o segundo começa antes de o primeiro confirmar.
    const outra = new Client({ connectionString: CONEXAO })
    await outra.connect()
    const contas = await contasDescartaveis(LIMITE + 1)
    try {
      for (const [i, perfil] of contas.slice(0, LIMITE - 1).entries()) {
        await db.query(
          "insert into public.search_history (user_id, profile_id, searched_at) values ($1, $2, now() - make_interval(mins => $3))",
          [idAna, perfil, LIMITE - i],
        )
      }

      await db.query("begin")
      await agirComo(idAna)
      await db.query("insert into public.search_history (user_id, profile_id) values ($1, $2)", [idAna, contas[LIMITE - 1]])

      await outra.query("begin")
      await agirComo(idAna, outra)
      const segundo = outra.query("insert into public.search_history (user_id, profile_id) values ($1, $2)", [
        idAna,
        contas[LIMITE],
      ])
      await new Promise((pronto) => setTimeout(pronto, 300))
      await db.query("commit")
      await segundo
      await outra.query("commit")

      const { rows } = await db.query("select count(*)::int as n from public.search_history where user_id = $1", [idAna])
      expect(rows[0].n).toBe(LIMITE)
    } finally {
      await db.query("rollback").catch(() => {})
      await outra.query("rollback").catch(() => {})
      await outra.end()
      // As entradas antes das contas: a limpeza não pode depender da cascata
      // que outro teste prova (nem sobrar conta descartável se ela faltar).
      await db.query("delete from public.search_history where profile_id = any($1::uuid[])", [contas])
      await db.query("delete from auth.users where id = any($1::uuid[])", [contas])
    }
  })

  it("a poda de um registro não toca o histórico de outra pessoa", async () => {
    await db.query("begin")
    try {
      // Uma entrada do Bruno vencida e uma recente: nenhuma está entre as 15 da
      // Ana, e nenhuma pode sair quando a Ana registra. O registro vai sem RLS
      // (com o papel do banco, como um seed ou a chave de serviço): agindo como a
      // Ana, a RLS já esconderia o histórico do Bruno, e o teste não provaria o
      // filtro de dono do próprio trigger.
      await entradasComIdade([
        [idBruno, idCarla, "31 days"],
        [idBruno, idAna, "1 minute"],
      ])
      await db.query("insert into public.search_history (user_id, profile_id) values ($1, $2)", [idAna, idBruno])
      const { rows } = await db.query("select count(*)::int as n from public.search_history where user_id = $1", [idBruno])
      expect(rows[0].n, "o histórico do Bruno só muda pelo registro dele ou pelo job").toBe(2)
    } finally {
      await db.query("rollback")
    }
  })

  it("o job diário do pg_cron existe e apaga só o vencido, de todo mundo", async () => {
    const { rows: jobs } = await db.query(
      "select schedule, command, username, active from cron.job where jobname = $1",
      [JOB],
    )
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ schedule: "15 3 * * *", username: "postgres", active: true })

    await db.query("begin")
    try {
      await entradasComIdade([
        [idAna, idCarla, "31 days"],
        [idBruno, idCarla, "31 days"],
        [idAna, idBruno, "29 days"],
      ])
      const antes = await db.query("select count(*)::int as n from public.search_history")
      expect(antes.rows[0].n, "pré-condição: os dois vencidos estão no banco").toBe(3)

      // O comando que o job roda, como ele roda: com o dono da tabela.
      await db.query(jobs[0].command)
      const { rows } = await db.query("select user_id, profile_id from public.search_history order by user_id")
      expect(rows).toEqual([{ user_id: idAna, profile_id: idBruno }])
    } finally {
      await db.query("rollback")
    }
  })
})

describe("histórico — some com as contas", () => {
  it("apagar a conta leva as entradas dela e as entradas em que ela foi aberta", async () => {
    await db.query("begin")
    try {
      await db.query(
        // Carla→Ana (dela), Ana→Carla (ela foi aberta) e Bruno→Ana, que fica.
        `insert into public.search_history (user_id, profile_id) values ($1, $2), ($2, $1), ($3, $2)`,
        [idCarla, idAna, idBruno],
      )
      await db.query("delete from auth.users where id = $1", [idCarla])
      const { rows } = await db.query("select user_id, profile_id from public.search_history")
      expect(rows).toEqual([{ user_id: idBruno, profile_id: idAna }])
    } finally {
      await db.query("rollback")
    }
  })
})

describe("histórico — catálogo", () => {
  it("a poda é SECURITY INVOKER (a RLS vale dentro dela), com search_path vazio, e ninguém da Data API a executa", async () => {
    const { rows } = await db.query(
      `select p.prosecdef, p.proconfig,
              has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as autenticado
         from pg_proc p
        where p.oid = 'public.search_history_podar()'::regprocedure`,
    )
    expect(rows).toEqual([{ prosecdef: false, proconfig: ['search_path=""'], anon: false, autenticado: false }])
  })

  it("o pg_cron continua reconfigurável: um novo CREATE EXTENSION não quebra (regressão)", async () => {
    // O event trigger da Supabase (issue_pg_cron_access) refaz os grants do
    // schema cron a cada CREATE EXTENSION. A primeira versão da migration repetia
    // um "grant all ... to postgres", que gravava postgres concedendo a si mesmo,
    // e o REVOKE do event trigger passava a falhar com "dependent privileges
    // exist" em qualquer migration futura que criasse a extensão.
    const { rows } = await db.query(
      `select count(*)::int as n
         from pg_class c, aclexplode(c.relacl) a
        where c.relnamespace = 'cron'::regnamespace
          and a.grantor = 'postgres'::regrole
          and a.grantee = 'postgres'::regrole`,
    )
    expect(rows[0].n, "nenhum grant de postgres para si mesmo no schema cron").toBe(0)

    await db.query("begin")
    try {
      await db.query("create extension if not exists pg_cron with schema pg_catalog")
    } finally {
      await db.query("rollback")
    }
  })

  it("só authenticated tem acesso, e o INSERT só nas duas colunas", async () => {
    const { rows } = await db.query(
      `select has_table_privilege('anon', 'public.search_history', 'select') as anon_le,
              has_table_privilege('authenticated', 'public.search_history', 'update') as atualiza,
              has_column_privilege('authenticated', 'public.search_history', 'searched_at', 'insert') as data,
              has_column_privilege('authenticated', 'public.search_history', 'profile_id', 'insert') as perfil`,
    )
    expect(rows).toEqual([{ anon_le: false, atualiza: false, data: false, perfil: true }])
  })
})
