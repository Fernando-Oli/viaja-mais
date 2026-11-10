import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { Client } from "pg"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"
import { listarRede, podeVerRede, POR_PAGINA, removerSeguidor, type Lado } from "@/lib/social/rede"

/**
 * As listas da rede de um perfil e remover seguidor (S05-M-listas). Não há
 * tabela nem policy nova: aqui se prova que a RLS, os grants e a `pode_ver_rede`
 * da S03 (migration 20261007105848) seguram as listas e a remoção, e que a
 * paginação da lib, contra o PostgREST de verdade, não duplica nem pula
 * ninguém, também com `created_at` empatado.
 *
 * Mesmo princípio de 04-social: cada usuário loga de verdade pelo GoTrue com a
 * chave anon e fala com o PostgREST como o navegador. A conexão direta só monta
 * estado (vínculos e contas descartáveis), e tudo o que ela cria sai no fim:
 * fica gravado, e não numa transação, porque o PostgREST lê por outra conexão.
 *
 * O que se prova aqui:
 *   - quem não segue o Bruno (privado) não vê o vínculo dele com um perfil
 *     privado, e a `pode_ver_rede` lhe diz não; a seguidora aceita vê a lista;
 *   - pendentes não aparecem para terceiros nem nas listas;
 *   - só o followee remove o próprio seguidor, e só o vínculo aceito;
 *   - visitante sem sessão não lê;
 *   - a paginação: páginas de 20, na ordem combinada, sem duplicata nem salto,
 *     nas duas listas; o cursor de quem saiu volta como inválido; a
 *     pendente não aparece. (Conta sem username não entra na rede: a migration
 *     20261110200043 a recusa, e isso é provado em 11-exigir-username.)
 *
 * Ana, Bruno e Carla são do seed, sem vínculos entre si, como o seed os deixa.
 *
 * @RF09.6 @RF09.9 @RNF02.4
 */

const API = exigirLocal(variavelObrigatoria("API_URL"), "API_URL")
const CHAVE = variavelObrigatoria("ANON_KEY")
const CONEXAO = exigirLocal(variavelObrigatoria("DATABASE_URL"), "DATABASE_URL")

const ANA = { email: "teste.a@viajamais.local", senha: "viajamais123" }
const BRUNO = { email: "teste.b@viajamais.local", senha: "viajamais123" }
const CARLA = { email: "teste.c@viajamais.local", senha: "viajamais123" }
/** O Davi do seed (supabase/seed.sql), que este arquivo não loga. */
const DAVI = "44444444-4444-4444-8444-444444444444"

const VIOLA_RLS_OU_GRANT = "42501"

/** As fotos não entram nestes testes: ninguém do seed nem das contas descartáveis tem foto. */
const semStorage = () => {
  throw new Error("o Storage não deveria ser chamado: ninguém aqui tem foto")
}

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

/** As contas descartáveis criadas pelo arquivo, apagadas no fim (o perfil e os vínculos vão em cascata). */
const descartaveis: string[] = []
const marca = `l${Date.now().toString(36)}`

/** Cria contas com username `<marca>_<prefixo>NN`, o perfil nasce pelo trigger. Devolve os ids na ordem. */
async function contas(prefixo: string, n: number, opcoes: { privado?: boolean } = {}) {
  const { rows } = await db.query<{ id: string }>(
    `insert into auth.users (id, email)
     select gen_random_uuid(), 'listas.' || $2 || '.' || g || '.' || floor(random() * 1e9)::bigint || '@viajamais.local'
       from generate_series(1, $1) g
     returning id`,
    [n, `${marca}${prefixo}`],
  )
  const ids = rows.map((r) => r.id)
  descartaveis.push(...ids)
  for (const [i, id] of ids.entries()) {
    await db.query("update public.profiles set username = $2, is_public = $3 where id = $1", [
      id,
      `${marca}_${prefixo}${String(i + 1).padStart(2, "0")}`,
      !opcoes.privado,
    ])
  }
  return ids
}

/** Vínculos aceitos, todos num comando só: o `created_at` sai empatado, como numa importação. */
async function vinculosAceitos(pares: [seguidor: string, seguido: string][]) {
  await db.query(
    `insert into public.follows (follower_id, followee_id)
     select * from unnest($1::uuid[], $2::uuid[])`,
    [pares.map(([s]) => s), pares.map(([, d]) => d)],
  )
  // O trigger decide o estado pelo alvo (privado nasce pendente); aqui eles já entram aceitos.
  for (const [s, d] of pares) {
    await db.query("update public.follows set status = 'accepted' where follower_id = $1 and followee_id = $2", [s, d])
  }
}

async function pendente(seguidor: string, seguido: string) {
  await db.query("insert into public.follows (follower_id, followee_id) values ($1, $2)", [seguidor, seguido])
  await db.query("update public.follows set status = 'pending' where follower_id = $1 and followee_id = $2", [seguidor, seguido])
}

