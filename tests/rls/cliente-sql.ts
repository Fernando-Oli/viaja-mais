/* eslint-disable @typescript-eslint/no-explicit-any -- o resultado imita o do supabase-js, que não é tipado por tabela. */
import pg from "pg"

/**
 * Cliente de teste que fala SQL direto com o Postgres, com a mesma forma do
 * `supabase-js` que estes testes usavam (`from().select().eq()`, `rpc()`).
 *
 * Existe porque o PostgREST saiu com o Supabase, e o que estes testes provam
 * continua valendo: com o papel e a identidade de um usuário, a RLS deixa ou não
 * deixa. Cada chamada roda numa transação própria, com `role` e
 * `request.jwt.claims` locais a ela, do mesmo jeito que `comoUsuario()` da API
 * (`api/db/como-usuario.ts`) e o PostgREST faziam. Nada de sessão sobra entre
 * uma chamada e outra.
 *
 * Só cobre o que os testes usam. Coluna e tabela entram no SQL como texto: é
 * código de teste, com nomes escritos no próprio arquivo, e `identificador()`
 * recusa qualquer coisa fora de `[a-z_]`.
 */

export type ErroSql = { code: string; message: string; details?: string; hint?: string }
export type Resultado = { data: any; error: ErroSql | null; count: number | null }

export type Identidade = { papel: "anon" } | { papel: "authenticated"; id: string; email: string }

let pool: pg.Pool | undefined
let conexao = ""

export function configurarConexao(url: string) {
  conexao = url
}

/**
 * Os valores chegam como o PostgREST os mandava em JSON: data e hora em texto
 * ISO (com os microssegundos, que um `Date` perderia), `numeric` e `bigint`
 * como número.
 */
const tipos = {
  getTypeParser(oid: number, formato?: string) {
    const { builtins } = pg.types
    if (oid === builtins.TIMESTAMPTZ || oid === builtins.TIMESTAMP) {
      return (v: string) => v.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00")
    }
    if (oid === builtins.DATE) return (v: string) => v
    if (oid === builtins.NUMERIC || oid === builtins.INT8) return (v: string) => Number(v)
    return pg.types.getTypeParser(oid, formato as "text")
  },
}

function obterPool(): pg.Pool {
  if (!conexao) throw new Error("cliente-sql: chame configurarConexao() antes")
  pool ??= new pg.Pool({ connectionString: conexao, max: 4, types: tipos, allowExitOnIdle: true })
  return pool
}

export async function encerrarConexoes() {
  await pool?.end()
  pool = undefined
}

function identificador(nome: string): string {
  const limpo = nome.trim()
  if (!/^[a-z_][a-z0-9_]*$/.test(limpo)) throw new Error(`cliente-sql: identificador inválido: ${nome}`)
  return `"${limpo}"`
}

function colunas(lista: string): string {
  if (lista.trim() === "*") return "*"
  return lista.split(",").map(identificador).join(", ")
}

/** Roda `fn` numa transação com o papel e as claims da identidade. */
async function comoIdentidade<T>(quem: Identidade, fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const cliente = await obterPool().connect()
  try {
    await cliente.query("begin")
    const claims =
      quem.papel === "anon" ? { role: "anon" } : { sub: quem.id, email: quem.email, role: "authenticated" }
    await cliente.query("select set_config('role', $1, true), set_config('request.jwt.claims', $2, true)", [
      quem.papel,
      JSON.stringify(claims),
    ])
    const resultado = await fn(cliente)
    await cliente.query("commit")
    return resultado
  } catch (erro) {
    await cliente.query("rollback").catch(() => {})
    throw erro
  } finally {
    cliente.release()
  }
}

function comoErro(erro: unknown): ErroSql {
  const e = erro as { code?: string; message?: string; detail?: string; hint?: string }
  return { code: e.code ?? "desconhecido", message: e.message ?? String(erro), details: e.detail, hint: e.hint }
}

type Filtro = (p: Parametros) => string

class Parametros {
  valores: unknown[] = []
  add(v: unknown): string {
    // Objeto vira jsonb; array fica array do Postgres (o driver converte).
    this.valores.push(v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) ? JSON.stringify(v) : v)
    return `$${this.valores.length}`
  }
}

const OPERADORES: Record<string, string> = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" }

function filtroSimples(coluna: string, op: string, valor: unknown): Filtro {
  const col = identificador(coluna)
  if (op === "is") {
    if (valor !== null && valor !== true && valor !== false) throw new Error("cliente-sql: is() aceita null/true/false")
    return () => `${col} is ${valor === null ? "null" : String(valor)}`
  }
  if (op === "in") return (p) => `${col} = any(${p.add(valor)})`
  const sqlOp = OPERADORES[op]
  if (!sqlOp) throw new Error(`cliente-sql: operador não suportado: ${op}`)
  return (p) => `${col} ${sqlOp} ${p.add(valor)}`
}

