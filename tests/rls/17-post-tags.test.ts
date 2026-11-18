import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { type SupabaseClient } from "@supabase/supabase-js"
import { Client } from "pg"
import { SENHA_TESTE } from "../fixtures/usuarios"
import { CONEXAO, logar, novoCliente } from "./apoio"

/**
 * Marcar membros num post (S06-M-publicar-viagem): a tabela `post_tags` e a
 * função `social_pode_marcar` da migration 20261116234030.
 *
 * Mesmo princípio de 12-trip-posts: cada pessoa loga de verdade pelo GoTrue
 * com a chave anon e fala com o PostgREST como o navegador; a conexão direta só
 * monta o estado, com contas descartáveis, e tudo sai no fim.
 *
 * O que se prova aqui (decisões do Micael em 16/11):
 *   - só a autora do post marca, só membro da mesma viagem, com username, e
 *     nunca a si mesma; quem saiu da viagem não marca; a marca não é forjada
 *     em nome de outra pessoa;
 *   - a marca segue a visibilidade do post, MAS ser marcado não abre o post:
 *     o membro que não segue a autora privada vê só a própria marca e quem o
 *     marcou (comportamento do Instagram) — a trip_posts continua fechada;
 *   - a pessoa marcada remove a própria marca; a autora desmarca; um terceiro
 *     não apaga nada; não há UPDATE;
 *   - as cascatas: apagar o post leva as marcas; sair da viagem não leva;
 *   - a função só responde sobre o post da sessão;
 *   - social_membros_marcaveis (migration 20261118092400): o membro recebe os
 *     outros membros com username, nunca a si mesmo; quem não é membro recebe
 *     vazio; anon não executa.
 *
 * @RF09.13 @RF09.14 @RNF02.4
 */

const VIOLA_RLS_OU_GRANT = "42501"
const VIOLA_CHECK = "23514"
const VIOLA_UNIQUE = "23505"

const marca = `t${Date.now().toString(36)}`

type Ator = { id: string; cliente: SupabaseClient }

let db: Client
let visitante: SupabaseClient

// Viagem A, pública: a autora e dois membros (um sem username).
let autora: Ator
let membro: Ator
let semNome: Ator
// Viagem B: o autor é privado; davi foi na viagem mas não o segue.
let privado: Ator
let davi: Ator
let seguidora: Ator
// Sem vínculo com nenhuma das viagens.
let estranho: Ator

let viagemA: string
let viagemB: string

const contas: string[] = []
const viagens: string[] = []

/** Conta descartável e logável, como as do seed.sql; o perfil nasce pelo trigger. */
async function criarAtor(rotulo: string, opcoes: { username?: boolean; privado?: boolean } = {}): Promise<Ator> {
  const email = `tags.${marca}.${rotulo}@viajamais.local`
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (
       instance_id, id, aud, role, email, encrypted_password,
       email_confirmed_at, created_at, updated_at,
       raw_app_meta_data, raw_user_meta_data,
       confirmation_token, recovery_token, email_change_token_new, email_change
     ) values (
       '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
       $1, extensions.crypt($2, extensions.gen_salt('bf')),
       now(), now(), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('full_name', $3::text),
       '', '', '', ''
     ) returning id`,
    [email, SENHA_TESTE, `Tags ${rotulo}`],
  )
  const id = rows[0].id
  contas.push(id)
  await db.query(
    `insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
     values (gen_random_uuid(), $1::uuid, jsonb_build_object('sub', $3::text, 'email', $2::text, 'email_verified', true),
             'email', $3::text, now(), now(), now())`,
    [id, email, id],
  )
  if (opcoes.username !== false) {
    await db.query("update public.profiles set username = $2, is_public = $3 where id = $1", [
      id,
      `${marca}_${rotulo}`,
      !opcoes.privado,
    ])
  } else {
    await db.query("update public.profiles set is_public = true where id = $1", [id])
  }

  const { cliente } = await logar(email)
  return { id, cliente }
}

/** O dono entra como membro pelo trigger. */
async function criarViagem(dono: string, membros: string[] = []) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.trips (user_id, title, destination, start_date, end_date)
     values ($1, 'Viagem marcada', 'Lisboa', '2026-12-10', '2026-12-20') returning id`,
    [dono],
  )
  const id = rows[0].id
  viagens.push(id)
  for (const m of membros) {
    await db.query("insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member')", [id, m])
  }
  return id
}

async function seguir(seguidor: string, seguido: string) {
  await db.query("insert into public.follows (follower_id, followee_id) values ($1, $2)", [seguidor, seguido])
  await db.query("update public.follows set status = 'accepted' where follower_id = $1 and followee_id = $2", [
    seguidor,
    seguido,
  ])
}

