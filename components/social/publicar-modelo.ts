/**
 * Tipos e regras sem I/O da tela "Publicar viagem" (S06-M-publicar-viagem).
 *
 * Os tipos espelham o contrato HTTP de /api/social/viagens/[tripId]/post
 * (redesenho do post de 18/11, modelo Instagram). Ficam aqui, e não importados
 * de lib/schemas/post.ts, porque a tela só conhece o JSON da rota: o schema do
 * servidor valida a entrada, a tela monta o corpo e lê a resposta. O post da
 * resposta é o `PostVisto` comum a todas as rotas de post (post-detalhe-modelo.ts).
 *
 * @RF09.7 publicar viagem — título, legenda, roteiro, lugares e fotos escolhidos pelo autor
 * @RF09.13 marcar pessoas (os membros da viagem como sugestão), menos quem removeu a própria marcação
 */

import type { PessoaNoPost, PostVisto } from "./post-detalhe-modelo"

export const LIMITE_TITULO = 120
export const LIMITE_LEGENDA = 280
export const LIMITE_ENDERECO = 300

/** Item do roteiro como a projeção pública o entrega (sem id, notas, preço nem coordenadas). */
export type ItemPrevia = {
  title: string
  date: string | null
  start_time: string | null
  end_time: string | null
  category: string | null
  location: string | null
  description: string | null
}

export type LugarPrevia = { id: string; name: string; category: string | null; address: string | null }

export type Pessoa = PessoaNoPost

/**
 * Uma sugestão de marcação (membro da viagem com username, menos a sessão):
 * `recusou` quando a pessoa removeu a própria marcação num post seu desta
 * viagem e não pode ser marcada de novo nela (nem depois de despublicar e
 * publicar de novo). Marcar não se limita às sugestões: vale qualquer perfil
 * com username, pela busca do `MarcarPessoas`.
 */
export type PessoaMarcavel = Pessoa & { recusou: boolean }

/** Item copiado para o post: só as chaves que a pessoa ligou existem. */
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

/** O post da viagem, como as rotas o devolvem: `viagem` vem preenchida (a cópia), `fotos` pode ser `[]`. */
export type Post = PostVisto

export type RespostaPost = {
  previa: {
    title: string
    destination: string
    start_date: string
    end_date: string
    itens: ItemPrevia[]
    lugares: LugarPrevia[]
  }
  marcaveis: PessoaMarcavel[]
  /**
   * Ids de TODOS que removeram a própria marcação num post desta autora nesta
   * viagem, membros ou não: não podem ser marcados de novo nela.
   */
  recusados: string[]
  post: Post | null
}

export type Endereco = "nenhum" | "google" | { texto: string }

/** Corpo de POST e PATCH. `null` numa chave = chave desligada. */
export type CorpoPost = {
  /** `null` = o título da viagem. */
  titulo: string | null
  legenda: string | null
  roteiro: { local: boolean; descricao: boolean } | null
  lugares: Array<{ id: string; endereco: Endereco }> | null
  marcados: string[]
}

/** A escolha de endereço de um lugar na tela; o texto digitado sobrevive à troca de opção. */
export type EscolhaEndereco = { modo: "nenhum" | "google" | "digitar"; texto: string }

/** Uma foto escolhida no aparelho e ainda não enviada: o arquivo e a URL `blob:` da prévia. */
export type FotoEscolhida = { arquivo: File; url: string }

export type Formulario = {
  titulo: string
  legenda: string
  roteiro: boolean
  mostrarLocal: boolean
  mostrarDescricao: boolean
  lugares: boolean
  enderecos: Record<string, EscolhaEndereco>
  /** Quem vai marcado, na ordem em que foi escolhido. */
  marcados: Pessoa[]
  /**
   * As fotos a enviar, na ordem do carrossel. `null` = manter as que o post já
   * tem (só ao gerenciar); `[]` ao gerenciar = tirar todas (volta o grafismo).
   */
  fotos: FotoEscolhida[] | null
}

const SEM_ENDERECO: EscolhaEndereco = { modo: "nenhum", texto: "" }

const temTexto = (v: string | null | undefined): v is string => typeof v === "string" && v.trim() !== ""