type Operacao = "select" | "insert" | "update" | "delete" | "upsert"

class Consulta implements PromiseLike<Resultado> {
  private operacao: Operacao = "select"
  private colunasRetorno: string | null = null
  private valores: Record<string, unknown>[] = []
  private filtros: Filtro[] = []
  private ordem: string[] = []
  private limite: number | null = null
  private modo: "lista" | "single" | "maybeSingle" = "lista"
  private contar = false
  private soContagem = false
  private conflito: { colunas?: string; ignorar?: boolean } = {}

  constructor(
    private readonly quem: Identidade,
    private readonly tabela: string,
  ) {}

  select(lista = "*", opcoes: { count?: "exact"; head?: boolean } = {}) {
    this.colunasRetorno = lista
    this.contar = opcoes.count === "exact"
    this.soContagem = opcoes.head === true
    return this
  }

  insert(valores: Record<string, unknown> | Record<string, unknown>[]) {
    this.operacao = "insert"
    this.valores = Array.isArray(valores) ? valores : [valores]
    this.colunasRetorno = null
    return this
  }

  upsert(
    valores: Record<string, unknown> | Record<string, unknown>[],
    opcoes: { onConflict?: string; ignoreDuplicates?: boolean } = {},
  ) {
    this.insert(valores)
    this.operacao = "upsert"
    this.conflito = { colunas: opcoes.onConflict, ignorar: opcoes.ignoreDuplicates }
    return this
  }

  update(valores: Record<string, unknown>) {
    this.operacao = "update"
    this.valores = [valores]
    this.colunasRetorno = null
    return this
  }

  delete(opcoes: { count?: "exact" } = {}) {
    this.operacao = "delete"
    this.colunasRetorno = null
    this.contar = opcoes.count === "exact"
    return this
  }

  eq(c: string, v: unknown) {
    this.filtros.push(filtroSimples(c, "eq", v))
    return this
  }
  neq(c: string, v: unknown) {
    this.filtros.push(filtroSimples(c, "neq", v))
    return this
  }
  gt(c: string, v: unknown) {
    this.filtros.push(filtroSimples(c, "gt", v))
    return this
  }
  lt(c: string, v: unknown) {
    this.filtros.push(filtroSimples(c, "lt", v))
    return this
  }
  in(c: string, v: unknown[]) {
    this.filtros.push(filtroSimples(c, "in", v))
    return this
  }
  is(c: string, v: null | boolean) {
    this.filtros.push(filtroSimples(c, "is", v))
    return this
  }
  match(objeto: Record<string, unknown>) {
    for (const [c, v] of Object.entries(objeto)) this.eq(c, v)
    return this
  }
  /** `or("a.eq.1,b.eq.2")`, só com operadores simples, como os testes usam. */
  or(expressao: string) {
    const partes = expressao.split(",").map((parte) => {
      const [coluna, op, ...resto] = parte.split(".")
      return filtroSimples(coluna, op, resto.join("."))
    })
    this.filtros.push((p) => `(${partes.map((f) => f(p)).join(" or ")})`)
    return this
  }
  order(coluna: string, opcoes: { ascending?: boolean } = {}) {
    this.ordem.push(`${identificador(coluna)} ${opcoes.ascending === false ? "desc" : "asc"}`)
    return this
  }
  limit(n: number) {
    this.limite = n
    return this
  }
  single() {
    this.modo = "single"
    return this
  }
  maybeSingle() {
    this.modo = "maybeSingle"
    return this
  }

  private montar(p: Parametros): string {
    const tabela = `public.${identificador(this.tabela)}`
    const onde = this.filtros.length ? ` where ${this.filtros.map((f) => f(p)).join(" and ")}` : ""
    const retorno = this.colunasRetorno !== null ? ` returning ${colunas(this.colunasRetorno || "*")}` : ""

    if (this.operacao === "select") {
      const lista = this.soContagem ? "1" : colunas(this.colunasRetorno ?? "*")
      const ordem = this.ordem.length ? ` order by ${this.ordem.join(", ")}` : ""
      const limite = this.limite !== null ? ` limit ${Math.trunc(this.limite)}` : ""
      return `select ${lista} from ${tabela}${onde}${ordem}${limite}`
    }
    if (this.operacao === "update") {
      const sets = Object.entries(this.valores[0]).map(([c, v]) => `${identificador(c)} = ${p.add(v)}`)
      return `update ${tabela} set ${sets.join(", ")}${onde}${retorno}`
    }
    if (this.operacao === "delete") return `delete from ${tabela}${onde}${retorno}`

    // insert / upsert: as colunas são a união das chaves, como no PostgREST.
    const nomes = [...new Set(this.valores.flatMap((v) => Object.keys(v)))]
    const linhas = this.valores.map(
      (v) => `(${nomes.map((n) => (n in v ? p.add(v[n]) : "default")).join(", ")})`,
    )
    let sql = `insert into ${tabela} (${nomes.map(identificador).join(", ")}) values ${linhas.join(", ")}`
    if (this.operacao === "upsert") {
      const alvo = this.conflito.colunas ? `(${colunas(this.conflito.colunas)})` : "on constraint " + "__pk__"
      const acao = this.conflito.ignorar
        ? "do nothing"
        : `do update set ${nomes.map((n) => `${identificador(n)} = excluded.${identificador(n)}`).join(", ")}`
      sql += ` on conflict ${alvo} ${acao}`
    }
    return sql + retorno
  }

