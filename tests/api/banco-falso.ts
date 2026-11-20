import { randomUUID } from "node:crypto"
import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Um Supabase falso, em memória, para os testes das rotas e das libs de post
 * (S06, 18/11 noite): `posts`, `post_tags`, `post_tag_recusas`, `profiles` e o
 * bucket `capas-posts`.
 *
 * Por que um banco falso, e não dublês por função: as libs reais
 * (lib/social/post.ts, marcacoes.ts, posts.ts, capa.ts, aba-marcacoes.ts)
 * rodam inteiras atrás das rotas, e o que o teste confere é o efeito — o que
 * ficou nas tabelas e no Storage — e a resposta montada campo a campo a partir
 * de linhas que trazem de propósito o que nunca pode sair.
 *
 * Ele imita, do banco real, só o que as rotas dependem (o banco real é provado
 * em tests/rls/12-trip-posts.test.ts e 17-post-tags.test.ts, da instância A):
 *
 * - **SELECT de `posts`**: `pode_ver_rede(author_id)` — a autora, perfil
 *   público, ou quem a segue (`segue`). Embed de post invisível volta `null`.
 * - **grant por coluna**: `trip_id` de `posts` e `trip_id`/`post_id` de
 *   `post_tag_recusas` são ilegíveis (42501), e `*` também.
 * - **escrita em `posts`**: INSERT só em nome da sessão, com username e, com
 *   viagem, sendo membro; CHECK das fotos (1 a 3 sem viagem, no máximo 3, na
 *   pasta da autora, `.webp`); UPDATE e DELETE só da autora. DELETE leva as
 *   marcas e as recusas por post em cascata.
 * - **`post_tags`**: INSERT pela `social_pode_marcar` (autora, marcado com
 *   username, diferente dela, sem recusa); DELETE pela própria pessoa grava a
 *   recusa (por viagem ou por post), como o trigger.
 * - **funções**: `pode_ver_rede`, `social_meu_post_da_viagem`,
 *   `social_membros_marcaveis`, `social_recusas_da_viagem`,
 *   `social_recusas_do_post`, `consumir_limite`.
 *
 * O construtor de consultas aceita o que as libs usam: `select` (com embed de
 * um nível, `alias:tabela!fk(colunas)`), `insert`, `update`, `delete`, `eq`,
 * `neq`, `in`, `is`, `not(..., "is", null)`, `lt`, `gt`, `ilike`, `order`,
 * `limit`, `single`, `maybeSingle` e o `await` direto.
 */

export type Linha = Record<string, unknown>
export type ErroDoBanco = { code?: string; message?: string }
type Resultado = { data: unknown; error: ErroDoBanco | null }

const RELACOES: Record<string, { tabela: string; local: string; remota: string }> = {
  posts_author_id_fkey: { tabela: "profiles", local: "author_id", remota: "id" },
  post_tags_tagged_id_fkey: { tabela: "profiles", local: "tagged_id", remota: "id" },
  post_tags_author_id_fkey: { tabela: "profiles", local: "author_id", remota: "id" },
  post_tags_post_id_fkey: { tabela: "posts", local: "post_id", remota: "id" },
}

const ILEGIVEIS: Record<string, string[]> = {
  posts: ["trip_id"],
  post_tag_recusas: ["trip_id", "post_id"],
}

const SEM_PRIVILEGIO: ErroDoBanco = { code: "42501", message: "permission denied (detalhe cru do banco)" }
const CHECK: ErroDoBanco = { code: "23514", message: "violates check constraint posts_photos_check" }
const REPETIDA: ErroDoBanco = { code: "23505", message: "duplicate key post_tags_pkey" }

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

type Item = { nome: string } | { alias: string; tabela: string; fk: string; colunas: Item[] }

/** Separa a lista de colunas nas vírgulas de fora dos parênteses. */
function separar(texto: string): string[] {
  const partes: string[] = []
  let nivel = 0
  let atual = ""
  for (const c of texto) {
    if (c === "(") nivel++
    if (c === ")") nivel--
    if (c === "," && nivel === 0) {
      partes.push(atual.trim())
      atual = ""
    } else atual += c
  }
  if (atual.trim()) partes.push(atual.trim())
  return partes
}

