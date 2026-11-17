import { sql } from "kysely"
import type { Tx } from "../../db/como-usuario"
import type { AtualizarPerfil } from "../../../lib/schemas/perfil"
import { BUSCA_LIMITE, padraoContem } from "../../../lib/social/busca"

/**
 * Acesso às tabelas do domínio Social (`profiles`, `follows`, `search_history`),
 * sempre com a sessão de quem pede (`comoUsuario`): a RLS de cada tabela é a
 * segunda linha, como era pelo PostgREST. Portado de `lib/social/{perfil-visto,
 * rede,solicitacoes,pesquisas}.ts`, que falavam com o Supabase.
 *
 * Nenhuma resposta leva o `id` de outra pessoa como campo: as funções devolvem
 * o id só para a rota seguir consultando.
 */

// ── Perfis ─────────────────────────────────────────────────────────────────

const COLUNAS_PERFIL = ["id", "username", "full_name", "avatar_url", "bio", "is_public"] as const

/** O perfil dono do username (já normalizado pelo schema), ou `undefined`. @RF02.8 */
export function perfilPorUsername(tx: Tx, username: string) {
  return tx.selectFrom("profiles").select(COLUNAS_PERFIL).where("username", "=", username).executeTakeFirst()
}

export type PerfilAlvo = NonNullable<Awaited<ReturnType<typeof perfilPorUsername>>>

/** O próprio perfil, para o formulário de edição. @RF02.1 */
export function proprioPerfil(tx: Tx, userId: string) {
  return tx.selectFrom("profiles").select(COLUNAS_PERFIL).where("id", "=", userId).executeTakeFirst()
}

/**
 * Campo a campo; ausente não muda. A foto não é editada aqui: só a rota de
 * foto altera `avatar_url`. @RF02.2 @RF02.5 @RF02.6 @RF02.7
 */
export function atualizarPerfil(tx: Tx, userId: string, campos: AtualizarPerfil) {
  const { full_name, username, bio, is_public } = campos
  return tx
    .updateTable("profiles")
    .set({ full_name, username, bio, is_public })
    .where("id", "=", userId)
    .returning(COLUNAS_PERFIL)
    .executeTakeFirst()
}

/**
 * Se a pessoa já escolheu um username. Sem ele, ela não segue ninguém: a rota
 * recusa antes, e a policy `follows_insert` recusa no banco. @RF09.9
 */
export async function temUsername(tx: Tx, userId: string): Promise<boolean> {
  const linha = await tx.selectFrom("profiles").select("username").where("id", "=", userId).executeTakeFirst()
  return linha?.username != null
}

/**
 * Busca por nome ou username. Três consultas: o username exato (a @ana aparece
 * mesmo entre muitas Anas), e as que contêm o termo no nome e no username, já
 * ordenadas por nome antes do limite. O termo vai como parâmetro do `ilike`, e
 * o `_` é escapado por `padraoContem`. Ficam de fora quem busca e as contas sem
 * username. @RF09.10
 */
export async function buscarPessoas(tx: Tx, quemBusca: string, termo: string) {
  const outras = () =>
    tx
      .selectFrom("profiles")
      .select(["id", "username", "full_name", "avatar_url", "is_public"])
      .where("id", "!=", quemBusca)
      .where("username", "is not", null)
  const padrao = padraoContem(termo)
  const porNome = sql`full_name asc nulls first`

  const listas = [
    await outras().where("username", "=", termo).limit(1).execute(),
    await outras().where("full_name", "ilike", padrao).orderBy(porNome).limit(BUSCA_LIMITE).execute(),
    await outras().where("username", "ilike", padrao).orderBy(porNome).limit(BUSCA_LIMITE).execute(),
  ]
  // O filtro `is not null` garante o username; o tipo da coluna não sabe disso.
  return listas.map((l) => l.map((p) => ({ ...p, username: p.username as string })))
}

// ── Vínculo e contadores ───────────────────────────────────────────────────

export type Vinculo = "proprio" | "nenhum" | "solicitado" | "seguindo"