async function vinculo(seguidor: string, seguido: string) {
  const { rows } = await db.query<{ status: string }>(
    "select status from public.follows where follower_id = $1 and followee_id = $2",
    [seguidor, seguido],
  )
  return rows[0]?.status ?? null
}

/**
 * Todo vínculo da Ana, do Bruno e da Carla sai, com qualquer pessoa: o seed os
 * deixa sem vínculo nenhum, e os testes criam vínculos deles com o Davi e com
 * contas descartáveis. Os vínculos do Davi com outras pessoas ficam.
 */
async function limparVinculosDoSeed() {
  await db.query("delete from public.follows where follower_id = any($1::uuid[]) or followee_id = any($1::uuid[])", [
    [idAna, idBruno, idCarla],
  ])
}

/** A lista inteira, página por página, como a tela faz com "Ver mais". */
async function listaInteira(cliente: SupabaseClient, dono: string, lado: Lado) {
  const paginas: string[][] = []
  let cursor: string | undefined
  do {
    const pagina = await listarRede(cliente, semStorage, dono, lado, cursor)
    if (!pagina) throw new Error("o cursor da própria lista não deveria ficar inválido")
    paginas.push(pagina.pessoas.map((p) => p.username))
    cursor = pagina.proximo ?? undefined
  } while (cursor && paginas.length < 20)
  return paginas
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
  await limparVinculosDoSeed()
})

afterEach(async () => {
  await limparVinculosDoSeed()
})

afterAll(async () => {
  await limparVinculosDoSeed()
  if (descartaveis.length) await db.query("delete from auth.users where id = any($1::uuid[])", [descartaveis])
  await db.end()
})

describe("listas — quem vê a rede", () => {
  it("a Carla não vê o vínculo do Bruno (privado) com um perfil privado, e a pode_ver_rede lhe diz não", async () => {
    const [privada] = await contas("pa", 1, { privado: true })
    await vinculosAceitos([
      [idAna, idBruno],
      [privada, idBruno],
    ])

    const { data, error } = await carla.from("follows").select("follower_id").eq("followee_id", idBruno)
    expect(error).toBeNull()
    const vistos = (data ?? []).map((l) => l.follower_id)
    // O da Ana (pública) aparece, porque está na lista de seguindo dela: é a
    // decisão da S03, como no Instagram. O da conta privada, não.
    expect(vistos).toContain(idAna)
    expect(vistos).not.toContain(privada)

    expect(await podeVerRede(carla, idBruno)).toBe(false)
  })

  it("a Ana, seguidora aceita, e o próprio Bruno veem a lista inteira dele, com a conta privada", async () => {
    const [privada] = await contas("pb", 1, { privado: true })
    await vinculosAceitos([
      [idAna, idBruno],
      [privada, idBruno],
    ])
    const nomePrivada = `${marca}_pb01`

    expect(await podeVerRede(ana, idBruno)).toBe(true)
    expect((await listaInteira(ana, idBruno, "seguidores")).flat().sort()).toEqual(["ana", nomePrivada].sort())
    expect(await podeVerRede(bruno, idBruno)).toBe(true)
    expect((await listaInteira(bruno, idBruno, "seguidores")).flat().sort()).toEqual(["ana", nomePrivada].sort())
  })

  it("a lista de seguindo de um perfil público mostra o vínculo com o privado, a quem pode ver a do público", async () => {
    await vinculosAceitos([[idAna, idBruno]])

    expect(await podeVerRede(carla, idAna)).toBe(true)
    expect(await listarRede(carla, semStorage, idAna, "seguindo")).toEqual({
      pessoas: [{ username: "bruno", full_name: expect.any(String), avatar_url: null, is_public: false }],
      proximo: null,
    })
  })

  it("pendentes não aparecem para terceiros, nem nas listas, nem na lista do próprio dono", async () => {
    await vinculosAceitos([[idAna, idBruno]])
    await pendente(DAVI, idBruno)

    for (const cliente of [ana, carla]) {
      const { data } = await cliente.from("follows").select("follower_id").eq("followee_id", idBruno).eq("follower_id", DAVI)
      expect(data).toEqual([])
    }
    expect((await listaInteira(bruno, idBruno, "seguidores")).flat()).toEqual(["ana"])
  })

  it("visitante sem sessão não lê os vínculos nem pergunta à pode_ver_rede", async () => {
    const leitura = await visitante.from("follows").select("follower_id").eq("followee_id", idAna)
    expect(leitura.error?.code).toBe(VIOLA_RLS_OU_GRANT)
    expect(leitura.data).toBeNull()

    const funcao = await visitante.rpc("pode_ver_rede", { perfil: idAna })
    expect(funcao.error).not.toBeNull()
    await expect(podeVerRede(visitante, idAna)).rejects.toBeTruthy()
  })
})

