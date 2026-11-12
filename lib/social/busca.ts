/**
 * Regras puras da busca de pessoas, o painel da aba Rede social.
 *
 * Sem I/O e sem zod: a tela usa os mesmos limites e a mesma normalização para
 * decidir quando buscar, sem levar o zod ao bundle do navegador. Quem valida de
 * verdade é o `buscaPessoasSchema` (lib/schemas/busca.ts), na rota.
 *
 * @RF09.10 buscar pessoas
 */

export const BUSCA_MIN = 2
export const BUSCA_MAX = 60
/** No máximo 20 pessoas por busca. */
export const BUSCA_LIMITE = 20

/**
 * O que a busca aceita: letras (com acento), números, espaço e ' ’ . _ -.
 *
 * Lista do que entra, e não do que sai, porque o termo vira o valor de um
 * `ilike`: `%` e `_` são curingas do LIKE, e o PostgREST ainda troca `*` por `%`.
 * Nenhum deles aparece em nome de pessoa, então são recusados, e não escapados.
 * O `_` é a exceção: existe em username, por isso é aceito e escapado em
 * `padraoContem`.
 */
export const TERMO_PERMITIDO = /^[\p{L}\p{M}\p{N} '’._-]+$/u

/**
 * Como a pessoa digitou → como se busca: NFC (um "é" digitado como "e" + acento
 * vira o mesmo "é" gravado no banco), espaços repetidos viram um, e o `@` do
 * começo sai, para "@ana" achar a ana.
 */
export function normalizarTermo(entrada: string): string {
  return entrada.normalize("NFC").replace(/\s+/g, " ").trim().replace(/^@/, "").trim()
}

/**
 * Padrão do `ilike` para "contém o termo". O `_` é procurado como `_`: sem o
 * escape, "n_" acharia todo nome com um "n" seguido de qualquer letra.
 */
export function padraoContem(termo: string): string {
  return `%${termo.replace(/_/g, "\\_")}%`
}

/**
 * Junta o que as consultas acharam (o username exato, os por nome e os por
 * username): a mesma pessoa aparece uma vez só. Quem tem exatamente o username
 * buscado vem primeiro, para "ana" achar a @ana mesmo entre muitas Anas; o resto
 * vai em ordem de nome (sem diferenciar maiúscula nem acento) e depois de
 * username, até o limite.
 */
export function juntarResultados<T extends { username: string; full_name: string | null }>(
  listas: T[][],
  termo: string = "",
  limite: number = BUSCA_LIMITE,
): T[] {
  const porUsername = new Map<string, T>()
  for (const lista of listas) {
    for (const pessoa of lista) {
      if (!porUsername.has(pessoa.username)) porUsername.set(pessoa.username, pessoa)
    }
  }
  const exato = termo.toLowerCase()
  const comparar = new Intl.Collator("pt-BR", { sensitivity: "base" }).compare
  return Array.from(porUsername.values())
    .sort(
      (a, b) =>
        Number(b.username.toLowerCase() === exato) - Number(a.username.toLowerCase() === exato) ||
        comparar(a.full_name ?? "", b.full_name ?? "") ||
        comparar(a.username, b.username),
    )
    .slice(0, limite)
}
