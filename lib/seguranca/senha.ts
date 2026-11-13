/**
 * Política de senha da aplicação: no mínimo 8 caracteres, com pelo menos uma
 * letra e um número.
 *
 * É a mesma regra que o Auth aplica (`supabase/config.toml`:
 * `minimum_password_length = 8` e `password_requirements = "letters_digits"`;
 * em produção, Authentication → Policies no painel). Ela fica aqui também para
 * a tela explicar o problema em português antes de enviar, em vez de mostrar o
 * erro em inglês do GoTrue.
 *
 * Até a S10-F o mínimo era 6, sem requisito nenhum.
 *
 * @RNF02.2 senhas armazenadas com hash resistente — e com política mínima
 */

export const TAMANHO_MINIMO_SENHA = 8

/** Mensagem do primeiro problema da senha, ou `null` se ela atende à política. */
export function problemaDeSenha(senha: string): string | null {
  if (senha.length < TAMANHO_MINIMO_SENHA) return `A senha precisa ter pelo menos ${TAMANHO_MINIMO_SENHA} caracteres`
  if (!/\p{L}/u.test(senha)) return "A senha precisa ter pelo menos uma letra"
  if (!/\d/.test(senha)) return "A senha precisa ter pelo menos um número"
  return null
}