  private async executar(): Promise<Resultado> {
    try {
      return await comoIdentidade(this.quem, async (c) => {
        const p = new Parametros()
        let sql = this.montar(p)
        if (sql.includes("on constraint __pk__")) {
          const { rows } = await c.query(
            `select conname from pg_constraint where conrelid = $1::regclass and contype = 'p'`,
            [`public.${this.tabela}`],
          )
          sql = sql.replace("__pk__", identificador(rows[0].conname))
        }
        const { rows, rowCount } = await c.query(sql, p.valores)
        const count = this.contar ? (this.operacao === "select" ? rows.length : (rowCount ?? 0)) : null

        if (this.operacao === "select" && this.soContagem) return { data: null, error: null, count }
        const devolve = this.operacao === "select" || this.colunasRetorno !== null
        if (!devolve) return { data: null, error: null, count }

        if (this.modo === "lista") return { data: rows, error: null, count }
        if (rows.length === 1) return { data: rows[0], error: null, count }
        if (rows.length === 0 && this.modo === "maybeSingle") return { data: null, error: null, count }
        return {
          data: null,
          count: null,
          error: {
            code: "PGRST116",
            message: "JSON object requested, multiple (or no) rows returned",
            details: `The result contains ${rows.length} rows`,
          },
        }
      })
    } catch (erro) {
      return { data: null, error: comoErro(erro), count: null }
    }
  }

  then<A = Resultado, B = never>(
    sucesso?: ((valor: Resultado) => A | PromiseLike<A>) | null,
    falha?: ((motivo: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.executar().then(sucesso, falha)
  }
}

export class ClienteSql {
  constructor(readonly quem: Identidade) {}

  from(tabela: string) {
    return new Consulta(this.quem, tabela)
  }

  /**
   * Função do schema public com argumentos nomeados, como o PostgREST chamava.
   * Função que devolve conjunto vira lista; as outras, o valor.
   */
  rpc(funcao: string, argumentos: Record<string, unknown> = {}) {
    return new ChamadaRpc(this.quem, funcao, argumentos)
  }
}

/** `rpc()` encadeável com `.single()`, como no supabase-js. */
class ChamadaRpc implements PromiseLike<Resultado> {
  private umaLinha = false

  constructor(
    private readonly quem: Identidade,
    private readonly funcao: string,
    private readonly argumentos: Record<string, unknown>,
  ) {}

  single() {
    this.umaLinha = true
    return this
  }

  then<A = Resultado, B = never>(
    sucesso?: ((valor: Resultado) => A | PromiseLike<A>) | null,
    falha?: ((motivo: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return this.executar().then((r) => {
      if (!this.umaLinha || r.error || !Array.isArray(r.data)) return r
      if (r.data.length === 1) return { ...r, data: r.data[0] }
      return { data: null, count: null, error: { code: "PGRST116", message: `${r.data.length} linhas, esperada 1` } }
    }).then(sucesso, falha)
  }

  private async executar(): Promise<Resultado> {
    const { funcao, argumentos } = this
    try {
      return await comoIdentidade(this.quem, async (c) => {
        const p = new Parametros()
        const args = Object.entries(argumentos).map(([n, v]) => `${identificador(n)} => ${p.add(v)}`).join(", ")
        const nome = `public.${identificador(funcao)}`
        const { rows: info } = await c.query(
          `select bool_or(proretset) as conjunto from pg_proc where oid::regproc::text in ($1, $2)`,
          [funcao, `public.${funcao}`],
        )
        if (info[0]?.conjunto) {
          const { rows } = await c.query(`select * from ${nome}(${args})`, p.valores)
          return { data: rows, error: null, count: null }
        }
        const { rows } = await c.query(`select ${nome}(${args}) as valor`, p.valores)
        return { data: rows[0]?.valor ?? null, error: null, count: null }
      })
    } catch (erro) {
      return { data: null, error: comoErro(erro), count: null }
    }
  }
}
