import fs from "node:fs"
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest"
import { type SupabaseClient } from "@supabase/supabase-js"
import { Client } from "pg"
import { SENHA_TESTE } from "../fixtures/usuarios"
import { CONEXAO, logar, novoCliente } from "./apoio"
import { variavelObrigatoria } from "./guarda-ambiente"

/**
 * Publicar viagem (S06-M-publicar-viagem): a tabela `trip_posts` e o bucket
 * `capas-posts` da migration 20261116195039.
 *
 * Mesmo princípio de 04-social: cada pessoa loga de verdade pelo GoTrue com a
 * chave anon e fala com o PostgREST como o navegador. A conexão direta só monta
 * o estado — contas, viagens, vínculos — e tudo o que ela cria sai no fim. As
 * contas são descartáveis e logáveis (criadas como no seed.sql), para o teste
 * não depender da população local nem mexer nos vínculos dela.
 *
 * O que se prova aqui:
 *   - leitura: a visibilidade segue o perfil do autor (pode_ver_rede); anon
 *     não lê nada; o seguidor removido perde o acesso;
 *   - o trip_id é ilegível: dois posts da mesma viagem não revelam quem viajou
 *     junto, nem por filtro; a função do autor só responde sobre a sessão;
 *   - escrita: só membro, em nome de si mesmo, com username, um post por
 *     viagem; trip_id e author_id não mudam; ninguém altera nem apaga o post de
 *     outro; quem saiu da viagem não atualiza, mas apaga;
 *   - o formato: nem pela Data API entram notas, coordenadas, preço ou o id
 *     do item, nem capa fora da pasta do autor;
 *   - a cascata: excluir a viagem apaga os posts;
 *   - ler o post não abre a viagem, os membros nem as despesas;
 *   - o autor grava cover_path na própria pasta pelo UPDATE, sem a rota
 *     (limite aceito, achado 4 de 18/11): só o INSERT recusa a capa;
 *   - nenhuma policy em storage.objects, de bucket nenhum, e o bucket nasce
 *     privado: com um objeto que existe na pasta dela, a autora não assina,
 *     não baixa, não lista, não sobrescreve nem envia com o próprio JWT;
 *   - a legenda e os lugares salvos (migration 20261118092400): legenda até
 *     280 e nunca em branco; dos lugares, só nome, categoria e endereço — nem
 *     notas, coordenadas ou nota do Google; só o autor os atualiza.
 *
 * @RF09.7 @RNF02.4
 */

const VIOLA_RLS_OU_GRANT = "42501"
const VIOLA_CHECK = "23514"
const VIOLA_UNIQUE = "23505"

/** Tudo o que `authenticated` pode ler: todas as colunas, menos `trip_id`. */
const COLUNAS =
  "id, author_id, title, destination, start_date, end_date, items, caption, places, cover_path, created_at, updated_at"

/** As únicas chaves que um item copiado pode ter. */
const CHAVES_DO_ITEM = ["title", "date", "start_time", "end_time", "category", "location", "description"]

const marca = `p${Date.now().toString(36)}`

type Ator = { id: string; cliente: SupabaseClient }

let db: Client
let visitante: SupabaseClient

// Viagem A, pública: a autora e um membro, os dois públicos.
let autora: Ator
let membro: Ator
// Viagem B: o autor é privado.
let privado: Ator
let seguidora: Ator
let pendente: Ator
// Sem vínculo com ninguém.
let estranho: Ator
// Membro da viagem A, mas sem username.
let semNome: Ator

let viagemA: string
let viagemB: string

const contas: string[] = []
const viagens: string[] = []

