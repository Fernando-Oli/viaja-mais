import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"

/**
 * Isolamento do domínio Social: perfil público/privado e follows.
 *
 * Mesmo princípio de 01-isolamento: cada usuário loga de verdade pelo GoTrue com
 * a chave anon e fala com o PostgREST como o navegador. A RLS é a fronteira real.
 *
 * O que se prova aqui, do mais crítico para o menos:
 *   - o estado inicial do follow é imposto pelo servidor, não pelo cliente
 *     (perfil privado nunca nasce 'accepted', e created_at não é forjável);
 *   - ninguém forja o follower_id de outro (criar vínculo em nome alheio);
 *   - só o dono (followee) aprova — nem o solicitante nem um terceiro;
 *   - um terceiro não apaga vínculo alheio (escrita, não só leitura);
 *   - o grant de coluna impede repontar follower_id/followee_id via UPDATE;
 *   - solicitação pendente não vaza para terceiros, e visitante sem sessão
 *     não lê nada;
 *   - e, contra correção exagerada, o fluxo legítimo continua funcionando:
 *     seguir, aprovar, recusar, remover seguidor e deixar de seguir.
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

const ANA = { email: "teste.a@viajamais.local", senha: "viajamais123" }
const BRUNO = { email: "teste.b@viajamais.local", senha: "viajamais123" }
const CARLA = { email: "teste.c@viajamais.local", senha: "viajamais123" }

/** Códigos do Postgres que o PostgREST devolve em `error.code`. */
const VIOLA_RLS_OU_GRANT = "42501"
const VIOLA_UNICIDADE = "23505"
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

let ana: SupabaseClient
let bruno: SupabaseClient
let carla: SupabaseClient
let visitante: SupabaseClient
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
    await cliente.from("follows").delete().or(`follower_id.eq.${id},followee_id.eq.${id}`)
  }
}

/** Lê o vínculo como um dos lados, para conferir o estado sem depender de quem testou. */
async function vinculo(cliente: SupabaseClient, followerId: string, followeeId: string) {
  const { data } = await cliente
    .from("follows")
    .select("status, created_at")
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

  await limparVinculos()
})

afterAll(async () => {
  await limparVinculos()
})

describe("perfil — dados básicos visíveis, edição restrita", () => {
  it("Bruno vê os dados básicos do perfil público da Ana", async () => {
    const { data } = await bruno.from("profiles").select("id, username, is_public").eq("id", idAna)
    expect(data).toHaveLength(1)
    expect(data?.[0].username).toBe("ana")
  })

  it("Ana vê os dados básicos mesmo de um perfil privado (Bruno)", async () => {
    // A privacidade recai sobre as publicações, não sobre nome/username/bio
    // (detalhamento do RF02 na seção 14).
    const { data } = await ana.from("profiles").select("id, username, is_public").eq("id", idBruno)
    expect(data).toHaveLength(1)
    expect(data?.[0].is_public).toBe(false)
  })

  it("visitante sem sessão não lê perfil nenhum", async () => {
    const { data } = await visitante.from("profiles").select("id").in("id", [idAna, idBruno])
    expect(data ?? []).toEqual([])
  })

  it("Bruno não edita o perfil da Ana", async () => {
    const { data } = await bruno.from("profiles").update({ bio: "invadido" }).eq("id", idAna).select()
    expect(data).toEqual([])

    const { data: original } = await ana.from("profiles").select("bio").eq("id", idAna).single()
    expect(original?.bio).not.toBe("invadido")
  })

  it("username é único, sem distinção de maiúsculas (RF02.5)", async () => {
    const { error: igual } = await bruno.from("profiles").update({ username: "ana" }).eq("id", idBruno)
    expect(igual?.code, "username repetido deveria violar a unicidade").toBe(VIOLA_UNICIDADE)
  })

  it("username fora do formato é recusado (RF02.5)", async () => {
    for (const invalido of ["AB", "ab", "com espaco", "Ana", "a".repeat(31)]) {
      const { error } = await bruno.from("profiles").update({ username: invalido }).eq("id", idBruno)
      expect(error?.code, `"${invalido}" deveria violar o check de formato`).toBe(VIOLA_CHECK)
    }

    const { data } = await bruno.from("profiles").select("username").eq("id", idBruno).single()
    expect(data?.username).toBe("bruno")
  })

  it("bio acima de 280 caracteres é recusada (RF02.6)", async () => {
    const { error } = await bruno.from("profiles").update({ bio: "x".repeat(281) }).eq("id", idBruno)
    expect(error?.code).toBe(VIOLA_CHECK)
  })
})

