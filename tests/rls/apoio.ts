import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js"
import { exigirLocal, variavelObrigatoria } from "./guarda-ambiente"
import { SENHA_TESTE } from "../fixtures/usuarios"

/**
 * O que todo teste de RLS precisa: o endereço do stack local, a chave anon, a
 * conexão direta com o banco e um jeito de logar como um usuário de verdade.
 *
 * Antes, cada um dos 17 arquivos de tests/rls/ declarava as próprias cópias.
 * `exigirLocal` continua valendo para os três endereços: estes testes escrevem
 * no banco, e um alvo que não seja local é recusado antes de qualquer coisa.
 */

export const API = exigirLocal(variavelObrigatoria("API_URL"), "API_URL")
export const CHAVE = variavelObrigatoria("ANON_KEY")
export const CONEXAO = exigirLocal(variavelObrigatoria("DATABASE_URL"), "DATABASE_URL")

/** Cliente sem sessão — o "visitante", ou a base para logar. */
export function novoCliente(chave = CHAVE): SupabaseClient {
  return createClient(API, chave, { auth: { persistSession: false, autoRefreshToken: false } })
}

/**
 * Loga pelo GoTrue, como o navegador faz, e devolve o cliente com a sessão.
 * `id` é atalho para `usuario.id`.
 */
export async function logar(email: string, senha: string = SENHA_TESTE) {
  const cliente = novoCliente()
  const { data, error } = await cliente.auth.signInWithPassword({ email, password: senha })
  if (error) throw new Error(`falha ao logar como ${email}: ${error.message}`)
  const usuario = data.user as User
  return { cliente, usuario, id: usuario.id }
}
