/**
 * Limites do perfil, sem dependência nenhuma, para que a tela possa usá-los no
 * `maxLength` sem levar o zod para o bundle do navegador. Os de nome, bio e
 * username espelham as constraints de `profiles` na proposta da S03.
 *
 * @RF02.2 @RF02.5 @RF02.6
 */
export const LIMITE_NOME = 120
export const LIMITE_BIO = 280
export const USERNAME_MIN = 3
export const USERNAME_MAX = 30
