/**
 * Escopo de grupo nas consultas: o usuário enxerga o que pertence às viagens de
 * que **participa**, não apenas o que ele mesmo criou.
 *
 * A regra do produto é essa desde o começo — viagem em grupo —, mas as telas
 * filtravam por `user_id`, o que escondia do convidado tudo que o grupo tinha
 * lançado. Este módulo existe para a regra ficar escrita num lugar só.
 *
 * O detalhe que justifica o módulo é o `!inner`. Sem ele o PostgREST trata o
 * embed como LEFT JOIN e **ignora o filtro da relação aninhada**: a consulta não
 * falha, apenas devolve tudo o que a RLS permitir. É uma regra de visibilidade
 * que some em silêncio — daí o construtor recusar as formas que não filtram, em
 * vez de confiar em quem escreve a string.
 *
 * As funções são genéricas sobre as colunas de propósito. O supabase-js deduz o
 * formato do resultado a partir do **tipo literal** do `select`; se elas
 * devolvessem `string`, todo campo viraria `GenericStringError` e a tela
 * perderia a tipagem inteira. Por isso o tipo de retorno é o template literal
 * exato, e nada é reescrito em tempo de execução: o que o tipo promete é o que
 * a função devolve.
 *
 * A RLS continua valendo por baixo, como segunda linha. O escopo aqui é a
 * primeira, explícita no servidor, como manda a regra 2 do `CLAUDE.md`.
 *
 * @RF04.4 os membros visualizam a viagem e seus dados
 */

/** Coluna a filtrar quando a consulta é sobre `trips`. */
export const FILTRO_EM_VIAGENS = "trip_members.user_id"

/** Coluna a filtrar quando a consulta é sobre uma tabela filha de `trips`. */
export const FILTRO_POR_VIAGEM = "trips.trip_members.user_id"

function validar(colunas: string, rotulo: string): void {
  if (!colunas.trim()) throw new Error(`${rotulo}: lista de colunas vazia`)

  // Quem embute `trips` à mão acaba com dois embeds da mesma relação, e o
  // PostgREST resolve o filtro contra o errado.
  if (/\btrips\s*[!(]/.test(colunas)) {
    throw new Error(
      `${rotulo}: não embuta "trips" nas colunas — é isso que esta função faz. ` +
        `Passe as colunas da viagem no primeiro argumento.`,
    )
  }
}

/**
 * `select` de uma consulta **sobre `trips`**, restrita às viagens do usuário.
 *
 * Usar com `.eq(FILTRO_EM_VIAGENS, user.id)`.
 *
 *     supabase.from("trips")
 *       .select(selecaoDeViagens())
 *       .eq(FILTRO_EM_VIAGENS, user.id)
 */
export function selecaoDeViagens<C extends string = "*", M extends string = "user_id">(
  colunas: C = "*" as C,
  colunasDoMembro: M = "user_id" as M,
): `${C}, trip_members!inner(${M})` {
  validar(colunas, "selecaoDeViagens")
  validar(colunasDoMembro, "selecaoDeViagens (colunas do membro)")

  // `user_id` é a coluna que o filtro compara: sem ela no embed, o PostgREST
  // devolve erro só em tempo de execução.
  if (!/\buser_id\b/.test(colunasDoMembro)) {
    throw new Error(`selecaoDeViagens: as colunas do membro precisam incluir "user_id" — é o que ${FILTRO_EM_VIAGENS} compara.`)
  }

  return `${colunas}, trip_members!inner(${colunasDoMembro})`
}

/**
 * `select` de uma consulta **sobre tabela filha de `trips`** — `expenses`,
 * `bookings`, `places`, `itinerary_items` —, restrita às viagens do usuário.
 *
 * Usar com `.eq(FILTRO_POR_VIAGEM, user.id)`.
 *
 *     supabase.from("expenses")
 *       .select(selecaoPorViagem("title, currency"))
 *       .eq(FILTRO_POR_VIAGEM, user.id)
 */
export function selecaoPorViagem<V extends string, C extends string = "*">(
  colunasDaViagem: V,
  colunas: C = "*" as C,
): `${C}, trips!inner(${V}, trip_members!inner(user_id))` {
  validar(colunas, "selecaoPorViagem")
  validar(colunasDaViagem, "selecaoPorViagem (colunas da viagem)")

  return `${colunas}, trips!inner(${colunasDaViagem}, trip_members!inner(user_id))`
}