/**
 * Ids de quem removeu a própria marcação nesta viagem e não pode ser marcado de
 * novo: os `recusados` do GET (membros ou não) e, por garantia, as sugestões
 * com `recusou`. Em minúsculas, como a rota compara.
 */
export function idsRecusados(dados: Pick<RespostaPost, "marcaveis" | "recusados">): Set<string> {
  const ids = [...(dados.recusados ?? []), ...dados.marcaveis.filter((m) => m.recusou).map((m) => m.id)]
  return new Set(ids.map((id) => id.toLowerCase()))
}

/** Se a pessoa está entre os `recusados`. */
const recusou = (recusados: Set<string>, pessoa: Pick<Pessoa, "id">) => recusados.has(pessoa.id.toLowerCase())

/**
 * Um 400 `marcado_recusou` trouxe `recusados` (quem recusou, entre os pedidos):
 * eles entram nos recusados do estado e saem da seleção. Devolve também quem
 * saiu, para o aviso dizer o nome.
 */
export function aplicarRecusas(
  form: Formulario,
  dados: RespostaPost,
  novos: string[],
): { form: Formulario; dados: RespostaPost; removidos: Pessoa[] } {
  const recusados = new Set([...idsRecusados(dados), ...novos.map((id) => id.toLowerCase())])
  return {
    form: { ...form, marcados: form.marcados.filter((p) => !recusou(recusados, p)) },
    dados: { ...dados, recusados: [...recusados] },
    removidos: form.marcados.filter((p) => recusou(recusados, p)),
  }
}

