import { z } from "zod"
import { LIMITE_AVATAR, LIMITE_BIO, LIMITE_NOME, USERNAME_MAX, USERNAME_MIN } from "./perfil-limites"

/**
 * Contratos de entrada das rotas de perfil (domínio Social).
 *
 * Os limites espelham as constraints de `profiles` na proposta da S03 — o banco
 * é a última linha, e isto é a primeira: devolve "nome de usuário reservado" em
 * vez de um 23514 sem explicação. A lista de campos é fechada: o que não está
 * aqui (`id`, `created_at`, `user_id`) é descartado pelo zod e nunca chega ao
 * `.update()`.
 *
 * @RF02.2 nome e avatar · @RF02.5 username · @RF02.6 bio · @RF02.7 público/privado
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
 * Caracteres de formatação Unicode (categoria Cf): espaço de largura zero,
 * inversão de direção do texto e afins. Não aparecem na tela, então deixariam
 * passar um nome "invisível" pelo `min(1)` ou embaralhar a leitura da bio.
 */
const semInvisiveis = (v: string) => v.replace(/\p{Cf}/gu, "")

/** Texto opcional em que vazio significa "apagar": vira nulo, não string vazia. */
const vazioViraNulo = (v: string | null) => (v === "" ? null : v)

/**
 * O avatar é carregado pelo navegador de quem vê o perfil (risco registrado na
 * S03). Não dá para escolher o host por ele, mas dá para recusar o que não tem
 * motivo legítimo: credencial embutida na URL e endereço local ou IP literal.
 */
function hostPublicoSemCredencial(endereco: string) {
  // O zod roda esta checagem mesmo quando o `.url()` anterior já falhou; quem
  // explica "URL inválida" é ele, então aqui não se opina sobre o que nem é URL.
  let url: URL
  try {
    url = new URL(endereco)
  } catch {
    return true
  }
  if (url.username || url.password) return false
  const host = url.hostname
  if (host === "localhost" || host.endsWith(".localhost")) return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) return false
  return true
}

/**
 * Só https: avatar é exibido para outras pessoas, e http no meio de página https
 * vira conteúdo misto. Apara antes de validar, para que só espaços também
 * signifique "apagar".
 */
const avatarSchema = z
  .string()
  .trim()
  .nullable()
  .transform(vazioViraNulo)
  .pipe(
    z
      .string()
      .max(LIMITE_AVATAR, `use até ${LIMITE_AVATAR} caracteres`)
      .url("informe uma URL válida")
      .startsWith("https://", "use um endereço que comece com https://")
      .refine(hostPublicoSemCredencial, "use um endereço público, sem usuário, senha ou IP")
      .nullable(),
  )

export const atualizarPerfilSchema = z
  .object({
    full_name: z
      .string()
      .transform(semInvisiveis)
      .pipe(z.string().trim().min(1, "informe seu nome").max(LIMITE_NOME, `use até ${LIMITE_NOME} caracteres`)),
    avatar_url: avatarSchema,
    username: usernameSchema,
    bio: z
      .string()
      .transform(semInvisiveis)
      .pipe(z.string().trim().max(LIMITE_BIO, `use até ${LIMITE_BIO} caracteres`))
      .nullable()
      .transform(vazioViraNulo),
    is_public: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "envie ao menos um campo para atualizar" })

export type AtualizarPerfil = z.infer<typeof atualizarPerfilSchema>
