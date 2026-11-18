import { z } from "zod"
import { MAXIMO_ITENS_NO_POST } from "@/lib/trips/publico"

/**
 * Contrato de entrada de POST e PATCH /api/social/viagens/[tripId]/post:
 * quais itens do itinerário entram no post e quais campos opcionais deles ficam
 * visíveis.
 *
 * O corpo não carrega conteúdo, só escolhas. Título, destino, datas e o texto
 * dos itens saem da projeção pública da viagem (`lib/trips/publico.ts`),
 * montada no servidor; nada do que o cliente escreve vira texto do post. Por
 * isso os dois objetos são estritos: `trip_id`, `author_id`, `title`, `notes`,
 * `cover_path` ou qualquer outra chave no corpo é 400, e não descarte
 * silencioso — quem manda isso está tentando escrever o post por fora, e a
 * resposta deve dizer que não dá.
 *
 * `mostrar` liga os campos opcionais para o post inteiro, e cada chave ausente
 * vale `false`: o que não foi escolhido não sai do grupo. O título do item
 * entra sempre e não tem chave. Notas, coordenadas e preço também não têm, e
 * por isso nunca entram.
 *
 * Itens repetidos são removidos aqui, e não no `montarPost`: o tipo de saída já
 * promete uma lista sem repetição, e quem consome não precisa lembrar de
 * deduplicar. Antes, o uuid vai para minúsculas, o formato em que o Postgres
 * devolve o `id` da projeção, para que `ABC…` e `abc…` contem como o mesmo item
 * e casem com ela. O teto de `MAXIMO_ITENS_NO_POST` vale para o corpo recebido,
 * antes de deduplicar: é limite de tamanho da requisição, o mesmo da checagem
 * de `trip_posts.items` no banco. A ordem enviada não importa; a do post é a da
 * projeção.
 *
 * @RF09.7 publicar viagem com os itens e os campos escolhidos pelo autor
 */

/**
 * Cada chave liga um grupo de colunas do item na cópia:
 * `local` → location · `descricao` → description · `categoria` → category ·
 * `horario` → date, start_time e end_time, juntos.
 */
export const camposVisiveisSchema = z
  .object({
    local: z.boolean({ invalid_type_error: "use verdadeiro ou falso" }).default(false),
    descricao: z.boolean({ invalid_type_error: "use verdadeiro ou falso" }).default(false),
    horario: z.boolean({ invalid_type_error: "use verdadeiro ou falso" }).default(false),
    categoria: z.boolean({ invalid_type_error: "use verdadeiro ou falso" }).default(false),
  })
  .strict("campo que não pode ser mostrado no post")

const semRepetidos = (ids: string[]) => [...new Set(ids.map((id) => id.toLowerCase()))]

export const pedidoPostSchema = z
  .object({
    itens: z
      .array(z.string().uuid("item do itinerário inválido"), {
        required_error: "informe os itens do itinerário",
        invalid_type_error: "informe os itens do itinerário em uma lista",
      })
      .max(MAXIMO_ITENS_NO_POST, `escolha até ${MAXIMO_ITENS_NO_POST} itens`)
      .transform(semRepetidos),
    mostrar: camposVisiveisSchema,
  })
  .strict("campo não permitido: o post é montado a partir da viagem")

/** O corpo já validado: uuids únicos, em minúsculas, e as quatro chaves booleanas. */
export type PedidoPost = z.infer<typeof pedidoPostSchema>
/** Os campos opcionais ligados para o post inteiro; consumido pelo `montarPost`. */
export type CamposVisiveis = z.infer<typeof camposVisiveisSchema>
/** O que a tela pode enviar: em `mostrar`, chave ausente vale `false`. */
export type PedidoPostEntrada = z.input<typeof pedidoPostSchema>
