/**
 * Tipos e regras sem I/O do post (redesenho de 18/11, modelo do Instagram),
 * para as telas de criar (criar-post.tsx), marcar (marcar-pessoas.tsx) e ver o
 * detalhe (post-detalhe.tsx).
 *
 * Os tipos espelham o JSON do contrato HTTP de /api/social/posts e
 * /api/social/pessoas. Ficam aqui, e não importados da lib do servidor, pelo
 * mesmo motivo de publicar-modelo.ts: a tela só conhece o JSON da rota.
 *
 * @RF09.15 post com fotos · @RF09.17 detalhe do post · @RF09.13 marcar pessoas
 */

/** Limite de caracteres da legenda (o mesmo do CHECK do banco e do schema da rota). */
export const LIMITE_LEGENDA_POST = 280
/** Um post tem de 1 a 3 fotos (só o de viagem pode ter 0). */
export const MAXIMO_FOTOS = 3
/** Até 20 pessoas marcadas por post. */
export const MAXIMO_MARCADOS = 20

export type PessoaNoPost = { id: string; username: string; full_name: string | null; avatar_url: string | null }

export type ItemDoPost = {
  title: string
  date?: string
  start_time?: string
  end_time?: string
  category?: string
  location?: string
  description?: string
}

export type LugarDoPost = { name: string; category?: string; address?: string }

export type ViagemDoPost = {
  title: string
  destination: string
  start_date: string
  end_date: string
  items: ItemDoPost[]
  places: LugarDoPost[]
}

export type PostVisto = {
  id: string
  autor: { username: string; full_name: string | null; avatar_url: string | null }
  caption: string | null
  /** URLs assinadas, na ordem do carrossel; `[]` só em post de viagem. */
  fotos: string[]
  marcados: PessoaNoPost[]
  created_at: string
  updated_at: string
  /** A sessão é a autora. */
  proprio: boolean
  viagem: ViagemDoPost | null
}

/**
 * Corpo de erro das rotas (lib/http.ts): `{ error, codigo?, detalhes? }`; no
 * 400 `marcado_recusou`, também `recusados` (os ids pedidos que recusaram).
 */
export type CorpoDeErro = { error?: unknown; codigo?: string; detalhes?: unknown; recusados?: unknown }

/** Os ids de `recusados` de uma resposta, só os que são texto, em minúsculas. */
export function idsRecusados(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((v): v is string => typeof v === "string").map((v) => v.toLowerCase()) : []
}

/**
 * Depois de um 400 `marcado_recusou`: quem recusou sai da seleção e entra nos
 * recusados (a tela os mostra desabilitados). `quem` são os usernames dos que
 * saíram, para o aviso: a tela já os tem, a rota manda só os ids.
 */
export function aplicarRecusa(
  selecionados: PessoaNoPost[],
  recusados: string[],
  novos: string[],
): { selecionados: PessoaNoPost[]; recusados: string[]; quem: string[] } {
  const barrados = new Set(novos.map((id) => id.toLowerCase()))
  const saem = selecionados.filter((p) => barrados.has(p.id.toLowerCase()))
  return {
    selecionados: selecionados.filter((p) => !barrados.has(p.id.toLowerCase())),
    recusados: [...new Set([...recusados.map((id) => id.toLowerCase()), ...barrados])],
    quem: saem.map((p) => p.username),
  }
}

