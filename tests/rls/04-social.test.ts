import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { Client } from "pg"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"

/**
 * Isolamento do domínio Social: perfil público/privado e follows.
 *
 * Mesmo princípio de 01-isolamento: cada usuário loga de verdade pelo GoTrue com
 * a chave anon e fala com o PostgREST como o navegador. A RLS é a fronteira real.
 *
 * O que se prova aqui, do mais crítico para o menos:
 *   - o estado inicial do follow é do servidor: o cliente não manda status nem
 *     datas (grant de coluna), e o trigger os fixa mesmo para quem escreve
 *     direto no banco;
 *   - ninguém se auto-aprova — nem por UPDATE, nem por upsert — e ninguém forja
 *     o follower_id de outro;
 *   - só o dono (followee) aprova, não rebaixa e não reponta o vínculo;
 *   - um terceiro não lê pendente, não aprova e não apaga vínculo alheio;
 *   - a rede de um perfil privado só aparece para o dono e seguidores aceitos;
 *   - em profiles, cada um escreve só o próprio perfil e só as colunas
 *     editáveis; visitante sem sessão não lê nada;
 *   - e, contra correção exagerada, o fluxo legítimo continua funcionando:
 *     editar o próprio perfil, seguir, aprovar, recusar, remover seguidor e
 *     deixar de seguir;
 *   - apagar a conta leva junto o perfil e os vínculos, nos dois papéis.
 *
 * Os erros são conferidos pelo código do Postgres, não só por "deu erro": um
 * teste que espera a RLS barrar não pode passar porque o check barrou.
 *
 * Ana é pública, Bruno é privado, Carla é a terceira — definido no seed.
 *
 * @RF02.5 @RF02.6 @RF02.7 @RF09.1 @RF09.2 @RF09.3 @RF09.4 @RF09.5 @RF09.6 @RF09.9 @RNF02.4
 */

const API = exigirLocal(variavelObrigatoria("API_URL"), "API_URL")
const CHAVE = variavelObrigatoria("ANON_KEY")
// Conexão direta só para o que nenhum cliente da aplicação alcança: o
// catálogo, escrever sem passar pelo grant e apagar de auth.users. Tudo que
// escreve roda numa transação desfeita no fim: o banco sai como entrou.
const CONEXAO = exigirLocal(variavelObrigatoria("DATABASE_URL"), "DATABASE_URL")

const ANA = { email: "teste.a@viajamais.local", senha: "viajamais123" }
const BRUNO = { email: "teste.b@viajamais.local", senha: "viajamais123" }
const CARLA = { email: "teste.c@viajamais.local", senha: "viajamais123" }

/** Códigos do Postgres que o PostgREST devolve em `error.code`. */
const VIOLA_RLS_OU_GRANT = "42501"
const VIOLA_UNICIDADE = "23505"
const VIOLA_CHECK = "23514"

const DATA_FORJADA = "2099-01-01T00:00:00Z"

/** Compara com o relógio, não com o ano: 2099-01-01T00:00Z ainda é 2098 em Brasília. */
function ehDeAgora(timestamp: string) {
  return Date.parse(timestamp) < Date.now() + 60_000
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

/** Cada um apaga todo vínculo em que é parte — a policy de DELETE permite. */
async function limparVinculos() {
  for (const [cliente, id] of [
    [ana, idAna],
    [bruno, idBruno],
    [carla, idCarla],
  ] as const) {
    const { error } = await cliente.from("follows").delete().or(`follower_id.eq.${id},followee_id.eq.${id}`)
    if (error) throw new Error(`limpeza dos vínculos falhou: ${error.message}`)
  }
}

/** Apaga um vínculo pelo lado de quem é parte, falhando alto se não conseguir. */
async function desfazer(cliente: SupabaseClient, followerId: string, followeeId: string) {
  const { error } = await cliente.from("follows").delete().eq("follower_id", followerId).eq("followee_id", followeeId)
  if (error) throw new Error(`não desfez ${followerId}→${followeeId}: ${error.message}`)
}

/** Lê o vínculo como um dos lados, para conferir o estado sem depender de quem testou. */
async function vinculo(cliente: SupabaseClient, followerId: string, followeeId: string) {
  const { data } = await cliente
    .from("follows")
    .select("status, created_at, updated_at")
    .eq("follower_id", followerId)
    .eq("followee_id", followeeId)
    .maybeSingle()
  return data
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

  await limparVinculos()
})