/** Conta descartável e logável, como as do seed.sql; o perfil nasce pelo trigger. */
async function criarAtor(rotulo: string, opcoes: { username?: boolean; privado?: boolean } = {}): Promise<Ator> {
  const email = `posts.${marca}.${rotulo}@viajamais.local`
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
    [email, SENHA_TESTE, `Posts ${rotulo}`],
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

/** Viagem com orçamento e moeda, para provar que nada disso chega ao post. O dono entra como membro pelo trigger. */
async function criarViagem(dono: string, membros: string[] = []) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.trips (user_id, title, destination, start_date, end_date, budget, currency, description)
     values ($1, 'Férias secretas', 'Lisboa', '2026-12-10', '2026-12-20', 9999.99, 'EUR', 'senha do cofre: 1234')
     returning id`,
    [dono],
  )
  const id = rows[0].id
  viagens.push(id)
  for (const m of membros) {
    await db.query("insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member')", [id, m])
  }
  return id
}

async function seguir(seguidor: string, seguido: string, status: "accepted" | "pending") {
  await db.query("insert into public.follows (follower_id, followee_id) values ($1, $2)", [seguidor, seguido])
  await db.query("update public.follows set status = $3 where follower_id = $1 and followee_id = $2", [
    seguidor,
    seguido,
    status,
  ])
}

function postDe(autor: string, viagem: string, items: unknown[] = [{ title: "Voo para Lisboa" }]) {
  return {
    trip_id: viagem,
    author_id: autor,
    title: "Férias em Portugal",
    destination: "Lisboa",
    start_date: "2026-12-10",
    end_date: "2026-12-20",
    items,
  }
}

async function publicar(ator: Ator, viagem: string, items?: unknown[]) {
  return ator.cliente.from("trip_posts").insert(postDe(ator.id, viagem, items)).select("id").single()
}

/** Grava pela conexão direta, para os testes de leitura não dependerem da escrita. */
async function postDireto(autor: string, viagem: string) {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.trip_posts (trip_id, author_id, title, destination, start_date, end_date, items)
     values ($1, $2, 'Férias em Portugal', 'Lisboa', '2026-12-10', '2026-12-20', '[{"title":"Voo para Lisboa"}]')
     returning id`,
    [viagem, autor],
  )
  return rows[0].id
}

/**
 * Chave de serviço, só para criar e apagar o objeto de teste do bucket, como a
 * rota da capa faz; nunca é o ator que se testa. Mesma origem de 05-avatares:
 * SERVICE_ROLE_KEY no CI, SUPABASE_SERVICE_ROLE_KEY do `.env.local` na máquina.
 * A API_URL já passou por `exigirLocal`.
 */
