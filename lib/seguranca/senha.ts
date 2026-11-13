/**
 * Política de senha da aplicação: no mínimo 8 caracteres, com pelo menos uma
 * letra minúscula, uma maiúscula, um número e um símbolo.
 *
 * É a mesma regra do Auth em produção (painel do Supabase: Minimum password
 * length = 8, Password requirements = "Lowercase, uppercase letters, digits and
 * symbols") e no ambiente local (`supabase/config.toml`:
 * `password_requirements = "lower_upper_letters_digits_symbols"`). Ela fica aqui
 * também para a tela explicar o problema em português antes de enviar: sem
 * isso, a tela aceitava uma senha que o Auth recusava, com erro em inglês.
 *
 * O conjunto de símbolos é o do GoTrue; letras acentuadas não contam como
 * minúscula nem maiúscula para ele, então também não contam aqui.
 *
 * Histórico: até a S10-F o mínimo era 6, sem requisito; a S10-F subiu para 8
 * com letra e número; em 13/11/2026 a regra foi alinhada à de produção.
 *
 * @RNF02.2 senhas armazenadas com hash resistente — e com política mínima
 */

export const TAMANHO_MINIMO_SENHA = 8

const SIMBOLO = /[!@#$%^&*()_+\-=[\]{};'\\:"|<>?,./`~]/

/** Mensagem do primeiro problema da senha, ou `null` se ela atende à política. */
export function problemaDeSenha(senha: string): string | null {
  if (senha.length < TAMANHO_MINIMO_SENHA) return `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`
  if (!/[a-z]/.test(senha)) return "A senha precisa ter pelo menos uma letra minúscula"
  if (!/[A-Z]/.test(senha)) return "A senha precisa ter pelo menos uma letra maiúscula"
  if (!/\d/.test(senha)) return "A senha precisa ter pelo menos um número"
  if (!SIMBOLO.test(senha)) return "A senha precisa ter pelo menos um símbolo, como ! @ # + ou -"
  return null
}

/** Texto curto para o placeholder dos campos de senha. */
export const DICA_SENHA = `Mínimo ${TAMANHO_MINIMO_SENHA} caracteres, com maiúscula, minúscula, número e símbolo`
