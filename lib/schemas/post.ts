import { z } from "zod"

/**
 * Contrato de entrada de POST e PATCH /api/social/viagens/[tripId]/post: o que
 * o autor escolheu no diálogo "Publicar viagem" (readequação de 18/11, que
 * segue a prévia do Fernando em components/prototipo/botao-publicar.tsx).
 *
 * O corpo carrega escolhas e só três textos do autor: o título, a legenda e o
 * endereço digitado de um lugar. Destino, datas, itens do roteiro e nome dos
 * lugares saem da projeção pública da viagem (`lib/trips/publico.ts`), montada
 * no servidor. Por isso todo objeto é estrito, em todos os níveis: `trip_id`,
 * `author_id`, `title`, `notes`, `items`, `cover_path` ou qualquer outra chave
 * é 400, e não descarte silencioso — quem manda isso está tentando escrever o
 * post por fora, e a resposta deve dizer que não dá.
 *
 * - `titulo`: opcional, até 120 caracteres depois do trim (o CHECK de
 *   `trip_posts.title`). Ausente, nulo, vazio, só com espaços ou só com
 *   caracteres invisíveis (`limparTextoLivre`) vira `null`, e o post usa o
 *   título da viagem. Ele é editável (decisão de 18/11) para que dois posts da
 *   mesma viagem não precisem sair com o mesmo título.
 * - `legenda`: opcional, até 280 caracteres depois do trim. Vazia, só com
 *   espaços ou só com invisíveis vira `null`, que é o que o CHECK de
 *   `trip_posts.caption` aceita.
 * - `roteiro`: `null` com a chave desligada; ligada, publica todos os itens não
 *   cancelados da projeção, e `local`/`descricao` ligam `location` e
 *   `description` para o post inteiro. Notas, coordenadas e preço não têm
 *   chave, e por isso nunca entram.
 * - `lugares`: `null` com a chave desligada; ligada, a lista dos lugares que
 *   entram, cada um com o endereço escolhido: `"nenhum"`, `"google"` (o da
 *   projeção) ou `{ texto }` digitado.
 * - `marcados`: os membros que o autor marcou; a rota confere contra os
 *   marcáveis (`lib/social/marcacoes.ts`).
 *
 * Os uuids vão para minúsculas, o formato em que o Postgres devolve os ids, e
 * **repetido é 400**: num lugar, cada ocorrência traria um endereço diferente e
 * não há como saber qual vale; nos marcados, o pedido é ambíguo do mesmo jeito.
 * O tamanho do texto é contado em caracteres (code points), como o
 * `char_length` dos CHECKs do banco, e não em unidades UTF-16.
 *
 * @RF09.7 publicar viagem com legenda, roteiro e lugares escolhidos pelo autor
 * @RF09.13 marcar quem viajou junto
 */

/** Teto do título: o mesmo do CHECK de `trip_posts.title`. */
export const MAXIMO_TITULO = 120
/** Teto da legenda: o mesmo do CHECK de `trip_posts.caption`. */
export const MAXIMO_LEGENDA = 280
/** Teto de lugares no post: o mesmo de `social_lugares_do_post_validos`. */
export const MAXIMO_LUGARES_NO_POST = 200
/** Teto do endereço de um lugar: o mesmo de `social_lugares_do_post_validos`. */
export const MAXIMO_ENDERECO = 300
/** Teto de marcados num post. */
export const MAXIMO_MARCADOS = 50

/** Tamanho em caracteres, como o `char_length` do Postgres: um emoji conta 1. */
export const caracteres = (texto: string) => [...texto].length

const booleano = (campo: string) =>
  z.boolean({ required_error: `informe ${campo}`, invalid_type_error: "use verdadeiro ou falso" })

const uuidMinusculo = (mensagem: string) =>
  z
    .string({ required_error: mensagem, invalid_type_error: mensagem })
    .uuid(mensagem)
    .transform((id) => id.toLowerCase())

/** Marca, com a posição, cada id que já apareceu antes na lista. */
function semRepetidos<T>(idDe: (valor: T) => string, caminho: (i: number) => (string | number)[], mensagem: string) {
  return (lista: T[], ctx: z.RefinementCtx) => {
    const vistos = new Set<string>()
    lista.forEach((valor, i) => {
      const id = idDe(valor)
      if (vistos.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: mensagem, path: caminho(i) })
      vistos.add(id)
    })
  }
}

/**
 * Espaços e caracteres de formatação invisíveis (`\p{Cf}`: U+200B espaço de
 * largura zero, U+FEFF, U+2060 word joiner, U+200E/U+200F de direção...) nas
 * pontas. As "tags" de emoji (U+E0020 a U+E007F) também são `\p{Cf}`, mas são o
 * fim da bandeira da Inglaterra, da Escócia e de Gales: ficam, para uma
 * legenda que termina com 🏴󠁧󠁢󠁥󠁮󠁧󠁿 não perder a bandeira.
 */
const INVISIVEL = /^[\s\p{Cf}]$/u
const TAG_DE_EMOJI = /^[\u{E0020}-\u{E007F}]$/u
const invisivel = (caractere: string) => INVISIVEL.test(caractere) && !TAG_DE_EMOJI.test(caractere)