function lerColunas(texto: string): Item[] {
  return separar(texto).map((parte) => {
    const embed = /^(?:(\w+):)?(\w+)!(\w+)\(([\s\S]*)\)$/.exec(parte)
    if (embed) return { alias: embed[1] ?? embed[2], tabela: embed[2], fk: embed[3], colunas: lerColunas(embed[4]) }
    return { nome: parte }
  })
}

function comoRegex(padrao: string): RegExp {
  let fonte = ""
  for (let i = 0; i < padrao.length; i++) {
    const c = padrao[i]
    if (c === "\\" && i + 1 < padrao.length) {
      fonte += padrao[++i].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    } else if (c === "%") fonte += "[\\s\\S]*"
    else if (c === "_") fonte += "[\\s\\S]"
    else fonte += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(`^${fonte}$`, "i")
}

/** O valor como o filtro `eq` do PostgREST o compara: array vira o literal `{a,b}`. */
const comparavel = (valor: unknown) => (Array.isArray(valor) ? `{${valor.join(",")}}` : valor)

export class BancoFalso {
  tabelas: Record<string, Linha[]> = {}
  sessao: string | null = null
  /** "seguidor->seguido", vínculos aceitos. */
  segue = new Set<string>()
  /** viagem → membros. */
  membros = new Map<string, string[]>()
  /** Erros forçados, consumidos na primeira consulta que casar. */
  falhas: { tabela: string; operacao: string; erro: ErroDoBanco }[] = []
  /** Toda consulta, em ordem. */
  consultas: { tabela: string; operacao: string; colunas?: string; valores?: unknown }[] = []
  rpcs: { nome: string; args: unknown }[] = []
  /** Simula a policy de SELECT de `posts` errada (deixa ver tudo): prova que a autorização explícita da rota decide. */
  selectDePostsSemPolicy = false
  /** Simula as policies de UPDATE/DELETE de `posts` erradas: prova o filtro `author_id` da lib. */
  escritaEmPostsSemPolicy = false
  /** Chamado antes de cada consulta: simula outra aba mexendo no banco no meio da rota. */
  antesDe: ((tabela: string, operacao: string) => void) | null = null
  /** O que `consumir_limite` responde. */
  limite: { permitido: boolean; retry_after: number } = { permitido: true, retry_after: 0 }
  private relogio = 0

  storage = {
    arquivos: new Map<string, Uint8Array>(),
    envios: [] as { bucket: string; caminho: string; bytes: Uint8Array; contentType?: string; upsert?: boolean }[],
    remocoes: [] as { bucket: string; caminhos: string[] }[],
    assinaturas: [] as { bucket: string; caminhos: string[]; validade: number }[],
    /** Índice (0, 1, 2...) do envio que falha; nulo = nenhum. */
    falharEnvioNo: null as number | null,
    falharRemocao: false,
  }

  reiniciar() {
    this.tabelas = { profiles: [], posts: [], post_tags: [], post_tag_recusas: [] }
    this.sessao = null
    this.segue.clear()
    this.membros.clear()
    this.falhas = []
    this.antesDe = null
    this.selectDePostsSemPolicy = false
    this.escritaEmPostsSemPolicy = false
    this.consultas = []
    this.rpcs = []
    this.limite = { permitido: true, retry_after: 0 }
    this.relogio = 0
    this.storage.arquivos.clear()
    this.storage.envios = []
    this.storage.remocoes = []
    this.storage.assinaturas = []
    this.storage.falharEnvioNo = null
    this.storage.falharRemocao = false
  }

  /** Um momento novo, crescente, no formato do PostgREST. */
  momento(): string {
    this.relogio++
    const segundos = String(this.relogio % 60).padStart(2, "0")
    const minutos = String(Math.floor(this.relogio / 60)).padStart(2, "0")
    return `2026-11-19T10:${minutos}:${segundos}.123456+00:00`
  }

  // --- regras --------------------------------------------------------------

  perfil(id: unknown): Linha | undefined {
    return this.tabelas.profiles.find((p) => p.id === id)
  }

  podeVerRede(autor: unknown): boolean {
    if (!this.sessao) return false
    if (autor === this.sessao) return true
    if (this.perfil(autor)?.is_public === true) return true
    return this.segue.has(`${this.sessao}->${autor}`)
  }

  private visivel(tabela: string, linha: Linha): boolean {
    if (tabela === "posts") return this.selectDePostsSemPolicy || this.podeVerRede(linha.author_id)
    if (tabela === "post_tags") {
      if (linha.tagged_id === this.sessao || linha.author_id === this.sessao) return true
      const post = this.tabelas.posts.find((p) => p.id === linha.post_id)
      return !!post && this.podeVerRede(post.author_id)
    }
    if (tabela === "post_tag_recusas") return linha.tagged_id === this.sessao
    return true
  }

  private recusado(post: Linha, marcado: unknown): boolean {
    return this.tabelas.post_tag_recusas.some(
      (r) =>
        r.tagged_id === marcado &&
        ((post.trip_id != null && r.trip_id === post.trip_id && r.author_id === post.author_id) || r.post_id === post.id),
    )
  }

  podeMarcar(postId: unknown, marcado: unknown): boolean {
    const post = this.tabelas.posts.find((p) => p.id === postId)
    if (!post || post.author_id !== this.sessao || marcado === post.author_id) return false
    if (!this.perfil(marcado)?.username) return false
    if (post.trip_id != null && !(this.membros.get(String(post.trip_id)) ?? []).includes(String(this.sessao))) return false
    return !this.recusado(post, marcado)
  }

  private fotosValidas(linha: Linha): boolean {
    const fotos = linha.photos as unknown
    if (!Array.isArray(fotos) || fotos.length > 3) return false
    if (linha.trip_id == null && fotos.length < 1) return false
    // Espelha posts_photos_check: só WebP desde o achado A5 (o avatar segue com jpg/png).
    const formato = new RegExp(`^${linha.author_id}/${UUID}\\.webp$`)
    return fotos.every((f) => typeof f === "string" && formato.test(f))
  }

  // --- execução ------------------------------------------------------------

  private falhaPara(tabela: string, operacao: string): ErroDoBanco | null {
    const i = this.falhas.findIndex((f) => f.tabela === tabela && f.operacao === operacao)
    if (i < 0) return null
    return this.falhas.splice(i, 1)[0].erro
  }

  private projetar(tabela: string, linha: Linha, itens: Item[]): Linha | ErroDoBanco {
    const saida: Linha = {}
    for (const item of itens) {
      if ("nome" in item) {
        if (item.nome === "*" || (ILEGIVEIS[tabela] ?? []).includes(item.nome)) return SEM_PRIVILEGIO
        saida[item.nome] = linha[item.nome] ?? null
      } else {
        const relacao = RELACOES[item.fk]
        if (!relacao || relacao.tabela !== item.tabela) throw new Error(`embed desconhecido: ${item.tabela}!${item.fk}`)
        const alvo = this.tabelas[relacao.tabela].find(
          (l) => l[relacao.remota] === linha[relacao.local] && this.visivel(relacao.tabela, l),
        )
        if (!alvo) saida[item.alias] = null
        else {
          const sub = this.projetar(relacao.tabela, alvo, item.colunas)
          if ("code" in sub && sub === SEM_PRIVILEGIO) return SEM_PRIVILEGIO
          saida[item.alias] = sub
        }
      }
    }
    return saida
  }

  executar(c: Consulta): Resultado {
    this.antesDe?.(c.tabela, c.operacao)
    this.consultas.push({ tabela: c.tabela, operacao: c.operacao, colunas: c.colunas ?? c.retorno, valores: c.valores })
    const forcada = this.falhaPara(c.tabela, c.operacao)
    if (forcada) return { data: null, error: forcada }
    const tabela = this.tabelas[c.tabela]
    if (!tabela) throw new Error(`tabela desconhecida no banco falso: ${c.tabela}`)

    let afetadas: Linha[] = []
    if (c.operacao === "select") {
      afetadas = tabela.filter((l) => this.visivel(c.tabela, l) && c.filtros.every((f) => f(l)))
    } else if (c.operacao === "insert") {
      const novas = (Array.isArray(c.valores) ? c.valores : [c.valores]) as Linha[]
      const montadas: Linha[] = []
      for (const valores of novas) {
        const erro = this.podeInserir(c.tabela, valores)
        if (erro) return { data: null, error: erro }
        montadas.push(this.comPadroes(c.tabela, valores))
      }
      tabela.push(...montadas)
      afetadas = montadas
    } else if (c.operacao === "update") {
      const alvos = tabela.filter((l) => c.filtros.every((f) => f(l)) && this.podeAlterar(c.tabela, l))
      for (const linha of alvos) {
        const nova = { ...linha, ...(c.valores as Linha) }
        if (c.tabela === "posts" && !this.fotosValidas(nova)) return { data: null, error: CHECK }
      }
      for (const linha of alvos) {
        Object.assign(linha, c.valores as Linha)
        if (c.tabela === "posts") linha.updated_at = this.momento()
      }
      afetadas = alvos
    } else {
      const alvos = tabela.filter((l) => c.filtros.every((f) => f(l)) && this.podeAlterar(c.tabela, l))
      for (const linha of alvos) this.apagar(c.tabela, linha)
      afetadas = alvos
    }

    // Ordem e limite valem para a leitura.
    if (c.operacao === "select") {
      afetadas = [...afetadas]
      for (const [coluna, crescente, nulosPrimeiro] of [...c.ordens].reverse()) {
        afetadas.sort((a, b) => {
          const x = a[coluna]
          const y = b[coluna]
          if (x == null || y == null) return x == y ? 0 : (x == null) === nulosPrimeiro ? -1 : 1
          const r = String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0
          return crescente ? r : -r
        })
      }
      if (c.limite !== undefined) afetadas = afetadas.slice(0, c.limite)
    }

    const colunas = c.operacao === "select" ? c.colunas : c.retorno
    let dados: Linha[] | null = null
    if (colunas !== undefined) {
      dados = []
      for (const linha of afetadas) {
        const projetada = this.projetar(c.tabela, linha, lerColunas(colunas))
        if (projetada === SEM_PRIVILEGIO) return { data: null, error: SEM_PRIVILEGIO }
        dados.push(projetada as Linha)
      }
    }

    if (c.modo === "single") {
      if (!dados || dados.length !== 1) return { data: null, error: { code: "PGRST116", message: "not one row" } }
      return { data: dados[0], error: null }
    }
    if (c.modo === "maybe") {
      if (dados && dados.length > 1) return { data: null, error: { code: "PGRST116", message: "many rows" } }
      return { data: dados?.[0] ?? null, error: null }
    }
    return { data: dados, error: null }
  }

  private comPadroes(tabela: string, valores: Linha): Linha {
    if (tabela === "posts") {
      const agora = this.momento()
      return {
        id: randomUUID(),
        trip_id: null,
        title: null,
        destination: null,
        start_date: null,
        end_date: null,
        caption: null,
        items: [],
        places: [],
        photos: [],
        created_at: agora,
        updated_at: agora,
        ...valores,
      }
    }
    if (tabela === "post_tags") return { created_at: this.momento(), ...valores }
    return { ...valores }
  }

  private podeInserir(tabela: string, valores: Linha): ErroDoBanco | null {
    if (tabela === "posts") {
      if (valores.author_id !== this.sessao || !this.perfil(this.sessao)?.username) return SEM_PRIVILEGIO
      if (valores.trip_id != null && !(this.membros.get(String(valores.trip_id)) ?? []).includes(String(this.sessao))) {
        return SEM_PRIVILEGIO
      }
      if (!this.fotosValidas(this.comPadroes(tabela, valores))) return CHECK
      return null
    }
    if (tabela === "post_tags") {
      if (valores.author_id !== this.sessao || !this.podeMarcar(valores.post_id, valores.tagged_id)) return SEM_PRIVILEGIO
      const repetida = this.tabelas.post_tags.some((t) => t.post_id === valores.post_id && t.tagged_id === valores.tagged_id)
      return repetida ? REPETIDA : null
    }
    return SEM_PRIVILEGIO
  }

  private podeAlterar(tabela: string, linha: Linha): boolean {
    if (tabela === "posts") return this.escritaEmPostsSemPolicy || linha.author_id === this.sessao
    if (tabela === "post_tags") return linha.tagged_id === this.sessao || linha.author_id === this.sessao
    return false
  }

  private apagar(tabela: string, linha: Linha) {
    this.tabelas[tabela] = this.tabelas[tabela].filter((l) => l !== linha)
    if (tabela === "posts") {
      this.tabelas.post_tags = this.tabelas.post_tags.filter((t) => t.post_id !== linha.id)
      this.tabelas.post_tag_recusas = this.tabelas.post_tag_recusas.filter((r) => r.post_id !== linha.id)
    }
    if (tabela === "post_tags" && linha.tagged_id === this.sessao) {
      // O trigger: a própria pessoa removeu a marca.
      const post = this.tabelas.posts.find((p) => p.id === linha.post_id)
      if (post) {
        this.tabelas.post_tag_recusas.push({
          trip_id: post.trip_id ?? null,
          post_id: post.trip_id == null ? post.id : null,
          author_id: linha.author_id,
          tagged_id: linha.tagged_id,
        })
      }
    }
  }

  rpc(nome: string, args: Record<string, unknown>): Resultado {
    this.rpcs.push({ nome, args })
    const forcada = this.falhaPara(`rpc:${nome}`, "rpc")
    if (forcada) return { data: null, error: forcada }
    switch (nome) {
      case "pode_ver_rede":
        return { data: this.podeVerRede(args.perfil), error: null }
      case "social_meu_post_da_viagem": {
        const post = this.tabelas.posts.find((p) => p.trip_id === args.viagem && p.author_id === this.sessao)
        return { data: post?.id ?? null, error: null }
      }
      case "social_membros_marcaveis": {
        const membros = this.membros.get(String(args.viagem)) ?? []
        if (!membros.includes(String(this.sessao))) return { data: [], error: null }
        return { data: membros.filter((m) => m !== this.sessao && this.perfil(m)?.username), error: null }
      }
      case "social_recusas_da_viagem":
        return {
          data: this.tabelas.post_tag_recusas
            .filter((r) => r.trip_id === args.viagem && r.author_id === this.sessao)
            .map((r) => r.tagged_id),
          error: null,
        }
      case "social_recusas_do_post": {
        const post = this.tabelas.posts.find((p) => p.id === args.post && p.author_id === this.sessao)
        if (!post) return { data: [], error: null }
        return {
          data: [
            ...new Set(
              this.tabelas.post_tag_recusas
                .filter((r) => r.post_id === post.id || (post.trip_id != null && r.trip_id === post.trip_id && r.author_id === post.author_id))
                .map((r) => r.tagged_id),
            ),
          ],
          error: null,
        }
      }
      case "consumir_limite":
        return { data: [this.limite], error: null }
      default:
        throw new Error(`função desconhecida no banco falso: ${nome}`)
    }
  }

  /** O cliente da sessão, com o tipo do SDK para as libs aceitarem (só o que elas usam existe). */
  clienteDaSessao(): SupabaseClient {
    const cliente = {
      auth: { getUser: async () => ({ data: { user: this.sessao ? { id: this.sessao } : null } }) },
      from: (tabela: string) => new Consulta(this, tabela),
      rpc: async (nome: string, args: Record<string, unknown>) => this.rpc(nome, args),
    }
    return cliente as unknown as SupabaseClient
  }

  /** O cliente de serviço: só o Storage. */
  clienteDeServico(): Pick<SupabaseClient, "storage"> {
    const s = this.storage
    const cliente = {
      storage: {
        from: (bucket: string) => ({
          upload: async (caminho: string, bytes: Uint8Array, opcoes: { contentType?: string; upsert?: boolean }) => {
            const indice = s.envios.length
            s.envios.push({ bucket, caminho, bytes, contentType: opcoes?.contentType, upsert: opcoes?.upsert })
            if (s.falharEnvioNo === indice) return { data: null, error: { message: "storage fora do ar" } }
            s.arquivos.set(`${bucket}/${caminho}`, bytes)
            return { data: { path: caminho }, error: null }
          },
          remove: async (caminhos: string[]) => {
            s.remocoes.push({ bucket, caminhos: [...caminhos] })
            if (s.falharRemocao) return { data: null, error: { message: "storage fora do ar" } }
            const existiam = caminhos.filter((c) => s.arquivos.delete(`${bucket}/${c}`))
            return { data: existiam.map((name) => ({ name })), error: null }
          },
          createSignedUrls: async (caminhos: string[], validade: number) => {
            s.assinaturas.push({ bucket, caminhos: [...caminhos], validade })
            return {
              data: caminhos.map((path) => ({ path, signedUrl: `https://storage.teste/${bucket}/${path}?token=tk`, error: null })),
              error: null,
            }
          },
        }),
      },
    }
    return cliente as unknown as Pick<SupabaseClient, "storage">
  }
}

export class Consulta implements PromiseLike<Resultado> {
  operacao: "select" | "insert" | "update" | "delete" = "select"
  colunas?: string
  retorno?: string
  valores?: unknown
  filtros: ((l: Linha) => boolean)[] = []
  ordens: [string, boolean, boolean][] = []
  limite?: number
  modo: "lista" | "single" | "maybe" = "lista"

  constructor(
    private banco: BancoFalso,
    readonly tabela: string,
  ) {}

  select(colunas = "*") {
    if (this.operacao === "select") this.colunas = colunas
    else this.retorno = colunas
    return this
  }
  insert(valores: unknown) {
    this.operacao = "insert"
    this.valores = valores
    return this
  }
  update(valores: unknown) {
    this.operacao = "update"
    this.valores = valores
    return this
  }
  delete() {
    this.operacao = "delete"
    return this
  }
  eq(coluna: string, valor: unknown) {
    this.filtros.push((l) => comparavel(l[coluna]) === valor)
    return this
  }
  neq(coluna: string, valor: unknown) {
    this.filtros.push((l) => l[coluna] !== valor)
    return this
  }
  in(coluna: string, valores: unknown[]) {
    this.filtros.push((l) => valores.includes(l[coluna]))
    return this
  }
  is(coluna: string, valor: null) {
    this.filtros.push((l) => (l[coluna] ?? null) === valor)
    return this
  }
  not(coluna: string, operador: string, valor: unknown) {
    if (operador !== "is" || valor !== null) throw new Error("not() só com is null no banco falso")
    this.filtros.push((l) => l[coluna] != null)
    return this
  }
  lt(coluna: string, valor: string) {
    this.filtros.push((l) => l[coluna] != null && String(l[coluna]) < valor)
    return this
  }
  gt(coluna: string, valor: string) {
    this.filtros.push((l) => l[coluna] != null && String(l[coluna]) > valor)
    return this
  }
  ilike(coluna: string, padrao: string) {
    const regex = comoRegex(padrao)
    this.filtros.push((l) => typeof l[coluna] === "string" && regex.test(l[coluna] as string))
    return this
  }
  order(coluna: string, opcoes: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    const crescente = opcoes.ascending ?? true
    this.ordens.push([coluna, crescente, opcoes.nullsFirst ?? !crescente])
    return this
  }
  limit(n: number) {
    this.limite = n
    return this
  }
  single() {
    this.modo = "single"
    return Promise.resolve(this.banco.executar(this))
  }
  maybeSingle() {
    this.modo = "maybe"
    return Promise.resolve(this.banco.executar(this))
  }
  then<A = Resultado, B = never>(
    resolver?: ((valor: Resultado) => A | PromiseLike<A>) | null,
    rejeitar?: ((motivo: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve()
      .then(() => this.banco.executar(this))
      .then(resolver, rejeitar)
  }
}

/** O banco único dos testes: as fábricas dos `vi.mock` o usam. */
export const banco = new BancoFalso()
banco.reiniciar()

// --- sementes ----------------------------------------------------------------

export const ANA = "11111111-1111-4111-8111-111111111111"
export const BIA = "22222222-2222-4222-8222-222222222222"
export const CAIO = "33333333-3333-4333-8333-333333333333"
/** Sem username: não pode ser marcada. */
export const DORA = "44444444-4444-4444-8444-444444444444"
/** Perfil privado que a ANA não segue. */
export const EVA = "55555555-5555-4555-8555-555555555555"
export const VIAGEM = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

export const fotoDe = (autor: string, n = 1) => `${autor}/0000000${n}-0000-4000-8000-00000000000${n}.webp`
export const urlDe = (caminho: string) => `https://storage.teste/capas-posts/${caminho}?token=tk`
export const urlAvatar = (caminho: string) => `https://storage.teste/avatars/${caminho}?token=tk`

/** Perfis padrão: ana, bia e caio públicos, dora sem username, eva privada. Bia com foto. */
export function semearPerfis() {
  banco.tabelas.profiles.push(
    { id: ANA, username: "ana", full_name: "Ana Souza", avatar_url: null, is_public: true, email: "ana@x.local" },
    { id: BIA, username: "bia", full_name: "Bia Lima", avatar_url: `${BIA}/99999999-9999-4999-8999-999999999999.webp`, is_public: true, email: "bia@x.local" },
    { id: CAIO, username: "caio", full_name: "Caio Reis", avatar_url: null, is_public: true },
    { id: DORA, username: null, full_name: "Dora", avatar_url: null, is_public: true },
    { id: EVA, username: "eva", full_name: "Eva Privada", avatar_url: null, is_public: false },
  )
}

/** Um post gravado direto (sem passar pela policy), com o que nunca pode sair. */
export function semearPost(campos: Linha): Linha {
  const agora = banco.momento()
  const linha: Linha = {
    id: randomUUID(),
    trip_id: null,
    title: null,
    destination: null,
    start_date: null,
    end_date: null,
    caption: null,
    items: [],
    places: [],
    photos: [],
    created_at: agora,
    updated_at: agora,
    budget: 9000,
    notes: "segredo",
    ...campos,
  }
  banco.tabelas.posts.push(linha)
  for (const foto of (linha.photos as string[]) ?? []) banco.storage.arquivos.set(`capas-posts/${foto}`, new Uint8Array([1]))
  return linha
}

export function semearMarca(postId: unknown, autor: string, marcado: string) {
  banco.tabelas.post_tags.push({ post_id: postId, author_id: autor, tagged_id: marcado, created_at: banco.momento() })
}

/** Chaves que nunca podem aparecer numa resposta, em qualquer nível. */
export const CHAVES_PROIBIDAS = [
  "trip_id",
  "author_id",
  "photos",
  "cover_path",
  "email",
  "budget",
  "currency",
  "notes",
  "latitude",
  "longitude",
  "is_public",
]

export function chavesProibidas(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.flatMap(chavesProibidas)
  if (typeof valor !== "object" || valor === null) return []
  return Object.entries(valor).flatMap(([chave, v]) => [...(CHAVES_PROIBIDAS.includes(chave) ? [chave] : []), ...chavesProibidas(v)])
}

/** Nenhum caminho do Storage cru (`<uuid>/<uuid>.ext` fora de uma URL assinada). */
export function caminhosCrus(corpo: unknown): string[] {
  const texto = JSON.stringify(corpo)
  const achados = texto.match(new RegExp(`"${UUID}/${UUID}\\.(webp|jpg|png)"`, "g"))
  return achados ?? []
}

/** O que toda resposta das rotas de post cumpre: sem cache compartilhado e sem chave proibida. */
export async function conferirResposta(resposta: Response) {
  const cache = resposta.headers.get("cache-control")
  const corpo = await resposta.json()
  return { status: resposta.status, corpo, cache, proibidas: chavesProibidas(corpo), crus: caminhosCrus(corpo) }
}

/** As chaves exatas do `PostVisto`. */
export const CHAVES_POST_VISTO = ["autor", "caption", "created_at", "fotos", "id", "marcados", "proprio", "updated_at", "viagem"]
export const CHAVES_PESSOA = ["avatar_url", "full_name", "id", "username"]
export const CHAVES_AUTOR = ["avatar_url", "full_name", "username"]
export const CHAVES_VIAGEM = ["destination", "end_date", "items", "places", "start_date", "title"]
export const CHAVES_QUADRADO = ["descricao", "foto", "id", "quantidade_fotos"]