/** O texto do toast depois de um `marcado_recusou`, com os usernames de quem saiu. */
export function avisoDeRecusa(quem: string[]): string {
  if (quem.length === 0) return "Quem remove a própria marcação não pode ser marcado de novo. Confira as marcações e tente de novo."
  const nomes = quem.map((u) => `@${u}`)
  const um = nomes.length === 1
  const lista = um ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`
  return `${lista} ${um ? "removeu" : "removeram"} a própria marcação e não ${um ? "pode ser marcado" : "podem ser marcados"} de novo. Tiramos das marcações; confira e tente de novo.`
}

/** O nome que aparece: o nome completo, ou o username. */
export function nomeDe(pessoa: { full_name: string | null; username: string }): string {
  return pessoa.full_name?.trim() || pessoa.username
}

/**
 * A primeira mensagem do `detalhes` de um 400 do zod (`error.flatten()`): a de
 * um campo, ou a do formulário. `null` se não houver nenhuma.
 */
export function primeiroDetalhe(detalhes: unknown): string | null {
  if (!detalhes || typeof detalhes !== "object") return null
  const { fieldErrors, formErrors } = detalhes as { fieldErrors?: unknown; formErrors?: unknown }
  const listas = [...(fieldErrors && typeof fieldErrors === "object" ? Object.values(fieldErrors) : []), formErrors]
  for (const lista of listas) {
    const primeira = Array.isArray(lista) ? lista.find((m): m is string => typeof m === "string") : undefined
    if (primeira) return primeira.charAt(0).toUpperCase() + primeira.slice(1)
  }
  return null
}

/** A mensagem do servidor para mostrar: a do `error`, ou, no "Dados inválidos" do zod, a do primeiro campo. */
export function mensagemDoServidor(corpo: CorpoDeErro): string | null {
  if (typeof corpo.error === "string" && corpo.error.trim() !== "" && corpo.error !== "Dados inválidos") return corpo.error
  return primeiroDetalhe(corpo.detalhes)
}

const diaMesEAno = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "long", year: "numeric" })
const diaEMesCurto = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" })
const diaMesEAnoCurto = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })

/** "18 de novembro de 2026", no fuso de quem vê (é o instante da publicação). */
export function dataDaPublicacao(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? "" : diaMesEAno.format(d)
}

/** "12 de jun. – 18 de jun. de 2026"; as datas chegam como AAAA-MM-DD e são lidas em UTC, sem trocar de dia. */
export function periodoDaViagem(inicio: string, fim: string): string {
  const a = new Date(`${inicio}T00:00:00Z`)
  const b = new Date(`${fim}T00:00:00Z`)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return ""
  if (inicio === fim) return diaMesEAnoCurto.format(b)
  const mesmoAno = a.getUTCFullYear() === b.getUTCFullYear()
  return `${mesmoAno ? diaEMesCurto.format(a) : diaMesEAnoCurto.format(a)} – ${diaMesEAnoCurto.format(b)}`
}

/** "2026-06-12" → "12/06/2026", sem passar por `Date` (que deslocaria o dia pelo fuso). */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return ""
  const [a, m, d] = iso.split("-")
  return a && m && d ? `${d}/${m}/${a}` : iso
}

/** "08:30:00" → "08:30". */
export function horaCurta(hora: string | null | undefined): string {
  return hora ? hora.slice(0, 5) : ""
}

const CATEGORIAS: Record<string, string> = {
  accommodation: "Hospedagem",
  transport: "Transporte",
  activity: "Atividade",
  restaurant: "Restaurante",
  attraction: "Atração",
  other: "Outro",
}

export function rotuloCategoria(categoria: string | null | undefined): string {
  if (!categoria) return ""
  return CATEGORIAS[categoria] ?? categoria
}

export type DiaDoRoteiro = { chave: string; titulo: string; itens: ItemDoPost[] }

const MS_DIA = 24 * 60 * 60 * 1000

/**
 * O roteiro agrupado por dia, na ordem da cópia. O título do grupo é
 * "Dia N · DD/MM/AAAA", contado a partir do início da viagem; item sem data (ou
 * com data fora do formato) vai para "Sem data", no fim.
 */
export function roteiroPorDia(itens: ItemDoPost[], inicio: string): DiaDoRoteiro[] {
  const grupos = new Map<string, ItemDoPost[]>()
  const semData: ItemDoPost[] = []
  for (const item of itens) {
    if (item.date && /^\d{4}-\d{2}-\d{2}$/.test(item.date)) {
      const lista = grupos.get(item.date) ?? []
      lista.push(item)
      grupos.set(item.date, lista)
    } else {
      semData.push(item)
    }
  }
  const base = Date.parse(`${inicio}T00:00:00Z`)
  const dias: DiaDoRoteiro[] = [...grupos.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([data, lista]) => {
      const n = Number.isNaN(base) ? NaN : Math.round((Date.parse(`${data}T00:00:00Z`) - base) / MS_DIA) + 1
      const titulo = Number.isFinite(n) && n >= 1 ? `Dia ${n} · ${dataCurta(data)}` : dataCurta(data)
      return { chave: data, titulo, itens: lista }
    })
  if (semData.length > 0) dias.push({ chave: "sem-data", titulo: "Sem data", itens: semData })
  return dias
}

/** "08:30–10:00 · Atividade": a linha de detalhe de um item do roteiro. */
export function linhaDoItem(item: ItemDoPost): string {
  const horario = [horaCurta(item.start_time), horaCurta(item.end_time)].filter(Boolean).join("–")
  return [horario, rotuloCategoria(item.category)].filter(Boolean).join(" · ")
}
