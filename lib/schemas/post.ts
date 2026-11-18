import { z } from "zod"

/**
 * Contrato de entrada de POST e PATCH /api/social/viagens/[tripId]/post: o que
 * o autor escolheu no diálogo "Publicar viagem" (readequação de 18/11, que
 * segue a prévia do Fernando em components/prototipo/botao-publicar.tsx).
 *
 * O corpo carrega escolhas e só dois textos do autor: a legenda e o endereço
 * digitado de um lugar. Título, destino, datas, itens do roteiro e nome dos
 * lugares saem da projeção pública da viagem (`lib/trips/publico.ts`), montada
 * no servidor. Por isso todo objeto é estrito, em todos os níveis: `trip_id`,
 * `author_id`, `title`, `notes`, `items`, `cover_path` ou qualquer outra chave
 * é 400, e não descarte silencioso — quem manda isso está tentando escrever o
 * post por fora, e a resposta deve dizer que não dá.
 *
 * - `legenda`: opcional, até 280 caracteres depois do trim. Vazia ou só com
 *   espaços vira `null`, que é o que o CHECK de `trip_posts.caption` aceita.
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

const legendaSchema = z
  .string({ invalid_type_error: "a legenda deve ser texto" })
  .transform((texto) => texto.trim())
  .refine((texto) => caracteres(texto) <= MAXIMO_LEGENDA, `a legenda pode ter até ${MAXIMO_LEGENDA} caracteres`)
  .transform((texto) => (texto === "" ? null : texto))
  .nullable()
  .optional()
  .transform((legenda) => legenda ?? null)

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
      legenda: legendaSchema,
      roteiro: roteiroSchema,
      lugares: lugaresSchema,
      marcados: marcadosSchema,
    },
    { invalid_type_error: "envie as escolhas do post em um objeto" },
  )
  .strict("campo não permitido: o post é montado a partir da viagem")

/** O corpo já validado: legenda limpa ou nula, uuids em minúsculas e sem repetição. */
export type PedidoPost = z.infer<typeof pedidoPostSchema>
/** O que a tela envia. */
export type PedidoPostEntrada = z.input<typeof pedidoPostSchema>
/** As subchaves do roteiro, quando ele está ligado. */
export type EscolhaDoRoteiro = NonNullable<PedidoPost["roteiro"]>
/** Um lugar escolhido, com o endereço que vai para o post. */
export type LugarEscolhido = NonNullable<PedidoPost["lugares"]>[number]
/** `"nenhum"`, `"google"` ou o endereço digitado, já limpo. */
export type EnderecoDoLugar = LugarEscolhido["endereco"]