/** O vínculo de quem vê com o perfil, pela linha em que quem vê é o seguidor. @RF09.1 @RF09.2 */
export async function vinculoCom(tx: Tx, quemVe: string, alvo: string): Promise<Vinculo> {
  if (quemVe === alvo) return "proprio"
  const linha = await tx
    .selectFrom("follows")
    .select("status")
    .where("follower_id", "=", quemVe)
    .where("followee_id", "=", alvo)
    .executeTakeFirst()
  if (!linha) return "nenhum"
  return linha.status === "accepted" ? "seguindo" : "solicitado"
}

/**
 * Seguidores e seguidos aceitos, pela função `contar_rede`: pela RLS, um
 * visitante não vê o vínculo entre dois perfis privados, e contar as linhas
 * daria errado. A contagem roda num savepoint: se falhar, os números vêm nulos
 * e o perfil continua — um contador não derruba a página. @RF02.8
 */
export async function contarRede(tx: Tx, perfil: string): Promise<{ seguidores: number | null; seguindo: number | null }> {
  try {
    await sql`savepoint contar_rede`.execute(tx)
    const { rows } = await sql<{ seguidores: string; seguindo: string }>`
      select * from public.contar_rede(${perfil})
    `.execute(tx)
    await sql`release savepoint contar_rede`.execute(tx)
    const [linha] = rows
    return { seguidores: Number(linha.seguidores), seguindo: Number(linha.seguindo) }
  } catch (erro) {
    await sql`rollback to savepoint contar_rede`.execute(tx).catch(() => undefined)
    console.error("[perfil visto] não foi possível contar a rede", erro)
    return { seguidores: null, seguindo: null }
  }
}

/** Se a sessão pode ver a rede do perfil: a mesma regra da RLS, pela função do banco. @RF09.6 */
export async function podeVerRede(tx: Tx, perfil: string): Promise<boolean> {
  const { rows } = await sql<{ pode: boolean }>`select public.pode_ver_rede(${perfil}) as pode`.execute(tx)
  return rows[0]?.pode === true
}

/**
 * Segue. Só os dois campos que o grant de INSERT aceita: o status (aceito para
 * perfil público, pendente para privado) é do gatilho `follows_estado_inicial`.
 * Seguir de novo não duplica nem muda o vínculo que já existe. @RF09.1 @RF09.2
 */
export async function seguir(tx: Tx, quem: string, alvo: string) {
  await tx
    .insertInto("follows")
    .values({ follower_id: quem, followee_id: alvo })
    .onConflict((oc) => oc.columns(["follower_id", "followee_id"]).doNothing())
    .execute()
}

/** Deixa de seguir ou cancela a solicitação pendente. Apagar o que não existe também é sucesso. @RF09.5 */
export async function deixarDeSeguir(tx: Tx, quem: string, alvo: string) {
  await tx.deleteFrom("follows").where("follower_id", "=", quem).where("followee_id", "=", alvo).execute()
}

// ── Listas da rede ─────────────────────────────────────────────────────────

/** Quantas pessoas cada página traz. */
export const POR_PAGINA = 20

export type Lado = "seguidores" | "seguindo"

/**
 * Uma página de quem segue o perfil (ou de quem ele segue), do vínculo mais
 * recente para o mais antigo e, no empate, por username. O cursor é o username
 * da última pessoa mostrada. Devolve `null` quando o cursor não acha mais o
 * vínculo (a pessoa saiu da lista ou trocou de username): a tela recomeça.
 *
 * Conta sem username (anterior ao social) não tem página e não aparece.
 *
 * @RF09.6 listas de seguidores e de seguindo
 */