describe("listas — remover seguidor", () => {
  it("só o followee remove: a Carla apagando o vínculo da Ana com o Bruno não afeta linha nenhuma", async () => {
    await vinculosAceitos([[idAna, idBruno]])

    const { data, error } = await carla
      .from("follows")
      .delete()
      .eq("follower_id", idAna)
      .eq("followee_id", idBruno)
      .select("follower_id")
    expect(error).toBeNull()
    expect(data).toEqual([])
    expect(await removerSeguidor(carla, idBruno, idAna)).toBe(false)
    expect(await vinculo(idAna, idBruno)).toBe("accepted")
  })

  it("o Bruno não mexe num vínculo alheio, nem dizendo ser o dono dele", async () => {
    await vinculosAceitos([[idAna, idCarla]])

    expect(await removerSeguidor(bruno, idCarla, idAna)).toBe(false)
    expect(await vinculo(idAna, idCarla)).toBe("accepted")
  })

  it("removerSeguidor não leva uma solicitação pendente", async () => {
    await pendente(DAVI, idBruno)

    expect(await removerSeguidor(bruno, idBruno, DAVI)).toBe(false)
    expect(await vinculo(DAVI, idBruno)).toBe("pending")
  })

  it("o Bruno remove a Ana, em silêncio, e ela pode pedir de novo", async () => {
    await vinculosAceitos([[idAna, idBruno]])

    expect(await removerSeguidor(bruno, idBruno, idAna)).toBe(true)
    expect(await vinculo(idAna, idBruno)).toBeNull()
    expect((await listaInteira(bruno, idBruno, "seguidores")).flat()).toEqual([])

    // Sem barreira: o pedido novo passa, e nasce pendente porque o Bruno é privado.
    const { error } = await ana.from("follows").insert({ follower_id: idAna, followee_id: idBruno })
    expect(error).toBeNull()
    expect(await vinculo(idAna, idBruno)).toBe("pending")
  })
})

describe("listas — paginação contra o PostgREST de verdade", () => {
  // Um perfil-alvo com 25 seguidores empatados (mesmo created_at), 3 mais
  // antigos e 1 pendente. O alvo também segue os 28.
  let alvo: string
  let empatados: string[]
  let antigos: string[]

  beforeAll(async () => {
    ;[alvo] = await contas("alvo", 1)
    const idsEmpatados = await contas("e", 25)
    const idsAntigos = await contas("a", 3)
    const [pedinte] = await contas("p", 1)

    await vinculosAceitos([...idsEmpatados, ...idsAntigos].map((id) => [id, alvo] as [string, string]))
    await vinculosAceitos([...idsEmpatados, ...idsAntigos].map((id) => [alvo, id] as [string, string]))
    await pendente(pedinte, alvo)
    // Os antigos: um dia, dois dias e três dias antes, nos dois lados.
    for (const [i, id] of idsAntigos.entries()) {
      await db.query(
        `update public.follows set created_at = created_at - make_interval(days => $3)
          where (follower_id = $1 and followee_id = $2) or (follower_id = $2 and followee_id = $1)`,
        [id, alvo, i + 1],
      )
    }

    empatados = idsEmpatados.map((_, i) => `${marca}_e${String(i + 1).padStart(2, "0")}`)
    antigos = idsAntigos.map((_, i) => `${marca}_a${String(i + 1).padStart(2, "0")}`)
  })

  it.each(["seguidores", "seguindo"] as const)(
    "%s: páginas de 20, os empatados em ordem de username, depois os antigos, sem duplicata nem salto",
    async (lado) => {
      const paginas = await listaInteira(carla, alvo, lado)

      expect(paginas.map((p) => p.length)).toEqual([POR_PAGINA, 8])
      const todos = paginas.flat()
      expect(todos).toEqual([...empatados, ...antigos])
      expect(new Set(todos).size).toBe(todos.length)
    },
  )

  it("a primeira página termina no meio dos empatados, e o cursor é o username da 20ª pessoa", async () => {
    const primeira = await listarRede(carla, semStorage, alvo, "seguidores")

    expect(primeira?.proximo).toBe(empatados[POR_PAGINA - 1])
  })

  it("o cursor de quem não está na lista volta como inválido (null), e a lib não inventa uma página", async () => {
    expect(await listarRede(carla, semStorage, alvo, "seguidores", `${marca}_naoexiste`)).toBeNull()
    // A pendente não está na lista, então também não serve de cursor.
    expect(await listarRede(carla, semStorage, alvo, "seguidores", `${marca}_p01`)).toBeNull()
  })

  it("a pendente não aparece em página nenhuma, e só os aceitos com username entram", async () => {
    const todos = (await listaInteira(carla, alvo, "seguidores")).flat()

    expect(todos).not.toContain(`${marca}_p01`)
    expect(todos.every((u) => u.startsWith(`${marca}_e`) || u.startsWith(`${marca}_a`))).toBe(true)
  })
})
