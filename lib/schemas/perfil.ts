import { z } from "zod"
import { LIMITE_BIO, LIMITE_NOME, USERNAME_MAX, USERNAME_MIN } from "./perfil-limites"

/**
 * Contratos de entrada das rotas de perfil (domínio Social).
 *
 * Os limites espelham as constraints de `profiles` na proposta da S03 — o banco
 * é a última linha, e isto é a primeira: devolve "nome de usuário reservado" em
 * vez de um 23514 sem explicação. A lista de campos é fechada: o que não está
 * aqui (`id`, `created_at`, `user_id`) é descartado pelo zod e nunca chega ao
 * `.update()`.
 *
 * `avatar_url` também fica de fora: a foto só muda pelas rotas de foto
 * (/api/social/perfil/foto), que enviam o arquivo para o Storage e gravam o
 * caminho. Aceitar URL aqui reabriria o avatar apontando para servidor de
 * terceiro (S04-M-foto-perfil).
 *
 * @RF02.2 nome · @RF02.5 username · @RF02.6 bio · @RF02.7 público/privado
 */

export { LIMITE_BIO, LIMITE_NOME }

/**
 * Nomes que não podem virar username: ou imitam a equipe e o produto —
 * `/u/suporte` pedindo senha é golpe pronto —, ou se confundem com caminhos da
 * aplicação. Além da lista, nenhum nome pode conter a marca. Espelha a
 * constraint `profiles_username_reservado` da proposta da S03, que fecha o
 * mesmo caminho para quem grava direto pelo PostgREST; aqui fica a mensagem
 * legível.
 */
export const USERNAMES_RESERVADOS: readonly string[] = [
  "admin",
  "administrador",
  "ajuda",
  "api",
  "auth",
  "configuracoes",
  "dashboard",
  "equipe",
  "feed",
  "perfil",
  "root",
  "settings",
  "sistema",
  "suporte",
]
const MARCA = "viajamais"

const FORMATO_USERNAME = new RegExp(`^[a-z0-9_]{${USERNAME_MIN},${USERNAME_MAX}}$`)

/**
 * O banco só aceita minúsculas; normalizar aqui deixa a pessoa digitar `Ana` e
 * gravar `ana`, em vez de receber erro por uma diferença que ela nem vê.
 */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(FORMATO_USERNAME, `use de ${USERNAME_MIN} a ${USERNAME_MAX} caracteres: letras, números e _`)
  .refine((u) => !USERNAMES_RESERVADOS.includes(u) && !u.includes(MARCA), "esse nome de usuário é reservado")

/**
 * Saem do texto os caracteres de formatação Unicode (categoria Cf: espaço de
 * largura zero, inversão de direção e afins), que não aparecem na tela e
 * embaralhariam a leitura; os de controle (Cc), porque o NUL o Postgres recusa
 * com 22P05 e a rota responderia 500 em vez de 400; e a metade solta de par
 * substituto (Cs), que não é texto. A bio guarda a quebra de linha.
 *
 * Texto sem nenhum caractere visível — só espaços, ignoráveis como o
 * preenchimento hangul U+3164 e o braille em branco U+2800 — vira vazio, como
 * um texto em branco: nome vazio é recusado pelo `min(1)`, bio vazia vira nulo.
 * Os ignoráveis só contam para essa decisão e não saem do texto: entre eles está
 * o seletor de variação U+FE0F, sem o qual ❤️ vira ❤.
 */
const NAO_E_TEXTO = /[\p{Cf}\p{Cc}\p{Cs}]/gu
const NAO_E_TEXTO_MENOS_QUEBRA = /(?!\n)[\p{Cf}\p{Cc}\p{Cs}]/gu
const NADA_VISIVEL = /^[\p{White_Space}\p{Default_Ignorable_Code_Point}⠀]*$/u

const vazioSeInvisivel = (v: string) => (NADA_VISIVEL.test(v) ? "" : v)
const semInvisiveis = (v: string) => vazioSeInvisivel(v.replace(NAO_E_TEXTO, ""))
const semInvisiveisNaBio = (v: string) => vazioSeInvisivel(v.replace(NAO_E_TEXTO_MENOS_QUEBRA, ""))

/** Texto opcional em que vazio significa "apagar": vira nulo, não string vazia. */
const vazioViraNulo = (v: string | null) => (v === "" ? null : v)

export const atualizarPerfilSchema = z
  .object({
    full_name: z
      .string()
      .transform(semInvisiveis)
      .pipe(z.string().trim().min(1, "informe seu nome").max(LIMITE_NOME, `use até ${LIMITE_NOME} caracteres`)),
    username: usernameSchema,
    bio: z
      .string()
      .transform(semInvisiveisNaBio)
      .pipe(z.string().trim().max(LIMITE_BIO, `use até ${LIMITE_BIO} caracteres`))
      .nullable()
      .transform(vazioViraNulo),
    is_public: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "envie ao menos um campo para atualizar" })

export type AtualizarPerfil = z.infer<typeof atualizarPerfilSchema>
