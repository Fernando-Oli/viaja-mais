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
 * E as decisões de 18/11 (revisão de segurança):
 *   - a recusa (post_tag_recusas), por VIAGEM e autor: quem remove a própria
 *     marca não é marcado de novo por aquele autor naquela viagem, nem por
 *     INSERT direto, nem depois de ele despublicar e publicar de novo; outra
 *     viagem e outro autor da mesma viagem não são bloqueados; o autor que
 *     desmarca, sim, marca de novo; a remoção sem sessão não grava; só o
 *     trigger escreve; o trip_id é ilegível; a pessoa lê as próprias recusas
 *     e o autor as da viagem só pela social_recusas_da_viagem, que responde
 *     só sobre a sessão; as cascatas da viagem e das contas levam a recusa e
 *     NÃO falham por causa do trigger; despublicar não a leva;
 *   - o limite "igual ao Instagram": quem vê o post vê a marca de uma pessoa
 *     privada, também na lista por pessoa pela Data API (a aba Marcações de
 *     privado fecha só na rota).
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

/** Quem recusou as marcas do autor na viagem, visto pelo banco. */
async function recusasNoBanco(viagem: string, autor: string) {
  const { rows } = await db.query<{ tagged_id: string }>(
    "select tagged_id from public.post_tag_recusas where trip_id = $1 and author_id = $2 order by tagged_id",
    [viagem, autor],
  )
  return rows.map((r) => r.tagged_id)
}

/** Quantas recusas há com a coluna igual ao id — para conferir as cascatas. */
async function contarRecusas(coluna: "trip_id" | "author_id" | "tagged_id", id: string) {
  const { rows } = await db.query<{ n: number }>(
    `select count(*)::int as n from public.post_tag_recusas where ${coluna} = $1`,
    [id],
  )
  return rows[0].n
}

/** O que a tela de publicar lê: social_recusas_da_viagem, com a sessão do ator. */
async function recusasPelaFuncao(ator: Ator, viagem: string) {
  const { data, error } = await ator.cliente.rpc("social_recusas_da_viagem", { viagem })
  return { ids: ((data as string[] | null) ?? []).slice().sort(), error }
}

/** Publica pela Data API, como o navegador: para despublicar e publicar de novo. */
function publicarPelaSessao(ator: Ator, viagem: string) {
  return ator.cliente
    .from("trip_posts")
    .insert({
      trip_id: viagem,
      author_id: ator.id,
      title: "Férias em Portugal, de novo",
      destination: "Lisboa",
      start_date: "2026-12-10",
      end_date: "2026-12-20",
      items: [],
    })
    .select("id")
    .single()
}

/** Apaga a conta pela conexão direta, com auth.uid() valendo `sessao` — o pior caso para o trigger. */
async function apagarContaNaSessaoDe(conta: string, sessao: string) {
  await db.query("begin")
  try {
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [sessao])
    await db.query("delete from auth.users where id = $1", [conta])
    await db.query("commit")
  } catch (erro) {
    await db.query("rollback")
    throw erro
  }
}