/** Pelo menos um caractere que se vê: letra, número, pontuação ou símbolo (emoji é símbolo). */
const VISIVEL = /[\p{L}\p{N}\p{P}\p{S}]/u

/**
 * O texto livre do autor (título e legenda) limpo, ou `null` se não sobra nada
 * que se veja. Sem isto, um título só com U+200B passava pelo trim (que não o
 * conhece como espaço), virava o título do post e aparecia em branco no feed.
 * `montarPost` (lib/social/posts.ts) usa a mesma função, como defesa.
 *
 * As pontas saem num laço, caractere a caractere, e não com uma regex
 * `(...)+$`: esta roda antes do teto de tamanho, e uma regex ancorada no fim
 * custa tempo quadrático num texto longo de espaços com uma letra no fim.
 */
export function limparTextoLivre(texto: string): string | null {
  const caracteresDoTexto = Array.from(texto)
  let inicio = 0
  let fim = caracteresDoTexto.length
  while (inicio < fim && invisivel(caracteresDoTexto[inicio])) inicio++
  while (fim > inicio && invisivel(caracteresDoTexto[fim - 1])) fim--
  const limpo = caracteresDoTexto.slice(inicio, fim).join("")
  return VISIVEL.test(limpo) ? limpo : null
}

/**
 * Texto livre opcional do autor: pontas limpas (espaços e invisíveis), teto em
 * caracteres, e vazio, só invisível, ausente ou nulo viram `null`.
 */
const textoOpcional = (nome: string, maximo: number) =>
  z
    .string({ invalid_type_error: `${nome} deve ser texto` })
    .transform((texto) => limparTextoLivre(texto))
    .refine((texto) => texto === null || caracteres(texto) <= maximo, `${nome} pode ter até ${maximo} caracteres`)
    .nullable()
    .optional()
    .transform((valor) => valor ?? null)

const tituloSchema = textoOpcional("o título", MAXIMO_TITULO)

const legendaSchema = textoOpcional("a legenda", MAXIMO_LEGENDA)

export const roteiroSchema = z
  .object(
    { local: booleano("se o local aparece"), descricao: booleano("se a descrição aparece") },
    { required_error: "informe o roteiro, ou null para não publicá-lo", invalid_type_error: "roteiro inválido" },
  )
  .strict("campo que não pode ser mostrado no roteiro")
  .nullable()

const enderecoDigitadoSchema = z
  .object({
    texto: z
      .string({ required_error: "digite o endereço", invalid_type_error: "o endereço deve ser texto" })
      .transform((texto) => texto.trim())
      .refine((texto) => texto !== "", "digite o endereço")
      .refine((texto) => caracteres(texto) <= MAXIMO_ENDERECO, `o endereço pode ter até ${MAXIMO_ENDERECO} caracteres`),
  })
  .strict("campo não permitido no endereço")

export const enderecoSchema = z.union([z.literal("nenhum"), z.literal("google"), enderecoDigitadoSchema], {
  errorMap: () => ({ message: 'endereço inválido: use "nenhum", "google" ou { texto }' }),
})

const lugarEscolhidoSchema = z
  .object({
    id: uuidMinusculo("lugar inválido"),
    endereco: enderecoSchema,
  })
  .strict("campo não permitido no lugar")

export const lugaresSchema = z
  .array(lugarEscolhidoSchema, {
    required_error: "informe os lugares, ou null para não publicá-los",
    invalid_type_error: "informe os lugares em uma lista",
  })
  .max(MAXIMO_LUGARES_NO_POST, `escolha até ${MAXIMO_LUGARES_NO_POST} lugares`)
  .superRefine(
    semRepetidos(
      (lugar) => lugar.id,
      (i) => [i, "id"],
      "lugar repetido",
    ),
  )
  .nullable()

export const marcadosSchema = z
  .array(uuidMinusculo("pessoa marcada inválida"), { invalid_type_error: "informe os marcados em uma lista" })
  .max(MAXIMO_MARCADOS, `marque até ${MAXIMO_MARCADOS} pessoas`)
  .superRefine(
    semRepetidos(
      (id) => id,
      (i) => [i],
      "pessoa marcada repetida",
    ),
  )
  .default([])

export const pedidoPostSchema = z
  .object(
    {
      titulo: tituloSchema,
      legenda: legendaSchema,
      roteiro: roteiroSchema,
      lugares: lugaresSchema,
      marcados: marcadosSchema,
    },
    { invalid_type_error: "envie as escolhas do post em um objeto" },
  )
  .strict("campo não permitido: o post é montado a partir da viagem")

/** O corpo já validado: título e legenda limpos ou nulos, uuids em minúsculas e sem repetição. */
export type PedidoPost = z.infer<typeof pedidoPostSchema>
/** O que a tela envia. */
export type PedidoPostEntrada = z.input<typeof pedidoPostSchema>
/** As subchaves do roteiro, quando ele está ligado. */
export type EscolhaDoRoteiro = NonNullable<PedidoPost["roteiro"]>
/** Um lugar escolhido, com o endereço que vai para o post. */
export type LugarEscolhido = NonNullable<PedidoPost["lugares"]>[number]
/** `"nenhum"`, `"google"` ou o endereço digitado, já limpo. */
export type EnderecoDoLugar = LugarEscolhido["endereco"]