function chaveDeServico(): string {
  const doAmbiente = process.env.SERVICE_ROLE_KEY
  if (doAmbiente) return doAmbiente
  const linha = fs.existsSync(".env.local")
    ? fs.readFileSync(".env.local", "utf8").match(/^\s*SUPABASE_SERVICE_ROLE_KEY\s*=\s*"?([^"#\s]+)/m)
    : null
  return linha?.[1] ?? variavelObrigatoria("SERVICE_ROLE_KEY")
}

async function apagarPostsDe(viagem: string) {
  await db.query("delete from public.trip_posts where trip_id = $1", [viagem])
}

beforeAll(async () => {
  db = new Client({ connectionString: CONEXAO })
  await db.connect()
  visitante = novoCliente()

  autora = await criarAtor("autora")
  membro = await criarAtor("membro")
  privado = await criarAtor("privado", { privado: true })
  seguidora = await criarAtor("seguidora")
  pendente = await criarAtor("pendente")
  estranho = await criarAtor("estranho")
  semNome = await criarAtor("semnome", { username: false })

  viagemA = await criarViagem(autora.id, [membro.id, semNome.id])
  viagemB = await criarViagem(privado.id)

  await seguir(seguidora.id, privado.id, "accepted")
  await seguir(pendente.id, privado.id, "pending")
}, 60_000)

afterAll(async () => {
  try {
    // Viagens antes das contas: a cascata leva posts e membros.
    if (viagens.length) await db.query("delete from public.trips where id = any($1::uuid[])", [viagens])
    // A conta leva perfil, vínculos e identidade em cascata.
    if (contas.length) await db.query("delete from auth.users where id = any($1::uuid[])", [contas])
  } finally {
    await db.end()
  }
})

describe("leitura: a visibilidade segue o perfil do autor", () => {
  let postPublico: string
  let postPrivado: string

  beforeAll(async () => {
    postPublico = await postDireto(autora.id, viagemA)
    postPrivado = await postDireto(privado.id, viagemB)
  })

  afterAll(async () => {
    await apagarPostsDe(viagemA)
    await apagarPostsDe(viagemB)
  })

  it("post de autor público é lido por um autenticado sem vínculo nenhum", async () => {
    const { data, error } = await estranho.cliente.from("trip_posts").select(COLUNAS).eq("id", postPublico)
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
  })

  it("post de autor privado é lido pelo próprio autor e pela seguidora aceita", async () => {
    for (const ator of [privado, seguidora]) {
      const { data, error } = await ator.cliente.from("trip_posts").select("id").eq("id", postPrivado)
      expect(error).toBeNull()
      expect(data).toHaveLength(1)
    }
  })

  it("post de autor privado volta vazio para quem só pediu e para quem não segue", async () => {
    for (const ator of [pendente, estranho]) {
      const { data, error } = await ator.cliente.from("trip_posts").select("id").eq("id", postPrivado)
      expect(error).toBeNull()
      expect(data).toEqual([])
    }
  })

  it("o visitante sem sessão não lê nada: anon não tem grant", async () => {
    const { data, error } = await visitante.from("trip_posts").select("id").eq("id", postPublico)
    expect(data).toBeNull()
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("a seguidora removida perde o acesso, e o autor público continua visível a ela", async () => {
    await db.query("delete from public.follows where follower_id = $1 and followee_id = $2", [seguidora.id, privado.id])
    try {
      const privadoVisto = await seguidora.cliente.from("trip_posts").select("id").eq("id", postPrivado)
      expect(privadoVisto.data).toEqual([])
      const publicoVisto = await seguidora.cliente.from("trip_posts").select("id").eq("id", postPublico)
      expect(publicoVisto.data).toHaveLength(1)
    } finally {
      await seguir(seguidora.id, privado.id, "accepted")
    }
  })

  it("o post lido tem só as colunas permitidas, e os itens só as chaves permitidas", async () => {
    const { data } = await estranho.cliente.from("trip_posts").select(COLUNAS).eq("id", postPublico).single()
    expect(Object.keys(data!).sort()).toEqual(COLUNAS.split(", ").sort())
    for (const item of data!.items as Record<string, unknown>[]) {
      for (const chave of Object.keys(item)) expect(CHAVES_DO_ITEM).toContain(chave)
    }
    const texto = JSON.stringify(data)
    expect(texto).not.toContain("9999")
    expect(texto).not.toContain("EUR")
    expect(texto).not.toContain("cofre")
  })
})

describe("o trip_id não revela quem viajou junto", () => {
  let postDaAutora: string
  let postDoMembro: string

  beforeAll(async () => {
    postDaAutora = await postDireto(autora.id, viagemA)
    postDoMembro = await postDireto(membro.id, viagemA)
  })

  afterAll(async () => {
    await apagarPostsDe(viagemA)
  })

  it("um terceiro lê os dois posts, mas não o trip_id", async () => {
    const lidos = await estranho.cliente.from("trip_posts").select("id").in("id", [postDaAutora, postDoMembro])
    expect(lidos.data).toHaveLength(2)

    const comViagem = await estranho.cliente.from("trip_posts").select("id, trip_id").in("id", [postDaAutora])
    expect(comViagem.data).toBeNull()
    expect(comViagem.error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("nem o `select=*` devolve o trip_id: ele responde 42501", async () => {
    const { data, error } = await estranho.cliente.from("trip_posts").select("*").eq("id", postDaAutora)
    expect(data).toBeNull()
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("filtrar pelo trip_id também é recusado, mesmo para o autor", async () => {
    for (const ator of [estranho, autora]) {
      const { data, error } = await ator.cliente.from("trip_posts").select("id").eq("trip_id", viagemA)
      expect(data).toBeNull()
      expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    }
  })

  it("a função do autor devolve o próprio post, e nunca o de outra pessoa", async () => {
    const daAutora = await autora.cliente.rpc("social_meu_post_da_viagem", { viagem: viagemA })
    expect(daAutora.error).toBeNull()
    expect(daAutora.data).toBe(postDaAutora)

    const doMembro = await membro.cliente.rpc("social_meu_post_da_viagem", { viagem: viagemA })
    expect(doMembro.data).toBe(postDoMembro)

    const doEstranho = await estranho.cliente.rpc("social_meu_post_da_viagem", { viagem: viagemA })
    expect(doEstranho.error).toBeNull()
    expect(doEstranho.data).toBeNull()
  })

  it("o visitante sem sessão não chama a função", async () => {
    const { data, error } = await visitante.rpc("social_meu_post_da_viagem", { viagem: viagemA })
    expect(data).toBeNull()
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })
})

describe("escrita pela Data API", () => {
  afterAll(async () => {
    await apagarPostsDe(viagemA)
    await apagarPostsDe(viagemB)
  })

  it("quem não é membro não publica a viagem", async () => {
    const { data, error } = await publicar(estranho, viagemA)
    expect(data).toBeNull()
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("um membro não publica em nome de outra pessoa", async () => {
    const { error } = await membro.cliente
      .from("trip_posts")
      .insert(postDe(autora.id, viagemA))
      .select("id")
      .single()
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("membro sem username não publica", async () => {
    const { error } = await publicar(semNome, viagemA)
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  // Só o INSERT: o UPDATE do cover_path é limite aceito (achado 4, logo abaixo).
  it("a capa não entra no INSERT", async () => {
    const { error } = await autora.cliente
      .from("trip_posts")
      .insert({ ...postDe(autora.id, viagemA), cover_path: `${autora.id}/${autora.id}.webp` })
      .select("id")
      .single()
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("dois membros publicam a mesma viagem, cada um o seu post (o caso legítimo)", async () => {
    const daAutora = await publicar(autora, viagemA)
    const doMembro = await publicar(membro, viagemA)
    expect(daAutora.error).toBeNull()
    expect(doMembro.error).toBeNull()
    expect(daAutora.data!.id).not.toBe(doMembro.data!.id)
  })

  it("o mesmo autor não publica a mesma viagem duas vezes", async () => {
    const { error } = await publicar(autora, viagemA)
    expect(error?.code).toBe(VIOLA_UNIQUE)
  })

  it("o autor atualiza o conteúdo, e o banco acerta o updated_at", async () => {
    const id = (await autora.cliente.rpc("social_meu_post_da_viagem", { viagem: viagemA })).data as string
    const antes = (await db.query("select updated_at from public.trip_posts where id = $1", [id])).rows[0].updated_at
    const { data, error } = await autora.cliente
      .from("trip_posts")
      .update({ title: "Portugal, de novo" })
      .eq("id", id)
      .select("title, updated_at")
      .single()
    expect(error).toBeNull()
    expect(data!.title).toBe("Portugal, de novo")
    expect(new Date(data!.updated_at).getTime()).toBeGreaterThan(new Date(antes).getTime())
  })

  it("o autor não muda trip_id, author_id nem created_at", async () => {
    const id = (await autora.cliente.rpc("social_meu_post_da_viagem", { viagem: viagemA })).data as string
    for (const mudanca of [{ trip_id: viagemB }, { author_id: membro.id }, { created_at: "2020-01-01T00:00:00Z" }]) {
      const { error } = await autora.cliente.from("trip_posts").update(mudanca).eq("id", id)
      expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    }
    const { rows } = await db.query("select trip_id, author_id from public.trip_posts where id = $1", [id])
    expect(rows[0]).toEqual({ trip_id: viagemA, author_id: autora.id })
  })

  /**
   * Limite aceito (achado 4 da revisão de 18/11): o grant de UPDATE inclui
   * cover_path, então o autor grava pela Data API um caminho na PRÓPRIA pasta
   * sem a rota da capa conferir nada. O CHECK segura o formato e a pasta (o
   * teste "a capa só aceita caminho na pasta do autor" abaixo); o bucket não
   * tem policy, então ele não sobe arquivo nenhum para essa pasta — o caminho
   * aponta para uma capa que a rota já conferiu, ou para nada. Se este teste
   * falhar, o grant mudou e a documentação precisa mudar junto.
   */
  it("limite aceito: pelo UPDATE, o autor grava cover_path na própria pasta sem passar pela rota", async () => {
    const id = (await autora.cliente.rpc("social_meu_post_da_viagem", { viagem: viagemA })).data as string
    const caminho = `${autora.id}/${membro.id}.webp`
    try {
      const { error } = await autora.cliente.from("trip_posts").update({ cover_path: caminho }).eq("id", id)
      expect(error).toBeNull()
      const { rows } = await db.query("select cover_path from public.trip_posts where id = $1", [id])
      expect(rows[0].cover_path).toBe(caminho)
    } finally {
      await db.query("update public.trip_posts set cover_path = null where id = $1", [id])
    }
  })

  it("outra pessoa, mesmo membro da viagem, não altera nem apaga o post da autora", async () => {
    const id = (await autora.cliente.rpc("social_meu_post_da_viagem", { viagem: viagemA })).data as string
    for (const ator of [membro, estranho]) {
      const alterado = await ator.cliente.from("trip_posts").update({ title: "invadido" }).eq("id", id).select("id")
      expect(alterado.data ?? []).toEqual([])
      const apagado = await ator.cliente.from("trip_posts").delete().eq("id", id).select("id")
      expect(apagado.data ?? []).toEqual([])
    }
    const { rows } = await db.query("select title from public.trip_posts where id = $1", [id])
    expect(rows[0].title).toBe("Portugal, de novo")
  })

  it("quem saiu da viagem não atualiza o post, mas ainda o apaga", async () => {
    const id = (await membro.cliente.rpc("social_meu_post_da_viagem", { viagem: viagemA })).data as string
    await db.query("delete from public.trip_members where trip_id = $1 and user_id = $2", [viagemA, membro.id])
    try {
      const atualizado = await membro.cliente.from("trip_posts").update({ title: "depois de sair" }).eq("id", id)
      expect(atualizado.error?.code).toBe(VIOLA_RLS_OU_GRANT)

      const apagado = await membro.cliente.from("trip_posts").delete().eq("id", id).select("id")
      expect(apagado.error).toBeNull()
      expect(apagado.data).toEqual([{ id }])
    } finally {
      await db.query("insert into public.trip_members (trip_id, user_id, role) values ($1, $2, 'member')", [
        viagemA,
        membro.id,
      ])
    }
  })
})

describe("o formato da cópia, mesmo pela Data API", () => {
  afterAll(async () => {
    await apagarPostsDe(viagemB)
  })

  it.each([
    ["notes", { title: "Voo", notes: "senha 123" }],
    ["latitude", { title: "Hotel", latitude: "-23.5" }],
    ["longitude", { title: "Hotel", longitude: "-46.6" }],
    ["price", { title: "Voo", price: "1200" }],
    ["id do item", { title: "Voo", id: "11111111-1111-4111-8111-111111111111" }],
    ["chave desconhecida", { title: "Voo", qualquer: "x" }],
    ["sem título", { location: "GRU" }],
    ["título vazio", { title: "   " }],
    ["campo nulo", { title: "Voo", location: null }],
    ["campo que não é texto", { title: "Voo", date: 20261210 }],
    ["data fora do formato", { title: "Voo", date: "10/12/2026" }],
    ["hora fora do formato", { title: "Voo", start_time: "25:00" }],
    ["categoria inventada", { title: "Voo", category: "spa" }],
    ["local acima de 200", { title: "Voo", location: "x".repeat(201) }],
    ["descrição acima de 2000", { title: "Voo", description: "x".repeat(2001) }],
  ])("recusa item com %s", async (_rotulo, item) => {
    const { error } = await publicar(privado, viagemB, [item])
    expect(error?.code).toBe(VIOLA_CHECK)
  })

  it("recusa item que não é objeto e itinerário com mais de 200 itens", async () => {
    expect((await publicar(privado, viagemB, ["Voo"])).error?.code).toBe(VIOLA_CHECK)
    const muitos = Array.from({ length: 201 }, (_, i) => ({ title: `Item ${i}` }))
    expect((await publicar(privado, viagemB, muitos)).error?.code).toBe(VIOLA_CHECK)
  })

  it("aceita o item com todos os campos permitidos, e o itinerário vazio", async () => {
    const completo = {
      title: "Jantar no Time Out",
      date: "2026-12-11",
      start_time: "20:00",
      end_time: "22:30:00",
      category: "restaurant",
      location: "Mercado da Ribeira",
      description: "Mesa para o grupo",
    }
    const { error } = await publicar(privado, viagemB, [completo])
    expect(error).toBeNull()
    await apagarPostsDe(viagemB)
    expect((await publicar(privado, viagemB, [])).error).toBeNull()
  })

  it("a capa só aceita caminho na pasta do autor, no formato da rota", async () => {
    const id = (await privado.cliente.rpc("social_meu_post_da_viagem", { viagem: viagemB })).data as string
    const deOutro = `${autora.id}/${autora.id}.webp`
    const foraDoFormato = `${privado.id}/../avatars/x.webp`
    for (const cover_path of [deOutro, foraDoFormato]) {
      const { error } = await privado.cliente.from("trip_posts").update({ cover_path }).eq("id", id)
      expect(error?.code).toBe(VIOLA_CHECK)
    }
    const valido = await privado.cliente
      .from("trip_posts")
      .update({ cover_path: `${privado.id}/${autora.id}.webp` })
      .eq("id", id)
    expect(valido.error).toBeNull()
  })
})

describe("a viagem continua fechada", () => {
  let post: string

  beforeAll(async () => {
    post = await postDireto(autora.id, viagemA)
  })

  afterAll(async () => {
    await apagarPostsDe(viagemA)
  })

  it("quem lê o post não lê a viagem nem os membros dela", async () => {
    expect((await estranho.cliente.from("trip_posts").select("id").eq("id", post)).data).toHaveLength(1)
    expect((await estranho.cliente.from("trips").select("id, budget").eq("id", viagemA)).data ?? []).toEqual([])
    expect((await estranho.cliente.from("trip_members").select("user_id").eq("trip_id", viagemA)).data ?? []).toEqual(
      [],
    )
    expect((await estranho.cliente.from("expenses").select("id").eq("trip_id", viagemA)).data ?? []).toEqual([])
  })

  it("excluir a viagem apaga os posts dela", async () => {
    const extra = await criarViagem(autora.id)
    await postDireto(autora.id, extra)
    await db.query("delete from public.trips where id = $1", [extra])
    const { rows } = await db.query("select count(*)::int as n from public.trip_posts where trip_id = $1", [extra])
    expect(rows[0].n).toBe(0)
  })
})

describe("o bucket da capa", () => {
  it("nasce privado, com os limites da foto", async () => {
    const { rows } = await db.query(
      "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'capas-posts'",
    )
    expect(rows[0]).toEqual({
      public: false,
      file_size_limit: "2097152",
      allowed_mime_types: ["image/jpeg", "image/png", "image/webp"],
    })
  })

  it("storage.objects não tem policy nenhuma, de bucket nenhum", async () => {
    // Qualquer policy, e não só as que citam 'capas-posts': uma policy genérica
    // ("o dono lê o que é dele", sem bucket_id) abriria este bucket também.
    const { rows } = await db.query(
      "select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects'",
    )
    expect(rows).toEqual([])
  })

  /**
   * Com um objeto que EXISTE de verdade, criado pela API do Storage com a chave
   * de serviço (como a rota faz) e com a autora como dona — o pior caso, para
   * uma policy por owner_id também aparecer. Sem ele, "não assinou" passaria
   * pelo motivo errado: o arquivo não existiria. Cada tentativa confere o
   * estado depois, pelo banco e pelos bytes.
   */
  describe("com um objeto que existe na pasta da autora", () => {
    const BUCKET = "capas-posts"
    const WEBP = Buffer.from("RIFF\x1a\x00\x00\x00WEBPVP8 capa-original", "latin1")
    let servico: SupabaseClient
    let existente: string
    let novo: string

    async function nomesNoBucket() {
      const { rows } = await db.query(
        "select name from storage.objects where bucket_id = $1 and name = any($2) order by name",
        [BUCKET, [existente, novo]],
      )
      return rows.map((r) => r.name as string)
    }

    beforeAll(async () => {
      servico = novoCliente(chaveDeServico())
      existente = `${autora.id}/${membro.id}.webp`
      novo = `${autora.id}/${estranho.id}.webp`
      const { error } = await servico.storage.from(BUCKET).upload(existente, WEBP, { contentType: "image/webp" })
      if (error) throw new Error(`não criou a capa de teste: ${error.message}`)
      await db.query("update storage.objects set owner_id = $1 where bucket_id = $2 and name = $3", [
        autora.id,
        BUCKET,
        existente,
      ])
    })

    afterAll(async () => {
      const { error } = await servico.storage.from(BUCKET).remove([existente, novo])
      if (error) throw new Error(`limpeza do bucket falhou: ${error.message}`)
      const sobra = await nomesNoBucket()
      if (sobra.length) throw new Error(`limpeza do bucket deixou: ${sobra.join(", ")}`)
    })

    it("o objeto existe: linha no banco e bytes no Storage", async () => {
      expect(await nomesNoBucket()).toEqual([existente])
      const { data } = await servico.storage.from(BUCKET).download(existente)
      expect(Buffer.from(await data!.arrayBuffer())).toEqual(WEBP)
    })

    it("a autora, dona do objeto, não assina, não baixa e não lista com o próprio JWT", async () => {
      const assinado = await autora.cliente.storage.from(BUCKET).createSignedUrl(existente, 60)
      expect(assinado.data).toBeNull()
      expect(assinado.error).not.toBeNull()
      const baixado = await autora.cliente.storage.from(BUCKET).download(existente)
      expect(baixado.data).toBeNull()
      const listado = await autora.cliente.storage.from(BUCKET).list(autora.id)
      expect(listado.data ?? []).toEqual([])
    })

    it("a autora não sobrescreve o objeto nem envia outro na própria pasta", async () => {
      const outro = Buffer.from("RIFF\x1a\x00\x00\x00WEBPVP8 capa-trocada", "latin1")
      const sobrescrito = await autora.cliente.storage
        .from(BUCKET)
        .upload(existente, outro, { contentType: "image/webp", upsert: true })
      expect(sobrescrito.data).toBeNull()
      const enviado = await autora.cliente.storage.from(BUCKET).upload(novo, outro, { contentType: "image/webp" })
      expect(enviado.data).toBeNull()

      expect(await nomesNoBucket()).toEqual([existente])
      const { data } = await servico.storage.from(BUCKET).download(existente)
      expect(Buffer.from(await data!.arrayBuffer())).toEqual(WEBP)
    })
  })
})

/**
 * Legenda e lugares salvos: migration 20261118092400 (decisões do Micael em 18/11).
 *
 * @RF09.7
 */
describe("legenda e lugares salvos, mesmo pela Data API", () => {
  /** Um lugar com tudo o que pode sair: nome, categoria e endereço. */
  const LUGAR_COMPLETO = { name: "Time Out Market", category: "restaurant", address: "Av. 24 de Julho, Lisboa" }

  function publicarCom(ator: Ator, viagem: string, extra: { caption?: unknown; places?: unknown }) {
    const { trip_id, author_id, title, destination, start_date, end_date, items } = postDe(ator.id, viagem)
    return ator.cliente
      .from("trip_posts")
      .insert({ trip_id, author_id, title, destination, start_date, end_date, items, ...extra })
      .select("id")
      .single()
  }

  // Os posts da viagem B vivem um teste só: se uma proteção falhar e um post
  // inválido entrar, o próximo teste não esbarra no "um post por viagem" e
  // falha pelo motivo certo. O da viagem A atravessa os testes de atualização.
  afterEach(async () => {
    await apagarPostsDe(viagemB)
  })

  afterAll(async () => {
    await apagarPostsDe(viagemA)
  })

  it("aceita legenda de 280 e lugares com nome, categoria e endereço, e os devolve na leitura", async () => {
    const caption = "x".repeat(280)
    const places = [LUGAR_COMPLETO, { name: "Miradouro" }, { name: "Castelo", category: "attraction" }]
    const { data, error } = await publicarCom(privado, viagemB, { caption, places })
    expect(error).toBeNull()

    const lido = await privado.cliente.from("trip_posts").select("caption, places").eq("id", data!.id).single()
    expect(lido.error).toBeNull()
    expect(lido.data).toEqual({ caption, places })
  })

  it("sem legenda nem lugares: caption nula e places vazio", async () => {
    const { data, error } = await publicarCom(privado, viagemB, {})
    expect(error).toBeNull()
    const { rows } = await db.query("select caption, places from public.trip_posts where id = $1", [data!.id])
    expect(rows[0]).toEqual({ caption: null, places: [] })
  })

  it.each([
    ["acima de 280", "x".repeat(281)],
    ["vazia", ""],
    ["só espaços", "   "],
    ["só quebras de linha e tabulação", "\n\t \r\n"],
  ])("recusa legenda %s", async (_rotulo, caption) => {
    const { error } = await publicarCom(privado, viagemB, { caption })
    expect(error?.code).toBe(VIOLA_CHECK)
  })

  it.each([
    ["sem name", { category: "restaurant" }],
    ["name vazio", { name: "   " }],
    ["name acima de 200", { name: "x".repeat(201) }],
    ["name que não é texto", { name: 123 }],
    ["notes", { name: "Hotel", notes: "código da porta 4321" }],
    ["latitude", { name: "Hotel", latitude: "-23.5" }],
    ["longitude", { name: "Hotel", longitude: "-46.6" }],
    ["rating", { name: "Hotel", rating: "4.5" }],
    ["visited", { name: "Hotel", visited: "true" }],
    ["place_id", { name: "Hotel", place_id: "ChIJ0X31pIK3voARo3mz1ebVzDo" }],
    ["id do lugar", { name: "Hotel", id: "11111111-1111-4111-8111-111111111111" }],
    ["address vazio", { name: "Hotel", address: "" }],
    ["address só espaços", { name: "Hotel", address: "   " }],
    ["address acima de 300", { name: "Hotel", address: "x".repeat(301) }],
    ["address nulo", { name: "Hotel", address: null }],
    ["category acima de 60", { name: "Hotel", category: "x".repeat(61) }],
  ])("recusa lugar com %s", async (_rotulo, lugar) => {
    const { error } = await publicarCom(privado, viagemB, { places: [lugar] })
    expect(error?.code).toBe(VIOLA_CHECK)
  })

  it("recusa lugar que não é objeto, places que não é array e mais de 200 lugares", async () => {
    expect((await publicarCom(privado, viagemB, { places: ["Hotel"] })).error?.code).toBe(VIOLA_CHECK)
    expect((await publicarCom(privado, viagemB, { places: { name: "Hotel" } })).error?.code).toBe(VIOLA_CHECK)
    const muitos = Array.from({ length: 201 }, (_, i) => ({ name: `Lugar ${i}` }))
    expect((await publicarCom(privado, viagemB, { places: muitos })).error?.code).toBe(VIOLA_CHECK)
    const limite = Array.from({ length: 200 }, (_, i) => ({ name: `Lugar ${i}` }))
    expect((await publicarCom(privado, viagemB, { places: limite })).error).toBeNull()
  })

  it("o autor atualiza a legenda e os lugares, e apaga a legenda com nulo", async () => {
    const { data } = await publicarCom(autora, viagemA, { caption: "Primeira versão", places: [] })
    const id = data!.id

    const atualizado = await autora.cliente
      .from("trip_posts")
      .update({ caption: "Segunda versão", places: [LUGAR_COMPLETO] })
      .eq("id", id)
      .select("caption, places")
      .single()
    expect(atualizado.error).toBeNull()
    expect(atualizado.data).toEqual({ caption: "Segunda versão", places: [LUGAR_COMPLETO] })

    const semLegenda = await autora.cliente.from("trip_posts").update({ caption: null }).eq("id", id)
    expect(semLegenda.error).toBeNull()
    const { rows } = await db.query("select caption from public.trip_posts where id = $1", [id])
    expect(rows[0].caption).toBeNull()

    await autora.cliente.from("trip_posts").update({ caption: "Segunda versão" }).eq("id", id)
  })

  it("nem o autor grava, na atualização, legenda ou lugar fora do formato", async () => {
    const id = (await autora.cliente.rpc("social_meu_post_da_viagem", { viagem: viagemA })).data as string
    const longa = await autora.cliente.from("trip_posts").update({ caption: "x".repeat(281) }).eq("id", id)
    expect(longa.error?.code).toBe(VIOLA_CHECK)
    const comNotas = await autora.cliente
      .from("trip_posts")
      .update({ places: [{ name: "Hotel", notes: "senha do wi-fi" }] })
      .eq("id", id)
    expect(comNotas.error?.code).toBe(VIOLA_CHECK)
    const { rows } = await db.query("select caption, places from public.trip_posts where id = $1", [id])
    expect(rows[0]).toEqual({ caption: "Segunda versão", places: [LUGAR_COMPLETO] })
  })

  it("um terceiro, mesmo membro da viagem e vendo o post, não altera a legenda nem os lugares", async () => {
    const id = (await autora.cliente.rpc("social_meu_post_da_viagem", { viagem: viagemA })).data as string
    for (const ator of [membro, estranho]) {
      const visto = await ator.cliente.from("trip_posts").select("caption").eq("id", id)
      expect(visto.data).toHaveLength(1)
      const alterado = await ator.cliente
        .from("trip_posts")
        .update({ caption: "invadido", places: [{ name: "Lugar invadido" }] })
        .eq("id", id)
        .select("id")
      expect(alterado.data ?? []).toEqual([])
    }
    const { rows } = await db.query("select caption, places from public.trip_posts where id = $1", [id])
    expect(rows[0]).toEqual({ caption: "Segunda versão", places: [LUGAR_COMPLETO] })
  })

  it("o visitante sem sessão não lê a legenda nem os lugares", async () => {
    const id = (await autora.cliente.rpc("social_meu_post_da_viagem", { viagem: viagemA })).data as string
    const { data, error } = await visitante.from("trip_posts").select("caption, places").eq("id", id)
    expect(data).toBeNull()
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })
})