/** A remoção da própria marca, como a aba Marcações faz (lib/social/aba-marcacoes.ts). */
function removerMinhaMarca(ator: Ator, post: string) {
  return ator.cliente.from("post_tags").delete().eq("post_id", post).eq("tagged_id", ator.id).select("tagged_id")
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

  // Um post por membro e viagem: o próximo bloco publica de novo. A recusa é
  // da viagem e sobrevive ao post: sai à parte, para não bloquear os próximos.
  afterAll(async () => {
    await db.query("delete from public.trip_posts where id = any($1::uuid[])", [[post]])
    await db.query("delete from public.post_tag_recusas where trip_id = $1", [viagemB])
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

  it("…e a recusa é gravada, mesmo ele não enxergando o post (o trigger é SECURITY DEFINER)", async () => {
    expect(await recusasNoBanco(viagemB, privado.id)).toEqual([davi.id])
    const { data } = await davi.cliente.from("post_tag_recusas").select("author_id, tagged_id").eq("tagged_id", davi.id)
    expect(data).toEqual([{ author_id: privado.id, tagged_id: davi.id }])
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
 * A recusa (decisão do Micael em 18/11): quem removeu a própria marca não é
 * marcado de novo por aquele autor naquela VIAGEM — nem depois de ele
 * despublicar e publicar de novo. A tabela post_tag_recusas, o trigger AFTER
 * DELETE de post_tags, a checagem em social_pode_marcar e a função
 * social_recusas_da_viagem.
 *
 * @RF09.13 @RF09.14
 */
describe("recusa: quem removeu a própria marca não volta a ser marcado por aquele autor na viagem", () => {
  let post: string

  beforeAll(async () => {
    post = await postDireto(autora.id, viagemA)
    await marcarDireto(post, membro.id, autora.id)
  })

  // Um post por membro e viagem: o próximo bloco publica de novo. A recusa
  // sobrevive ao post (é da viagem): sai à parte, para não bloquear os próximos.
  afterAll(async () => {
    await db.query("delete from public.trip_posts where trip_id = $1 and author_id = $2", [viagemA, autora.id])
    await db.query("delete from public.post_tag_recusas where trip_id = $1", [viagemA])
  })

  it("a pessoa remove a própria marca, e a recusa é gravada para a viagem e a autora", async () => {
    const { data, error } = await removerMinhaMarca(membro, post)
    expect(error).toBeNull()
    expect(data).toEqual([{ tagged_id: membro.id }])
    expect(await marcasNoBanco(post)).toEqual([])
    expect(await recusasNoBanco(viagemA, autora.id)).toEqual([membro.id])
  })

  it("a autora não a marca de novo, nem por INSERT direto: 42501", async () => {
    const { error } = await marcar(autora, post, membro.id)
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    expect(await marcasNoBanco(post)).toEqual([])
    // A função que a policy usa diz o mesmo à autora.
    const pode = await autora.cliente.rpc("social_pode_marcar", { post, marcado: membro.id })
    expect(pode.data).toBe(false)
  })

  it("a autora despublica e publica de novo, e continua sem conseguir marcá-la", async () => {
    const despublicado = await autora.cliente.from("trip_posts").delete().eq("id", post).select("id")
    expect(despublicado.error).toBeNull()
    expect(despublicado.data).toEqual([{ id: post }])
    // Sem post, a recusa continua — e a tela já a enxerga antes do novo POST.
    expect(await recusasNoBanco(viagemA, autora.id)).toEqual([membro.id])
    expect((await recusasPelaFuncao(autora, viagemA)).ids).toEqual([membro.id])

    const novo = await publicarPelaSessao(autora, viagemA)
    expect(novo.error).toBeNull()
    post = novo.data!.id

    const { error } = await marcar(autora, post, membro.id)
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    expect(await marcasNoBanco(post)).toEqual([])
  })

  it("social_recusas_da_viagem responde só sobre a sessão autora", async () => {
    const daAutora = await recusasPelaFuncao(autora, viagemA)
    expect(daAutora.error).toBeNull()
    expect(daAutora.ids).toEqual([membro.id])
    // A própria pessoa que recusou, outro membro e um estranho: vazio.
    for (const ator of [membro, semNome, estranho]) {
      const { ids, error } = await recusasPelaFuncao(ator, viagemA)
      expect(error).toBeNull()
      expect(ids).toEqual([])
    }
    // A autora, sobre outra viagem: vazio.
    expect((await recusasPelaFuncao(autora, viagemB)).ids).toEqual([])
  })

  it("a pessoa lê a própria recusa; a autora e um terceiro não leem a tabela", async () => {
    const propria = await membro.cliente
      .from("post_tag_recusas")
      .select("author_id, tagged_id")
      .eq("tagged_id", membro.id)
    expect(propria.error).toBeNull()
    expect(propria.data).toEqual([{ author_id: autora.id, tagged_id: membro.id }])

    // O estranho e o membro sem username enxergam o post (a autora é pública), e nem assim a recusa.
    for (const ator of [autora, estranho, semNome]) {
      const { data, error } = await ator.cliente
        .from("post_tag_recusas")
        .select("author_id, tagged_id")
        .eq("tagged_id", membro.id)
      expect(error).toBeNull()
      expect(data).toEqual([])
    }
  })

  it("o trip_id não é legível, nem pela pessoa marcada nem por terceiros, nem por filtro", async () => {
    for (const ator of [membro, autora, estranho]) {
      const coluna = await ator.cliente.from("post_tag_recusas").select("trip_id, tagged_id")
      expect(coluna.data).toBeNull()
      expect(coluna.error?.code).toBe(VIOLA_RLS_OU_GRANT)
      const tudo = await ator.cliente.from("post_tag_recusas").select("*")
      expect(tudo.data).toBeNull()
      expect(tudo.error?.code).toBe(VIOLA_RLS_OU_GRANT)
      const filtro = await ator.cliente.from("post_tag_recusas").select("tagged_id").eq("trip_id", viagemA)
      expect(filtro.data).toBeNull()
      expect(filtro.error?.code).toBe(VIOLA_RLS_OU_GRANT)
    }
  })

  it("ninguém insere, altera ou apaga recusa direto: só o trigger escreve", async () => {
    // Forjar a recusa de outra pessoa (impediria a marca sem ela ter removido nada), ou a própria.
    for (const [ator, autor, tagged] of [
      [autora, autora.id, semNome.id],
      [estranho, autora.id, membro.id],
      [semNome, autora.id, semNome.id],
    ] as const) {
      const { error } = await ator.cliente
        .from("post_tag_recusas")
        .insert({ trip_id: viagemA, author_id: autor, tagged_id: tagged })
      expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    }
    // Desfazer a recusa (voltaria a abrir a remarcação), por quem a lê e pela autora.
    for (const ator of [membro, autora]) {
      const alterada = await ator.cliente
        .from("post_tag_recusas")
        .update({ tagged_id: semNome.id })
        .eq("tagged_id", membro.id)
        .select("tagged_id")
      expect(alterada.error?.code).toBe(VIOLA_RLS_OU_GRANT)
      const apagada = await ator.cliente.from("post_tag_recusas").delete().eq("tagged_id", membro.id).select("tagged_id")
      expect(apagada.error?.code).toBe(VIOLA_RLS_OU_GRANT)
    }
    expect(await recusasNoBanco(viagemA, autora.id)).toEqual([membro.id])
  })

  it("os privilégios, as policies e a função são só os de leitura", async () => {
    // Pega o que o comportamento acima não separa: um grant de escrita a mais
    // ainda esbarraria na falta de policy (e vice-versa), e o erro seria o mesmo.
    const { rows: privilegios } = await db.query(
      `select r.papel,
              has_table_privilege(r.papel, 'public.post_tag_recusas', 'SELECT') as select_tabela,
              has_table_privilege(r.papel, 'public.post_tag_recusas', 'INSERT') as insert,
              has_table_privilege(r.papel, 'public.post_tag_recusas', 'UPDATE') as update,
              has_table_privilege(r.papel, 'public.post_tag_recusas', 'DELETE') as delete,
              has_any_column_privilege(r.papel, 'public.post_tag_recusas', 'INSERT') as insert_coluna,
              has_any_column_privilege(r.papel, 'public.post_tag_recusas', 'UPDATE') as update_coluna,
              has_column_privilege(r.papel, 'public.post_tag_recusas', 'trip_id', 'SELECT') as le_trip_id,
              has_column_privilege(r.papel, 'public.post_tag_recusas', 'author_id', 'SELECT')
                and has_column_privilege(r.papel, 'public.post_tag_recusas', 'tagged_id', 'SELECT')
                and has_column_privilege(r.papel, 'public.post_tag_recusas', 'created_at', 'SELECT') as le_o_resto,
              has_function_privilege(r.papel, 'public.social_recusas_da_viagem(uuid)', 'EXECUTE') as executa
         from (values ('anon'), ('authenticated')) as r(papel)
        order by r.papel`,
    )
    const semEscrita = {
      select_tabela: false,
      insert: false,
      update: false,
      delete: false,
      insert_coluna: false,
      update_coluna: false,
      le_trip_id: false,
    }
    expect(privilegios).toEqual([
      { papel: "anon", ...semEscrita, le_o_resto: false, executa: false },
      { papel: "authenticated", ...semEscrita, le_o_resto: true, executa: true },
    ])

    const { rows: policies } = await db.query(
      `select policyname, cmd, roles::text as roles from pg_policies
        where schemaname = 'public' and tablename = 'post_tag_recusas'`,
    )
    expect(policies).toEqual([{ policyname: "post_tag_recusas_select", cmd: "SELECT", roles: "{authenticated}" }])

    const { rows: funcao } = await db.query(
      `select p.prosecdef, p.provolatile, p.proconfig
         from pg_proc p where p.oid = 'public.social_recusas_da_viagem(uuid)'::regprocedure`,
    )
    expect(funcao).toEqual([{ prosecdef: true, provolatile: "s", proconfig: ['search_path=""'] }])
  })

  it("a remoção de uma marca recolocada por fora não falha: a recusa já existe (on conflict)", async () => {
    // A chave de serviço (ou a conexão direta) não passa pela policy de INSERT.
    await marcarDireto(post, membro.id, autora.id)
    const { data, error } = await removerMinhaMarca(membro, post)
    expect(error).toBeNull()
    expect(data).toEqual([{ tagged_id: membro.id }])
    expect(await recusasNoBanco(viagemA, autora.id)).toEqual([membro.id])
  })

  it("remover de novo, sem marca, não apaga nada e não falha", async () => {
    const { data, error } = await removerMinhaMarca(membro, post)
    expect(error).toBeNull()
    expect(data).toEqual([])
    expect(await recusasNoBanco(viagemA, autora.id)).toEqual([membro.id])
  })

  it("o visitante sem sessão não lê, não escreve recusas nem chama a função", async () => {
    const leitura = await visitante.from("post_tag_recusas").select("tagged_id").eq("tagged_id", membro.id)
    expect(leitura.data).toBeNull()
    expect(leitura.error?.code).toBe(VIOLA_RLS_OU_GRANT)
    const escrita = await visitante
      .from("post_tag_recusas")
      .insert({ trip_id: viagemA, author_id: autora.id, tagged_id: semNome.id })
    expect(escrita.error?.code).toBe(VIOLA_RLS_OU_GRANT)
    const funcao = await visitante.rpc("social_recusas_da_viagem", { viagem: viagemA })
    expect(funcao.data).toBeNull()
    expect(funcao.error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })
})

describe("recusa: vale para aquele autor naquela viagem, e só", () => {
  let colega: Ator
  let viagemC: string
  let postC: string

  beforeAll(async () => {
    colega = await criarAtor("colega")
    viagemC = await criarViagem(autora.id, [membro.id, colega.id])
    postC = await postDireto(autora.id, viagemC)
    await marcarDireto(postC, membro.id, autora.id)
    const { error } = await removerMinhaMarca(membro, postC)
    if (error) throw new Error(`não removeu a marca: ${error.message}`)
  })

  it("a recusa de uma viagem não bloqueia outra viagem da mesma autora", async () => {
    expect(await recusasNoBanco(viagemC, autora.id)).toEqual([membro.id])
    const outra = await criarViagem(autora.id, [membro.id])
    const postOutra = await postDireto(autora.id, outra)
    const { error } = await marcar(autora, postOutra, membro.id)
    expect(error).toBeNull()
    expect(await marcasNoBanco(postOutra)).toEqual([membro.id])
    expect((await recusasPelaFuncao(autora, outra)).ids).toEqual([])
  })

  it("a recusa de uma autora não bloqueia outro autor da mesma viagem", async () => {
    const postDoColega = await postDireto(colega.id, viagemC)
    const { error } = await marcar(colega, postDoColega, membro.id)
    expect(error).toBeNull()
    expect(await marcasNoBanco(postDoColega)).toEqual([membro.id])
    expect((await recusasPelaFuncao(colega, viagemC)).ids).toEqual([])
    // E a autora continua bloqueada na mesma viagem.
    expect((await marcar(autora, postC, membro.id)).error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })
})

describe("recusa: quando NÃO se grava", () => {
  let post: string

  beforeAll(async () => {
    post = await postDireto(privado.id, viagemB)
  })

  afterAll(async () => {
    await db.query("delete from public.trip_posts where id = any($1::uuid[])", [[post]])
  })

  it("o autor desmarca: não há recusa, e ele marca a pessoa de novo", async () => {
    await marcarDireto(post, davi.id, privado.id)
    const desmarcado = await privado.cliente
      .from("post_tags")
      .delete()
      .eq("post_id", post)
      .eq("tagged_id", davi.id)
      .select("tagged_id")
    expect(desmarcado.error).toBeNull()
    expect(desmarcado.data).toEqual([{ tagged_id: davi.id }])
    expect(await recusasNoBanco(viagemB, privado.id)).toEqual([])

    const remarcado = await marcar(privado, post, davi.id)
    expect(remarcado.error).toBeNull()
    expect(await marcasNoBanco(post)).toEqual([davi.id])
  })

  it("a remoção sem sessão (chave de serviço, conexão direta) não grava recusa", async () => {
    await db.query("delete from public.post_tags where post_id = $1 and tagged_id = $2", [post, davi.id])
    expect(await marcasNoBanco(post)).toEqual([])
    expect(await recusasNoBanco(viagemB, privado.id)).toEqual([])
  })
})

describe("recusa: as cascatas levam a recusa e não falham por causa do trigger", () => {
  it("despublicar não apaga a recusa; apagar a viagem, sim", async () => {
    const viagem = await criarViagem(autora.id, [membro.id])
    const post = await postDireto(autora.id, viagem)
    await marcarDireto(post, membro.id, autora.id)
    await removerMinhaMarca(membro, post)
    expect(await recusasNoBanco(viagem, autora.id)).toEqual([membro.id])

    await db.query("delete from public.trip_posts where id = $1", [post])
    expect(await recusasNoBanco(viagem, autora.id)).toEqual([membro.id])

    await db.query("delete from public.trips where id = $1", [viagem])
    expect(await contarRecusas("trip_id", viagem)).toBe(0)
  })

  it("a marcada, dona da viagem, apaga a viagem pela própria sessão: a cascata não falha nem grava recusa", async () => {
    // A sessão é a pessoa marcada (auth.uid() = tagged_id) quando a cascata
    // apaga a marca; gravar a recusa de um post que já não existe violaria a
    // FK e derrubaria a exclusão da viagem inteira.
    const viagem = await criarViagem(membro.id, [autora.id])
    const post = await postDireto(autora.id, viagem)
    await marcarDireto(post, membro.id, autora.id)
    await removerMinhaMarca(membro, post)
    // A marca recolocada por fora: a viagem sai com marca E recusa.
    await marcarDireto(post, membro.id, autora.id)
    expect(await contarRecusas("trip_id", viagem)).toBe(1)

    const { data, error } = await membro.cliente.from("trips").delete().eq("id", viagem).select("id")
    expect(error).toBeNull()
    expect(data).toEqual([{ id: viagem }])

    const { rows } = await db.query(
      `select (select count(*) from public.trip_posts where id = $1)::int as posts,
              (select count(*) from public.post_tags where post_id = $1)::int as marcas`,
      [post],
    )
    expect(rows[0]).toEqual({ posts: 0, marcas: 0 })
    expect(await contarRecusas("trip_id", viagem)).toBe(0)
  })

  it("apagar a conta da marcada, mesmo na sessão dela, não falha e leva marcas e recusas", async () => {
    const conta = await criarAtor("conta")
    const viagem = await criarViagem(autora.id, [conta.id])
    const post = await postDireto(autora.id, viagem)
    await marcarDireto(post, conta.id, autora.id)
    await removerMinhaMarca(conta, post)
    // A marca recolocada por fora: a conta sai com marca E recusa.
    await marcarDireto(post, conta.id, autora.id)
    expect(await recusasNoBanco(viagem, autora.id)).toEqual([conta.id])

    await apagarContaNaSessaoDe(conta.id, conta.id)

    expect(await marcasNoBanco(post)).toEqual([])
    expect(await contarRecusas("tagged_id", conta.id)).toBe(0)
    // O post da autora continua: só a conta saiu.
    const { rows } = await db.query("select count(*)::int as n from public.trip_posts where id = $1", [post])
    expect(rows[0].n).toBe(1)
  })

  it("apagar a conta do autor, mesmo na sessão da marcada, não falha e leva as recusas dele", async () => {
    const autorX = await criarAtor("autorx")
    // A viagem é da marcada, e não do autor: assim a conta dele não leva a
    // viagem (que levaria o post antes de tudo), e o post sai pela própria FK
    // de author_id — o caminho mais curto até a marca.
    const viagem = await criarViagem(membro.id, [autorX.id])
    const post = await postDireto(autorX.id, viagem)
    await marcarDireto(post, membro.id, autorX.id)
    await removerMinhaMarca(membro, post)
    await marcarDireto(post, membro.id, autorX.id)
    expect(await recusasNoBanco(viagem, autorX.id)).toEqual([membro.id])

    // O pior caso: a cascata apaga a marca com auth.uid() = a pessoa marcada.
    await apagarContaNaSessaoDe(autorX.id, membro.id)

    expect(await marcasNoBanco(post)).toEqual([])
    expect(await contarRecusas("author_id", autorX.id)).toBe(0)
  })
})

/**
 * O limite aceito (decisão do Micael em 18/11, achado 3): "igual ao Instagram",
 * a marca é visível a quem vê o post, mesmo que a pessoa marcada seja privada.
 * A policy de post_tags não a esconde; a aba Marcações de um perfil privado
 * só abre a seguidores na ROTA. Este teste documenta o limite: se um dia ele
 * falhar, a regra mudou e a documentação precisa mudar junto.
 *
 * @RF09.14
 */
describe("limite aceito: a marca de pessoa privada é visível a quem vê o post", () => {
  let reservada: Ator
  let post: string

  beforeAll(async () => {
    reservada = await criarAtor("reservada", { privado: true })
    const viagem = await criarViagem(autora.id, [reservada.id])
    post = await postDireto(autora.id, viagem)
    await marcarDireto(post, reservada.id, autora.id)
  })

  it("quem não segue a pessoa privada vê a marca dela no post público, também pela lista por pessoa", async () => {
    const noPost = await estranho.cliente.from("post_tags").select("tagged_id").eq("post_id", post)
    expect(noPost.error).toBeNull()
    expect(noPost.data).toEqual([{ tagged_id: reservada.id }])

    // A lista agregada por pessoa, pela Data API: é o que a rota fecha para privado.
    const porPessoa = await estranho.cliente.from("post_tags").select("post_id").eq("tagged_id", reservada.id)
    expect(porPessoa.error).toBeNull()
    expect(porPessoa.data).toEqual([{ post_id: post }])
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