/** Post gravado pela conexão direta, para os testes não dependerem da escrita da trip_posts. */
async function postDireto(autor: string, viagem: string) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.trip_posts (trip_id, author_id, title, destination, start_date, end_date, items)
     values ($1, $2, 'Férias em Portugal', 'Lisboa', '2026-12-10', '2026-12-20', '[{"title":"Voo"}]')
     returning id`,
    [viagem, autor],
  )
  return rows[0].id
}

async function marcarDireto(post: string, marcado: string, autor: string) {
  await db.query("insert into public.post_tags (post_id, tagged_id, author_id) values ($1, $2, $3)", [
    post,
    marcado,
    autor,
  ])
}

async function marcasNoBanco(post: string) {
  const { rows } = await db.query<{ tagged_id: string }>(
    "select tagged_id from public.post_tags where post_id = $1 order by tagged_id",
    [post],
  )
  return rows.map((r) => r.tagged_id)
}

/** A escrita como o navegador faria: o autor declarado é a própria sessão, salvo quando o teste forja. */
function marcar(ator: Ator, post: string, marcado: string, autor = ator.id) {
  return ator.cliente.from("post_tags").insert({ post_id: post, tagged_id: marcado, author_id: autor })
}

beforeAll(async () => {
  db = new Client({ connectionString: CONEXAO })
  await db.connect()
  visitante = novoCliente()

  autora = await criarAtor("autora")
  membro = await criarAtor("membro")
  semNome = await criarAtor("semnome", { username: false })
  privado = await criarAtor("privado", { privado: true })
  davi = await criarAtor("davi")
  seguidora = await criarAtor("seguidora")
  estranho = await criarAtor("estranho")

  viagemA = await criarViagem(autora.id, [membro.id, semNome.id])
  viagemB = await criarViagem(privado.id, [davi.id])

  await seguir(seguidora.id, privado.id)
}, 60_000)

afterAll(async () => {
  try {
    // Viagens antes das contas: a cascata leva posts, marcas e membros.
    if (viagens.length) await db.query("delete from public.trips where id = any($1::uuid[])", [viagens])
    if (contas.length) await db.query("delete from auth.users where id = any($1::uuid[])", [contas])
  } finally {
    await db.end()
  }
})

describe("escrita: só a autora marca, só membro da viagem com username", () => {
  let post: string

  beforeAll(async () => {
    post = await postDireto(autora.id, viagemA)
  })

  // Um post por membro e viagem: o próximo bloco publica de novo.
  afterAll(async () => {
    await db.query("delete from public.trip_posts where id = any($1::uuid[])", [[post]])
  })

  it("a autora marca um membro da viagem (o caso legítimo)", async () => {
    const { error } = await marcar(autora, post, membro.id)
    expect(error).toBeNull()
    expect(await marcasNoBanco(post)).toEqual([membro.id])
  })

  it("a mesma pessoa não é marcada duas vezes no mesmo post", async () => {
    const { error } = await marcar(autora, post, membro.id)
    expect(error?.code).toBe(VIOLA_UNIQUE)
  })

  it("quem não foi na viagem não é marcado", async () => {
    const { error } = await marcar(autora, post, estranho.id)
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    expect(await marcasNoBanco(post)).not.toContain(estranho.id)
  })

  it("membro sem username não é marcado", async () => {
    const { error } = await marcar(autora, post, semNome.id)
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("a autora não marca a si mesma", async () => {
    const { error } = await marcar(autora, post, autora.id)
    // A policy recusa antes, e o CHECK é a última linha.
    expect([VIOLA_RLS_OU_GRANT, VIOLA_CHECK]).toContain(error?.code)
  })

  it("outro membro não marca no post da autora, nem em nome dela", async () => {
    const emNomeProprio = await marcar(membro, post, semNome.id)
    expect(emNomeProprio.error?.code).toBe(VIOLA_RLS_OU_GRANT)
    const forjado = await marcar(membro, post, autora.id, autora.id)
    expect(forjado.error?.code).toBe(VIOLA_RLS_OU_GRANT)
    expect(await marcasNoBanco(post)).toEqual([membro.id])
  })

  it("a autora não marca em post de outra viagem de que não participa", async () => {
    const postB = await postDireto(privado.id, viagemB)
    const { error } = await marcar(autora, postB, davi.id, privado.id)
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    await db.query("delete from public.trip_posts where id = $1", [postB])
  })

  it("quem saiu da viagem não marca mais, nem no próprio post", async () => {
    const postDoMembro = await postDireto(membro.id, viagemA)
    await db.query("delete from public.trip_members where trip_id = $1 and user_id = $2", [viagemA, membro.id])
    try {
      const { error } = await marcar(membro, postDoMembro, autora.id)
      expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    } finally {
      await db.query("insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member')", [
        viagemA,
        membro.id,
      ])
      await db.query("delete from public.trip_posts where id = $1", [postDoMembro])
    }
  })

  it("não há UPDATE: a marca não é repontada para outra pessoa", async () => {
    const { error } = await autora.cliente
      .from("post_tags")
      .update({ tagged_id: semNome.id })
      .eq("post_id", post)
      .select("tagged_id")
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    expect(await marcasNoBanco(post)).toEqual([membro.id])
  })

  it("o visitante sem sessão não marca nem lê", async () => {
    const escrita = await visitante
      .from("post_tags")
      .insert({ post_id: post, tagged_id: membro.id, author_id: autora.id })
    expect(escrita.error).not.toBeNull()
    const leitura = await visitante.from("post_tags").select("post_id").eq("post_id", post)
    expect(leitura.data ?? []).toEqual([])
  })
})

describe("leitura: a marca segue o post, mas ser marcado não abre o post", () => {
  let postPublico: string
  let postPrivado: string

  beforeAll(async () => {
    postPublico = await postDireto(autora.id, viagemA)
    await marcarDireto(postPublico, membro.id, autora.id)
    postPrivado = await postDireto(privado.id, viagemB)
    await marcarDireto(postPrivado, davi.id, privado.id)
  })

  // Um post por membro e viagem: o próximo bloco publica de novo.
  afterAll(async () => {
    await db.query("delete from public.trip_posts where id = any($1::uuid[])", [[postPublico, postPrivado]])
  })

  it("as marcas de um post público são lidas por qualquer autenticado", async () => {
    const { data, error } = await estranho.cliente
      .from("post_tags")
      .select("post_id, tagged_id, author_id")
      .eq("post_id", postPublico)
    expect(error).toBeNull()
    expect(data).toEqual([{ post_id: postPublico, tagged_id: membro.id, author_id: autora.id }])
  })

  it("quem não segue o autor privado não lê as marcas do post dele", async () => {
    const { data } = await estranho.cliente.from("post_tags").select("tagged_id").eq("post_id", postPrivado)
    expect(data).toEqual([])
  })

  it("a seguidora aceita lê as marcas do post privado", async () => {
    const { data } = await seguidora.cliente.from("post_tags").select("tagged_id").eq("post_id", postPrivado)
    expect(data).toEqual([{ tagged_id: davi.id }])
  })

  it("o marcado que não segue o autor privado vê a própria marca e quem o marcou", async () => {
    const { data, error } = await davi.cliente
      .from("post_tags")
      .select("post_id, author_id")
      .eq("tagged_id", davi.id)
    expect(error).toBeNull()
    expect(data).toEqual([{ post_id: postPrivado, author_id: privado.id }])
  })

  it("…mas não lê o post (opção 2, como no Instagram)", async () => {
    const { data } = await davi.cliente.from("trip_posts").select("id, title").eq("id", postPrivado)
    expect(data).toEqual([])
  })
})

describe("remoção: a pessoa marcada remove a própria marca", () => {
  let post: string

  beforeAll(async () => {
    post = await postDireto(privado.id, viagemB)
    await marcarDireto(post, davi.id, privado.id)
  })

  // Um post por membro e viagem: o próximo bloco publica de novo.
  afterAll(async () => {
    await db.query("delete from public.trip_posts where id = any($1::uuid[])", [[post]])
  })

  it("um terceiro, mesmo vendo o post, não apaga a marca de outra pessoa", async () => {
    const { data } = await seguidora.cliente.from("post_tags").delete().eq("post_id", post).select("tagged_id")
    expect(data ?? []).toEqual([])
    expect(await marcasNoBanco(post)).toEqual([davi.id])
  })

  it("o marcado remove a própria marca, mesmo sem enxergar o post", async () => {
    const { data, error } = await davi.cliente
      .from("post_tags")
      .delete()
      .eq("post_id", post)
      .eq("tagged_id", davi.id)
      .select("tagged_id")
    expect(error).toBeNull()
    expect(data).toEqual([{ tagged_id: davi.id }])
    expect(await marcasNoBanco(post)).toEqual([])
  })

  it("a autora desmarca quem marcou", async () => {
    await marcarDireto(post, davi.id, privado.id)
    const { data, error } = await privado.cliente
      .from("post_tags")
      .delete()
      .eq("post_id", post)
      .eq("tagged_id", davi.id)
      .select("tagged_id")
    expect(error).toBeNull()
    expect(data).toEqual([{ tagged_id: davi.id }])
  })
})

describe("cascatas e a função", () => {
  it("apagar o post apaga as marcas dele", async () => {
    const post = await postDireto(autora.id, viagemA)
    await marcarDireto(post, membro.id, autora.id)
    await db.query("delete from public.trip_posts where id = $1", [post])
    expect(await marcasNoBanco(post)).toEqual([])
  })

  it("a marca continua quando o marcado sai da viagem", async () => {
    const post = await postDireto(autora.id, viagemA)
    await marcarDireto(post, membro.id, autora.id)
    await db.query("delete from public.trip_members where trip_id = $1 and user_id = $2", [viagemA, membro.id])
    try {
      expect(await marcasNoBanco(post)).toEqual([membro.id])
    } finally {
      await db.query("insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member')", [
        viagemA,
        membro.id,
      ])
      await db.query("delete from public.trip_posts where id = $1", [post])
    }
  })

  it("social_pode_marcar responde verdadeiro só no post da sessão", async () => {
    const post = await postDireto(autora.id, viagemA)
    try {
      const daAutora = await autora.cliente.rpc("social_pode_marcar", { post, marcado: membro.id })
      expect(daAutora.data).toBe(true)
      // O outro membro, sobre o post da autora: falso, mesmo sendo da viagem.
      const deOutro = await membro.cliente.rpc("social_pode_marcar", { post, marcado: semNome.id })
      expect(deOutro.data).toBe(false)
      // Quem não é da viagem não descobre quem é membro.
      const doEstranho = await estranho.cliente.rpc("social_pode_marcar", { post, marcado: membro.id })
      expect(doEstranho.data).toBe(false)
    } finally {
      await db.query("delete from public.trip_posts where id = $1", [post])
    }
  })

  it("o visitante sem sessão não executa a função", async () => {
    const { error } = await visitante.rpc("social_pode_marcar", { post: viagemA, marcado: membro.id })
    expect(error).not.toBeNull()
  })
})

/**
 * A lista "Quem viajou com você": social_membros_marcaveis, migration
 * 20261118092400 (decisões do Micael em 18/11).
 *
 * @RF09.13
 */
describe("social_membros_marcaveis: quem a sessão pode marcar", () => {
  async function marcaveis(ator: Ator | SupabaseClient, viagem: string) {
    const cliente = "cliente" in ator ? ator.cliente : ator
    const { data, error } = await cliente.rpc("social_membros_marcaveis", { viagem })
    return { ids: ((data as string[] | null) ?? []).slice().sort(), error }
  }

  it("o membro recebe os outros membros com username, e não a si mesmo", async () => {
    const daAutora = await marcaveis(autora, viagemA)
    expect(daAutora.error).toBeNull()
    expect(daAutora.ids).toEqual([membro.id])

    expect((await marcaveis(membro, viagemA)).ids).toEqual([autora.id])
    expect((await marcaveis(privado, viagemB)).ids).toEqual([davi.id])
    expect((await marcaveis(davi, viagemB)).ids).toEqual([privado.id])
  })

  it("membro sem username não aparece para ninguém, mas ele mesmo recebe os outros", async () => {
    for (const ator of [autora, membro]) {
      expect((await marcaveis(ator, viagemA)).ids).not.toContain(semNome.id)
    }
    expect((await marcaveis(semNome, viagemA)).ids).toEqual([autora.id, membro.id].sort())
  })

  it("quem não é membro da viagem recebe vazio, mesmo sendo membro de outra", async () => {
    for (const [ator, viagem] of [
      [estranho, viagemA],
      [seguidora, viagemB],
      [autora, viagemB],
      [davi, viagemA],
    ] as const) {
      const { ids, error } = await marcaveis(ator, viagem)
      expect(error).toBeNull()
      expect(ids).toEqual([])
    }
  })

  it("quem saiu da viagem recebe vazio", async () => {
    await db.query("delete from public.trip_members where trip_id = $1 and user_id = $2", [viagemA, membro.id])
    try {
      expect((await marcaveis(membro, viagemA)).ids).toEqual([])
      // E deixa de ser marcável para quem ficou.
      expect((await marcaveis(autora, viagemA)).ids).toEqual([])
    } finally {
      await db.query("insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member')", [
        viagemA,
        membro.id,
      ])
    }
  })

  it("o visitante sem sessão não executa a função", async () => {
    const { data, error } = await visitante.rpc("social_membros_marcaveis", { viagem: viagemA })
    expect(data).toBeNull()
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })
})