/** "@ana", "@ana e @bia", "@ana, @bia e @caio". */
export function listarArrobas(pessoas: Pick<Pessoa, "username">[]): string {
  const nomes = pessoas.map((p) => `@${p.username}`)
  return nomes.length <= 1 ? (nomes[0] ?? "") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`
}

/** Se o "Publicar"/"Atualizar" precisa enviar as fotos depois do POST/PATCH. */
export function enviaFotos(form: Formulario, publicado: boolean): boolean {
  if (form.fotos === null) return false
  return publicado || form.fotos.length > 0
}

/** O título que a publicação vai mostrar: o digitado, ou o da viagem quando o campo está vazio. */
export function tituloPublico(form: Formulario, dados: RespostaPost): string {
  return form.titulo.trim() || dados.previa.title
}

/**
 * O formulário ao abrir. Sem post, os padrões da prévia do Fernando: roteiro e
 * lugares ligados, subchaves desligadas, "Sem endereço", ninguém marcado e
 * nenhuma foto; o título vem preenchido com o da viagem.
 *
 * Com post, o estado é reconstruído da cópia gravada (`post.viagem`), que não
 * guarda as escolhas — só o resultado:
 * - roteiro ligado se a cópia tem itens; local/descrição ligados se algum item
 *   tem a chave;
 * - lugares ligados se a cópia tem lugares; o endereço de cada lugar da prévia
 *   é achado pelo nome (o post não guarda o id): igual ao `address` atual →
 *   Google; diferente → digitado; sem → nenhum;
 * - título: o do post;
 * - marcados: os do post, menos quem recusou (a rota responderia 400
 *   `marcado_recusou`). Não precisam ser membros;
 * - fotos: `null`, as do post ficam até a pessoa trocar.
 */
export function formularioInicial(dados: RespostaPost): Formulario {
  const { previa, post } = dados
  const enderecos: Record<string, EscolhaEndereco> = {}
  for (const l of previa.lugares) enderecos[l.id] = SEM_ENDERECO

  if (!post) {
    return {
      titulo: previa.title,
      legenda: "",
      roteiro: true,
      mostrarLocal: false,
      mostrarDescricao: false,
      lugares: true,
      enderecos,
      marcados: [],
      fotos: [],
    }
  }

  const copia = post.viagem
  const items = copia?.items ?? []
  const places = copia?.places ?? []
  const usados = new Set<number>()
  for (const l of previa.lugares) {
    const i = places.findIndex((p, indice) => !usados.has(indice) && p.name === l.name)
    if (i < 0) continue
    usados.add(i)
    const endereco = places[i].address
    if (!temTexto(endereco)) continue
    enderecos[l.id] =
      temTexto(l.address) && l.address === endereco ? { modo: "google", texto: "" } : { modo: "digitar", texto: endereco }
  }

  const recusados = idsRecusados(dados)

  return {
    titulo: copia?.title ?? previa.title,
    legenda: post.caption ?? "",
    roteiro: items.length > 0,
    mostrarLocal: items.some((i) => typeof i.location === "string"),
    mostrarDescricao: items.some((i) => typeof i.description === "string"),
    lugares: places.length > 0,
    enderecos,
    marcados: post.marcados.filter((m) => !recusou(recusados, m)),
    fotos: null,
  }
}

/**
 * Encaixa o que a pessoa já escolheu num estado recarregado do servidor (ex.:
 * depois de um 400 `marcado_invalido` ou `marcado_recusou`): lugar novo entra
 * com "Sem endereço", lugar que sumiu sai, "Google" de lugar que perdeu o
 * endereço volta a "Sem endereço" e quem recusou sai dos marcados. O título,
 * a legenda e as fotos escolhidas ficam.
 */
export function ajustarFormulario(form: Formulario, dados: RespostaPost): Formulario {
  const recusados = idsRecusados(dados)
  const enderecos: Record<string, EscolhaEndereco> = {}
  for (const l of dados.previa.lugares) {
    const atual = form.enderecos[l.id] ?? SEM_ENDERECO
    enderecos[l.id] = atual.modo === "google" && !temTexto(l.address) ? SEM_ENDERECO : atual
  }
  return { ...form, enderecos, marcados: form.marcados.filter((p) => !recusou(recusados, p)) }
}

/** Lugares com "Digitar" escolhido e texto vazio: a tela pede o texto antes de enviar. */
export function lugaresSemTexto(form: Formulario, lugares: LugarPrevia[]): LugarPrevia[] {
  if (!form.lugares) return []
  return lugares.filter((l) => form.enderecos[l.id]?.modo === "digitar" && form.enderecos[l.id].texto.trim() === "")
}

function enderecoDoCorpo(escolha: EscolhaEndereco | undefined, lugar: LugarPrevia): Endereco {
  if (!escolha || escolha.modo === "nenhum") return "nenhum"
  if (escolha.modo === "google") return temTexto(lugar.address) ? "google" : "nenhum"
  return { texto: escolha.texto.trim() }
}

/**
 * O corpo de POST/PATCH, campo a campo. Chave desligada vai como `null`; título
 * vazio vai como `null` (o servidor usa o da viagem). As fotos não vão aqui: o
 * corpo é JSON, e elas seguem depois, em multipart, para .../post/fotos.
 */
export function montarCorpo(form: Formulario, dados: RespostaPost): CorpoPost {
  const titulo = form.titulo.trim()
  const legenda = form.legenda.trim()
  const recusados = idsRecusados(dados)
  const marcados = [...new Set(form.marcados.map((p) => p.id.toLowerCase()))].filter((id) => !recusados.has(id))
  return {
    titulo: titulo === "" ? null : titulo,
    legenda: legenda === "" ? null : legenda,
    roteiro: form.roteiro ? { local: form.mostrarLocal, descricao: form.mostrarDescricao } : null,
    lugares: form.lugares
      ? dados.previa.lugares.map((l) => ({ id: l.id.toLowerCase(), endereco: enderecoDoCorpo(form.enderecos[l.id], l) }))
      : null,
    marcados,
  }
}

/** O endereço que o lugar vai mostrar na cópia, para a prévia. */
export function enderecoPublico(escolha: EscolhaEndereco | undefined, lugar: LugarPrevia): string | null {
  const e = enderecoDoCorpo(escolha, lugar)
  if (e === "nenhum") return null
  if (e === "google") return lugar.address
  return e.texto === "" ? null : e.texto
}

/** "2026-12-01" → "01/12/2026", sem passar por `Date` (que deslocaria o dia pelo fuso). */
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

export function iniciais(pessoa: Pick<Pessoa, "full_name" | "username">): string {
  const base = pessoa.full_name?.trim() || pessoa.username
  const partes = base.split(/\s+/).filter(Boolean)
  return ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase() || "?"
}