describe("seguir perfil público (efeito imediato)", () => {
  afterAll(async () => {
    await bruno.from("follows").delete().eq("follower_id", idBruno).eq("followee_id", idAna)
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
  beforeAll(async () => {
    await ana.from("follows").delete().eq("follower_id", idAna).eq("followee_id", idBruno)
  })

  afterAll(async () => {
    await ana.from("follows").delete().eq("follower_id", idAna).eq("followee_id", idBruno)
  })

  it("nasce pendente mesmo forçando 'accepted' e created_at no futuro (RF09.2)", async () => {
    // O vetor da seção 25: o cliente tenta se auto-aceitar num perfil privado e,
    // de quebra, furar a ordenação por data.
    const { error } = await ana.from("follows").insert({
      follower_id: idAna,
      followee_id: idBruno,
      status: "accepted",
      created_at: "2099-01-01T00:00:00Z",
    })
    expect(error).toBeNull()

    const linha = await vinculo(ana, idAna, idBruno)
    expect(linha?.status, "o trigger tem de sobrepor para 'pending'").toBe("pending")
    // Compara com o relógio, não com o ano: 2099-01-01T00:00Z ainda é 2098 no
    // fuso de Brasília, e `getFullYear()` deixaria a data forjada passar.
    const umMinutoAFrente = Date.now() + 60_000
    expect(Date.parse(linha!.created_at), "o trigger tem de sobrepor created_at").toBeLessThan(umMinutoAFrente)
  })

  it("o solicitante (Ana) não se auto-aprova", async () => {
    const { data } = await ana
      .from("follows")
      .update({ status: "accepted" })
      .eq("follower_id", idAna)
      .eq("followee_id", idBruno)
      .select()
    expect(data, "só o followee aprova — a policy de UPDATE exige uid = followee").toEqual([])
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

  it("o dono (Bruno) vê a solicitação pendente e a aprova (RF09.3, RF09.4)", async () => {
    expect((await vinculo(bruno, idAna, idBruno))?.status).toBe("pending")

    const { data: aprovado } = await bruno
      .from("follows")
      .update({ status: "accepted" })
      .eq("follower_id", idAna)
      .eq("followee_id", idBruno)
      .select()
    expect(aprovado).toHaveLength(1)
    expect(aprovado?.[0].status).toBe("accepted")
  })

  it("uma terceira (Carla) não desfaz um vínculo aceito alheio, que ela enxerga", async () => {
    // O caso que importa para o DELETE: a pendente é invisível para a Carla, e o
    // Postgres não deixa apagar o que a policy de SELECT esconde. A aceita é
    // lista pública (RF09.6) — só a policy de DELETE a protege.
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

  it("o dono não reponta follower_id via UPDATE (grant de coluna)", async () => {
    // Bruno é o followee e passa na RLS de UPDATE; ainda assim não pode escrever
    // follower_id, porque o grant só concede status.
    const { error } = await bruno
      .from("follows")
      .update({ follower_id: idCarla })
      .eq("follower_id", idAna)
      .eq("followee_id", idBruno)
    expect(error?.code, "escrever follower_id deveria ser negado pelo grant de coluna").toBe(VIOLA_RLS_OU_GRANT)

    expect((await vinculo(bruno, idAna, idBruno))?.status).toBe("accepted")
  })
})

describe("recusar e remover seguidor — o dono desfaz o vínculo", () => {
  afterAll(async () => {
    await carla.from("follows").delete().eq("follower_id", idCarla).eq("followee_id", idBruno)
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
    const { error } = await visitante.from("follows").insert({ follower_id: idAna, followee_id: idCarla })
    expect(error?.code).toBe(VIOLA_RLS_OU_GRANT)

    const { data } = await visitante.from("follows").select("*")
    expect(data ?? []).toEqual([])
  })
})

describe("listas públicas e não sobre-correção", () => {
  it("um vínculo aceito é visível para quem não é parte (RF09.6)", async () => {
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