afterAll(async () => {
  await limparVinculos()
  await db.end()
})

describe("perfil — dados básicos visíveis, escrita restrita", () => {
  it("Bruno vê os dados básicos do perfil público da Ana", async () => {
    const { data } = await bruno.from("profiles").select("id, username, is_public").eq("id", idAna)
    expect(data).toHaveLength(1)
    expect(data?.[0].username).toBe("ana")
  })

  it("Ana vê os dados básicos mesmo de um perfil privado (Bruno)", async () => {
    // A privacidade recai sobre as publicações e a rede, não sobre
    // nome/username/bio (detalhamento do RF02 na seção 14).
    const { data } = await ana.from("profiles").select("id, username, is_public").eq("id", idBruno)
    expect(data).toHaveLength(1)
    expect(data?.[0].is_public).toBe(false)
  })

  it("visitante sem sessão não tem acesso nenhum a profiles", async () => {
    // 42501 e não lista vazia: sem o revoke, a RLS também devolveria vazio, e o
    // teste não distinguiria as duas coisas.
    const { error } = await visitante.from("profiles").select("id")
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("Bruno não edita o perfil da Ana", async () => {
    const { data } = await bruno.from("profiles").update({ bio: "invadido" }).eq("id", idAna).select()
    expect(data).toEqual([])

    const { data: original } = await ana.from("profiles").select("bio").eq("id", idAna).single()
    expect(original?.bio).not.toBe("invadido")
  })

  it("Bruno não cria um perfil em nome da Ana", async () => {
    // 42501 da policy, e não 23505 da PK: a WITH CHECK roda antes da unicidade.
    const { error } = await bruno.from("profiles").insert({ id: idAna, full_name: "Ana Falsa" })
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("cada um continua editando o próprio perfil (RF02.6)", async () => {
    // Contra correção exagerada: as policies de escrita foram recriadas e o
    // UPDATE ficou restrito a colunas; o caso legítimo precisa continuar.
    const { data } = await bruno.from("profiles").update({ bio: "Bio nova do Bruno." }).eq("id", idBruno).select("bio")
    expect(data).toEqual([{ bio: "Bio nova do Bruno." }])

    const { error } = await bruno
      .from("profiles")
      .update({ bio: "Viajante de teste — perfil privado." })
      .eq("id", idBruno)
    expect(error).toBeNull()
  })

  it("ninguém reescreve o created_at do próprio perfil (grant de coluna)", async () => {
    const { error } = await bruno.from("profiles").update({ created_at: "2015-01-01T00:00:00Z" }).eq("id", idBruno)
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
  })

  it("o updated_at do perfil é do servidor, mesmo que o cliente mande outro", async () => {
    // A rota antiga /api/profile/update envia updated_at; o trigger decide o valor.
    const { data } = await bruno
      .from("profiles")
      .update({ bio: "Viajante de teste — perfil privado.", updated_at: DATA_FORJADA })
      .eq("id", idBruno)
      .select("updated_at")
      .single()
    expect(ehDeAgora(data!.updated_at), "o trigger tem de sobrepor updated_at").toBe(true)
  })

  it("username é único (RF02.5)", async () => {
    const { error } = await bruno.from("profiles").update({ username: "ana" }).eq("id", idBruno)
    expect(error?.code, "username repetido deveria violar a unicidade").toBe(VIOLA_UNICIDADE)
  })

  it("busca por username ignora maiúsculas: /u/Ana encontra ana (citext)", async () => {
    // É o motivo de a coluna ser citext: o route handler do perfil público
    // filtra com igualdade simples, sem lower().
    const { data } = await bruno.from("profiles").select("id").eq("username", "Ana")
    expect(data).toEqual([{ id: idAna }])
  })

  it("username fora do formato é recusado (RF02.5)", async () => {
    for (const invalido of ["AB", "ab", "com espaco", "Ana", "a".repeat(31)]) {
      const { error } = await bruno.from("profiles").update({ username: invalido }).eq("id", idBruno)
      expect(error?.code, `"${invalido}" deveria violar o check de formato`).toBe(VIOLA_CHECK)
    }

    const { data } = await bruno.from("profiles").select("username").eq("id", idBruno).single()
    expect(data?.username).toBe("bruno")
  })

  it("username reservado é recusado pelo banco, mesmo sem passar pela rota (RF02.5)", async () => {
    // O PostgREST aceita escrita direta com o JWT do navegador; a lista da rota
    // não alcança esse caminho, por isso o check também está no banco.
    for (const reservado of ["suporte", "admin", "viajamais_oficial", "suporte_viajamais"]) {
      const { error } = await bruno.from("profiles").update({ username: reservado }).eq("id", idBruno)
      expect(error?.code, `"${reservado}" deveria violar o check de reservados`).toBe(VIOLA_CHECK)
    }

    // Conter um reservado que não é a marca continua permitido.
    const { error } = await bruno.from("profiles").update({ username: "admin_da_silva" }).eq("id", idBruno)
    expect(error).toBeNull()
    await bruno.from("profiles").update({ username: "bruno" }).eq("id", idBruno)
  })

  it("bio acima de 280 caracteres é recusada (RF02.6)", async () => {
    const { error } = await bruno.from("profiles").update({ bio: "x".repeat(281) }).eq("id", idBruno)
    expect(error?.code).toBe(VIOLA_CHECK)
  })

  it("nome acima de 120 caracteres é recusado", async () => {
    const { error } = await bruno.from("profiles").update({ full_name: "x".repeat(121) }).eq("id", idBruno)
    expect(error?.code).toBe(VIOLA_CHECK)
  })
})

describe("estrutura de profiles", () => {
  it("as colunas de profiles são exatamente as conhecidas", async () => {
    // profiles é lida por qualquer autenticado. Uma coluna nova aqui vira
    // pública no mesmo instante — este teste obriga a decidir isso de propósito.
    const { rows } = await db.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' order by column_name`,
    )
    expect(rows.map((r) => r.column_name)).toEqual([
      "avatar_url",
      "bio",
      "created_at",
      "full_name",
      "id",
      "is_public",
      "updated_at",
      "username",
    ])
  })

  it("contas novas nascem públicas (RF02.7)", async () => {
    // As que já existiam antes do social ficam privadas: a migration adiciona a
    // coluna com default false e só depois troca o default.
    const { rows } = await db.query(
      `select column_default from information_schema.columns
        where table_schema = 'public' and table_name = 'profiles' and column_name = 'is_public'`,
    )
    expect(rows[0].column_default).toBe("true")
  })
})

describe("seguir perfil público (efeito imediato)", () => {
  afterAll(async () => {
    await desfazer(bruno, idBruno, idAna)
  })

  it("Bruno segue a Ana (pública) e o vínculo nasce aceito (RF09.1)", async () => {
    const { error } = await bruno.from("follows").insert({ follower_id: idBruno, followee_id: idAna })
    expect(error).toBeNull()
    expect((await vinculo(bruno, idBruno, idAna))?.status).toBe("accepted")
  })

  it("seguir de novo levanta erro de chave (a idempotência é do route handler)", async () => {
    // A PK composta garante unicidade, mas não silencia o segundo INSERT: quem
    // torna idempotente é o INSERT ... ON CONFLICT DO NOTHING no route handler.
    const { error } = await bruno.from("follows").insert({ follower_id: idBruno, followee_id: idAna })
    expect(error?.code).toBe(VIOLA_UNICIDADE)
  })
})

describe("seguir perfil privado (solicitação pendente)", () => {
  afterAll(async () => {
    await desfazer(ana, idAna, idBruno)
  })

  it("o cliente não escolhe status nem datas ao seguir (grant de coluna)", async () => {
    // O vetor da seção 25: auto-aceitar-se num perfil privado, ou furar a
    // ordenação da central de notificações com uma data no futuro.
    const { error: comStatus } = await ana
      .from("follows")
      .insert({ follower_id: idAna, followee_id: idBruno, status: "accepted" })
    expect(comStatus?.code).toBe(VIOLA_RLS_OU_GRANT)

    const { error: comData } = await ana
      .from("follows")
      .insert({ follower_id: idAna, followee_id: idBruno, created_at: DATA_FORJADA })
    expect(comData?.code).toBe(VIOLA_RLS_OU_GRANT)

    expect(await vinculo(ana, idAna, idBruno)).toBeNull()
  })

  it("Ana solicita seguir o Bruno (privado) e o vínculo nasce pendente (RF09.2)", async () => {
    const { error } = await ana.from("follows").insert({ follower_id: idAna, followee_id: idBruno })
    expect(error).toBeNull()

    const linha = await vinculo(ana, idAna, idBruno)
    expect(linha?.status).toBe("pending")
    expect(ehDeAgora(linha!.created_at)).toBe(true)
  })

  it("o solicitante (Ana) não se auto-aprova por UPDATE", async () => {
    const { data } = await ana
      .from("follows")
      .update({ status: "accepted" })
      .eq("follower_id", idAna)
      .eq("followee_id", idBruno)
      .select()
    expect(data, "só o followee aprova — a policy de UPDATE exige uid = followee").toEqual([])
  })

  it("o solicitante (Ana) não se auto-aprova por upsert", async () => {
    // O terceiro caminho até 'accepted', e o mecanismo que a S05 vai usar para
    // seguir de forma idempotente: precisa continuar fechado.
    const { error } = await ana
      .from("follows")
      .upsert({ follower_id: idAna, followee_id: idBruno, status: "accepted" })
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    expect((await vinculo(bruno, idAna, idBruno))?.status).toBe("pending")
  })

  it("uma terceira (Carla) não enxerga a solicitação pendente (RF09.3)", async () => {
    expect(await vinculo(carla, idAna, idBruno)).toBeNull()
  })

  it("uma terceira (Carla) não aprova nem apaga a solicitação alheia", async () => {
    const { data: aprovou } = await carla
      .from("follows")
      .update({ status: "accepted" })
      .eq("follower_id", idAna)
      .eq("followee_id", idBruno)
      .select()
    expect(aprovou).toEqual([])

    const { data: apagou } = await carla
      .from("follows")
      .delete()
      .eq("follower_id", idAna)
      .eq("followee_id", idBruno)
      .select()
    expect(apagou).toEqual([])

    // A prova é o estado depois, lido por quem tem direito de ver.
    expect((await vinculo(bruno, idAna, idBruno))?.status).toBe("pending")
  })

  it("o dono (Bruno) vê a solicitação e a aprova, e o updated_at avança (RF09.3, RF09.4)", async () => {
    const pendente = await vinculo(bruno, idAna, idBruno)
    expect(pendente?.status).toBe("pending")

    const { data: aprovado } = await bruno
      .from("follows")
      .update({ status: "accepted" })
      .eq("follower_id", idAna)
      .eq("followee_id", idBruno)
      .select("status, created_at, updated_at")
    expect(aprovado).toHaveLength(1)
    expect(aprovado?.[0].status).toBe("accepted")
    expect(Date.parse(aprovado![0].updated_at), "o trigger de UPDATE tem de tocar updated_at").toBeGreaterThan(
      Date.parse(aprovado![0].created_at),
    )
  })

  it("uma terceira (Carla) não desfaz um vínculo aceito alheio, que ela enxerga", async () => {
    // A pendente é invisível para a Carla, e o Postgres não deixa apagar o que
    // a policy de SELECT esconde. Esta aceita ela enxerga — está na lista de
    // seguidos da Ana, que é pública —, então só a policy de DELETE a protege.
    expect((await vinculo(carla, idAna, idBruno))?.status).toBe("accepted")

    const { data: apagou } = await carla
      .from("follows")
      .delete()
      .eq("follower_id", idAna)
      .eq("followee_id", idBruno)
      .select()
    expect(apagou).toEqual([])
    expect((await vinculo(bruno, idAna, idBruno))?.status).toBe("accepted")
  })

  it("o dono não rebaixa um vínculo aceito para pendente", async () => {
    // Para desfazer, ele apaga (RF09.9); a WITH CHECK só aceita 'accepted'.
    const { error } = await bruno
      .from("follows")
      .update({ status: "pending" })
      .eq("follower_id", idAna)
      .eq("followee_id", idBruno)
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)
    expect((await vinculo(bruno, idAna, idBruno))?.status).toBe("accepted")
  })

  it("o dono não reponta follower_id via UPDATE (grant de coluna)", async () => {
    // Bruno é o followee e passa na RLS de UPDATE; ainda assim não pode escrever
    // follower_id e fabricar um seguidor, porque o grant só concede status.
    const { error } = await bruno
      .from("follows")
      .update({ follower_id: idCarla })
      .eq("follower_id", idAna)
      .eq("followee_id", idBruno)
    expect(error?.code, "escrever follower_id deveria ser negado pelo grant de coluna").toBe(VIOLA_RLS_OU_GRANT)

    expect((await vinculo(bruno, idAna, idBruno))?.status).toBe("accepted")
  })
})

describe("estado inicial imposto pelo trigger", () => {
  it("mesmo escrevendo direto no banco, status e datas são do servidor", async () => {
    // Sem passar pelo grant (service_role, SQL direto), o trigger é a única
    // barreira — é o que este caso isola.
    try {
      await db.query("begin")
      const { rows } = await db.query(
        `insert into public.follows (follower_id, followee_id, status, created_at, updated_at)
         values ($1, $2, 'accepted', $3, $3)
         returning status, created_at, updated_at`,
        [idCarla, idBruno, DATA_FORJADA],
      )
      expect(rows[0].status, "perfil privado nasce pendente").toBe("pending")
      expect(ehDeAgora(rows[0].created_at.toISOString())).toBe(true)
      expect(ehDeAgora(rows[0].updated_at.toISOString())).toBe(true)
    } finally {
      await db.query("rollback")
    }
  })
})

describe("rede de perfil privado", () => {
  // Para ter um vínculo cujos DOIS lados são privados, a Ana fica privada só
  // neste bloco: Ana→Bruno aceito, entre dois perfis privados.
  beforeAll(async () => {
    await ana.from("follows").insert({ follower_id: idAna, followee_id: idBruno })
    await bruno.from("follows").update({ status: "accepted" }).eq("follower_id", idAna).eq("followee_id", idBruno)
    const { error } = await ana.from("profiles").update({ is_public: false }).eq("id", idAna)
    if (error) throw new Error(`não tornou a Ana privada: ${error.message}`)
  })

  afterAll(async () => {
    await ana.from("profiles").update({ is_public: true }).eq("id", idAna)
    await desfazer(ana, idAna, idBruno)
    await desfazer(carla, idCarla, idBruno)
  })

  it("quem não segue nenhum dos dois não vê o vínculo entre perfis privados", async () => {
    expect(await vinculo(carla, idAna, idBruno)).toBeNull()
  })

  it("as partes continuam vendo o próprio vínculo", async () => {
    expect((await vinculo(ana, idAna, idBruno))?.status).toBe("accepted")
    expect((await vinculo(bruno, idAna, idBruno))?.status).toBe("accepted")
  })

  it("seguidora aceita do Bruno passa a ver a rede dele (RF09.6)", async () => {
    await carla.from("follows").insert({ follower_id: idCarla, followee_id: idBruno })
    // Pendente ainda não dá acesso.
    expect(await vinculo(carla, idAna, idBruno)).toBeNull()

    await bruno.from("follows").update({ status: "accepted" }).eq("follower_id", idCarla).eq("followee_id", idBruno)
    expect((await vinculo(carla, idAna, idBruno))?.status).toBe("accepted")
  })
})

describe("recusar e remover seguidor — o dono desfaz o vínculo", () => {
  afterAll(async () => {
    await desfazer(carla, idCarla, idBruno)
  })

  it("Bruno recusa a solicitação da Carla, que some para os dois (RF09.4)", async () => {
    await carla.from("follows").insert({ follower_id: idCarla, followee_id: idBruno })

    const { data: recusada } = await bruno
      .from("follows")
      .delete()
      .eq("follower_id", idCarla)
      .eq("followee_id", idBruno)
      .select()
    expect(recusada).toHaveLength(1)
    expect(await vinculo(carla, idCarla, idBruno)).toBeNull()
  })

  it("Bruno remove a Carla já aceita, e ela pode solicitar de novo (RF09.9)", async () => {
    await carla.from("follows").insert({ follower_id: idCarla, followee_id: idBruno })
    await bruno.from("follows").update({ status: "accepted" }).eq("follower_id", idCarla).eq("followee_id", idBruno)
    expect((await vinculo(carla, idCarla, idBruno))?.status).toBe("accepted")

    const { data: removida } = await bruno
      .from("follows")
      .delete()
      .eq("follower_id", idCarla)
      .eq("followee_id", idBruno)
      .select()
    expect(removida).toHaveLength(1)

    // Remoção silenciosa e sem barreira: a nova solicitação volta a ser pendente.
    const { error } = await carla.from("follows").insert({ follower_id: idCarla, followee_id: idBruno })
    expect(error).toBeNull()
    expect((await vinculo(carla, idCarla, idBruno))?.status).toBe("pending")
  })
})

describe("forjar vínculo", () => {
  it("Bruno não cria um follow com o follower_id da Ana", async () => {
    const { error } = await bruno.from("follows").insert({ follower_id: idAna, followee_id: idCarla })
    expect(error?.code, "with check de INSERT exige uid = follower_id").toBe(VIOLA_RLS_OU_GRANT)
    expect(await vinculo(ana, idAna, idCarla)).toBeNull()
  })

  it("ninguém segue a si mesmo", async () => {
    const { error } = await ana.from("follows").insert({ follower_id: idAna, followee_id: idAna })
    expect(error?.code, "o check follows_sem_auto_seguir deveria barrar").toBe(VIOLA_CHECK)
  })

  it("visitante sem sessão não segue ninguém nem lê vínculos", async () => {
    const { error: inseriu } = await visitante.from("follows").insert({ follower_id: idAna, followee_id: idCarla })
    expect(inseriu?.code).toBe(VIOLA_RLS_OU_GRANT)

    // 42501 e não lista vazia: é o revoke de anon que está sendo provado.
    const { error: leu } = await visitante.from("follows").select("*")
    expect(leu?.code).toBe(VIOLA_RLS_OU_GRANT)
  })
})

describe("listas públicas e não sobre-correção", () => {
  it("um vínculo aceito com perfil público é visível para quem não é parte (RF09.6)", async () => {
    await carla.from("follows").insert({ follower_id: idCarla, followee_id: idAna })

    expect((await vinculo(bruno, idCarla, idAna))?.status).toBe("accepted")
  })

  it("deixar de seguir é DELETE da própria linha e continua permitido (RF09.5)", async () => {
    const { data } = await carla
      .from("follows")
      .delete()
      .eq("follower_id", idCarla)
      .eq("followee_id", idAna)
      .select()
    expect(data).toHaveLength(1)
  })
})

describe("exclusão de conta", () => {
  it("apagar a conta apaga o perfil e os vínculos nos dois papéis (cascade, base do RF02.4)", async () => {
    try {
      await db.query("begin")
      // Carla segue a Ana e é seguida pelo Bruno: os dois papéis.
      await db.query("insert into public.follows (follower_id, followee_id) values ($1, $2), ($3, $1)", [
        idCarla,
        idAna,
        idBruno,
      ])

      await db.query("delete from auth.users where id = $1", [idCarla])

      const { rows: vinculos } = await db.query(
        "select count(*)::int as n from public.follows where $1 in (follower_id, followee_id)",
        [idCarla],
      )
      const { rows: perfil } = await db.query("select count(*)::int as n from public.profiles where id = $1", [idCarla])
      expect(vinculos[0].n, "on delete cascade de follows → profiles").toBe(0)
      expect(perfil[0].n, "on delete cascade de profiles → auth.users").toBe(0)
    } finally {
      await db.query("rollback")
    }
  })
})

describe("revisão da S03 — pode_ver_rede e o teto de full_name", () => {
  it("visitante sem sessão não chama pode_ver_rede por RPC (@RNF02.4)", async () => {
    // Antes respondia true para perfil público e null para privado ou
    // inexistente: um oráculo de contas por UUID para quem nem lê profiles. O
    // revoke só de public não tirava o EXECUTE que os default privileges da base
    // dão a anon nominalmente. Os dois perfis, para provar que nenhuma das duas
    // respostas sobrou.
    for (const perfil of [idAna, idBruno]) {
      const { data, error } = await visitante.rpc("pode_ver_rede", { perfil })
      expect(error?.code, "anon não pode ter EXECUTE em pode_ver_rede").toBe(VIOLA_RLS_OU_GRANT)
      expect(data).toBeNull()
    }
  })

  it("autenticado continua chamando pode_ver_rede — as policies de follows dependem dela (@RNF02.4)", async () => {
    // Contra correção exagerada: sem EXECUTE para authenticated, todo SELECT em
    // follows daria 42501.
    const { rows } = await db.query("select is_public from public.profiles where id = $1", [idAna])
    expect(rows[0]?.is_public, "pré-condição: a Ana do seed é pública").toBe(true)

    const { data, error } = await bruno.rpc("pode_ver_rede", { perfil: idAna })
    expect(error).toBeNull()
    expect(data).toBe(true)
  })

  it("o teto de 120 caracteres em full_name entra válido, não NOT VALID (@RF02.2)", async () => {
    // NOT VALID só pula as linhas existentes na criação; depois a constraint vale
    // em todo UPDATE da linha, e uma conta antiga com nome longo não mudaria mais
    // nem a bio. A migration corta os nomes antigos e cria a constraint válida.
    const { rows } = await db.query(
      `select convalidated from pg_constraint
        where conname = 'profiles_full_name_tamanho' and conrelid = 'public.profiles'::regclass`,
    )
    expect(rows).toEqual([{ convalidated: true }])
  })
})