export async function listarRede(tx: Tx, dono: string, lado: Lado, cursor?: string) {
  // Seguidores de X: X é o followee, e a outra pessoa é o follower. Seguindo: o contrário.
  const [colunaDono, colunaOutro] =
    lado === "seguidores" ? (["followee_id", "follower_id"] as const) : (["follower_id", "followee_id"] as const)

  const base = () =>
    tx
      .selectFrom("follows as f")
      .innerJoin("profiles as p", "p.id", `f.${colunaOutro}`)
      .where(`f.${colunaDono}`, "=", dono)
      .where("f.status", "=", "accepted")
      .where("p.username", "is not", null)

  let consulta = base()
    .select(["p.id", "p.username", "p.full_name", "p.avatar_url", "p.is_public"])
    .orderBy("f.created_at", "desc")
    .orderBy("p.username", "asc")
    .limit(POR_PAGINA + 1)

  if (cursor) {
    // A data do cursor vai e volta como texto: um `Date` do JavaScript guarda
    // milissegundos, o Postgres guarda microssegundos, e o empate nunca casaria.
    const ancora = await base()
      .select(sql<string>`f.created_at::text`.as("momento"))
      .where("p.username", "=", cursor)
      .executeTakeFirst()
    if (!ancora) return null
    const momento = sql<Date>`${ancora.momento}::timestamptz`
    // Depois do cursor, na mesma ordem: mais antigos, ou empatados com username depois do dele.
    consulta = consulta.where((eb) =>
      eb.or([
        eb("f.created_at", "<", momento),
        eb.and([eb("f.created_at", "=", momento), eb("p.username", ">", cursor)]),
      ]),
    )
  }

  const linhas = await consulta.execute()
  const pagina = linhas.slice(0, POR_PAGINA).map((p) => ({ ...p, username: p.username as string }))
  return { pagina, proximo: linhas.length > POR_PAGINA ? pagina[pagina.length - 1].username : null }
}

/**
 * Remove um seguidor do próprio perfil, em silêncio: só o vínculo aceito. Uma
 * solicitação pendente se recusa pelas Notificações. Devolve se havia o vínculo.
 *
 * @RF09.9 remover seguidor
 */
export async function removerSeguidor(tx: Tx, dono: string, seguidor: string): Promise<boolean> {
  const r = await tx
    .deleteFrom("follows")
    .where("followee_id", "=", dono)
    .where("follower_id", "=", seguidor)
    .where("status", "=", "accepted")
    .executeTakeFirst()
  return r.numDeletedRows > BigInt(0)
}

// ── Solicitações ───────────────────────────────────────────────────────────

/** Quantas a lista traz de uma vez; o total vem do banco. */
export const LIMITE_SOLICITACOES = 50

const pendentesPara = (tx: Tx, dono: string) =>
  tx
    .selectFrom("follows as f")
    .innerJoin("profiles as p", "p.id", "f.follower_id")
    .where("f.followee_id", "=", dono)
    .where("f.status", "=", "pending")
    .where("p.username", "is not", null)

/**
 * As solicitações para seguir que o dono recebeu, da mais recente para a mais
 * antiga, e o total. Conta sem username não aparece nem conta.
 *
 * @RF09.3 ver solicitações pendentes · @RF13.2 Zona 1 da central
 */
export async function listarSolicitacoes(tx: Tx, dono: string) {
  const linhas = await pendentesPara(tx, dono)
    .select(["p.id", "p.username", "p.full_name", "p.avatar_url", "p.is_public"])
    .orderBy("f.created_at", "desc")
    .limit(LIMITE_SOLICITACOES)
    .execute()
  const total = linhas.length < LIMITE_SOLICITACOES ? linhas.length : await contarSolicitacoes(tx, dono)
  return { perfis: linhas.map((p) => ({ ...p, username: p.username as string })), total }
}

/** Só o total, para a bolinha do sino. */
export async function contarSolicitacoes(tx: Tx, dono: string): Promise<number> {
  const { n } = await pendentesPara(tx, dono).select((eb) => eb.fn.countAll<string>().as("n")).executeTakeFirstOrThrow()
  return Number(n)
}

/**
 * Aprova (vira aceito) ou recusa (apaga, em silêncio) a solicitação pendente.
 * O filtro é pelo dono, e a RLS só deixa o followee atualizar. Devolve se havia
 * uma pendente. @RF09.4
 */
export async function resolverSolicitacao(tx: Tx, dono: string, quemPediu: string, acao: "aprovar" | "recusar") {
  const r =
    acao === "aprovar"
      ? await tx
          .updateTable("follows")
          .set({ status: "accepted" })
          .where("followee_id", "=", dono)
          .where("follower_id", "=", quemPediu)
          .where("status", "=", "pending")
          .executeTakeFirst()
          .then((x) => x.numUpdatedRows)
      : await tx
          .deleteFrom("follows")
          .where("followee_id", "=", dono)
          .where("follower_id", "=", quemPediu)
          .where("status", "=", "pending")
          .executeTakeFirst()
          .then((x) => x.numDeletedRows)
  return r > BigInt(0)
}

// ── Histórico de pesquisa ──────────────────────────────────────────────────

/** O mesmo teto do gatilho `search_history_podar`. */
export const LIMITE_RECENTES = 15
/** A mesma validade do gatilho e do job diário. */
export const DIAS_RECENTES = 30

/**
 * Os perfis que a pessoa abriu pela pesquisa, do mais recente para o mais
 * antigo, com menos de 30 dias. O vencido continua no banco até o job diário,
 * visível ao dono para ele poder apagar; quem o tira da tela é esta leitura.
 *
 * @RF09.12 histórico de pesquisa
 */
export async function listarRecentes(tx: Tx, dono: string) {
  const linhas = await tx
    .selectFrom("search_history as h")
    .innerJoin("profiles as p", "p.id", "h.profile_id")
    .select(["p.id", "p.username", "p.full_name", "p.avatar_url", "p.is_public"])
    .where("h.user_id", "=", dono)
    .where("h.searched_at", ">", sql<Date>`now() - make_interval(days => ${DIAS_RECENTES})`)
    .where("p.username", "is not", null)
    .orderBy("h.searched_at", "desc")
    .limit(LIMITE_RECENTES)
    .execute()
  return linhas.map((p) => ({ ...p, username: p.username as string }))
}

/**
 * Registra quem foi aberto. Reabrir leva ao topo: apaga a entrada antiga e
 * grava de novo, agora na mesma transação. Só os dois campos que o grant de
 * INSERT aceita; a data é do banco.
 */
export async function registrarPesquisa(tx: Tx, dono: string, perfil: string) {
  await apagarDoHistorico(tx, dono, perfil)
  await tx
    .insertInto("search_history")
    .values({ user_id: dono, profile_id: perfil })
    .onConflict((oc) => oc.columns(["user_id", "profile_id"]).doNothing())
    .execute()
}

/** O X de uma entrada. Apagar o que não está no histórico também é sucesso. */
export async function apagarDoHistorico(tx: Tx, dono: string, perfil: string) {
  await tx.deleteFrom("search_history").where("user_id", "=", dono).where("profile_id", "=", perfil).execute()
}

/** O "Limpar tudo". */
export async function limparHistorico(tx: Tx, dono: string) {
  await tx.deleteFrom("search_history").where("user_id", "=", dono).execute()
}

// ── Foto de perfil ─────────────────────────────────────────────────────────

/** O caminho da foto atual no bucket, ou nulo. @RF02.2 */
export async function avatarAtual(tx: Tx, userId: string) {
  const linha = await tx.selectFrom("profiles").select("avatar_url").where("id", "=", userId).executeTakeFirst()
  return linha ? linha.avatar_url : undefined
}

/**
 * Troca `avatar_url` só se ele ainda for o que foi lido antes do envio. Duas
 * abas enviando ao mesmo tempo, ou um envio e uma remoção, não podem as duas
 * apagar a mesma foto anterior e deixar a outra órfã: a segunda não acha a
 * linha e a rota responde 409. O gatilho de `profiles` confere o formato do
 * caminho. @RF02.2
 */
export function trocarAvatar(tx: Tx, userId: string, anterior: string | null, novo: string | null) {
  return tx
    .updateTable("profiles")
    .set({ avatar_url: novo })
    .where("id", "=", userId)
    .where((eb) => (anterior === null ? eb("avatar_url", "is", null) : eb("avatar_url", "=", anterior)))
    .returning(COLUNAS_PERFIL)
    .executeTakeFirst()
}
