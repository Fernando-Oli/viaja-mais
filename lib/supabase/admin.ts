import { createClient as criarClienteSupabase } from "@supabase/supabase-js"
import { env, chaveServiceRole } from "@/lib/env"

/**
 * Cliente de service role — **ignora toda a RLS**.
 *
 * Regra 4 do `CLAUDE.md`: este é o único módulo do repositório autorizado a ler
 * `SUPABASE_SERVICE_ROLE_KEY`, e só pode ser usado dentro de route handler.
 * Nunca em componente, nunca com prefixo `NEXT_PUBLIC_`.
 *
 * Use-o apenas para o que a RLS não tem como resolver — hoje, exclusivamente a
 * API administrativa do GoTrue (`auth.admin.*`), que exige a chave de serviço.
 * Para ler ou escrever dados da aplicação, use `lib/supabase/server.ts`: lá a
 * RLS continua valendo, que é o que queremos.
 */
export function criarClienteAdmin() {
  // Erro de programação, não de configuração: se isto rodar no navegador, a
  // chave foi para o bundle. Falhar alto é o comportamento certo.
  if (typeof window !== "undefined") {
    throw new Error("criarClienteAdmin() foi chamada no navegador. A chave de serviço nunca pode sair do servidor.")
  }

  return criarClienteSupabase(env.NEXT_PUBLIC_SUPABASE_URL, chaveServiceRole(), {
    auth: {
      // Cliente de uma chamada só: não há usuário para manter logado, e
      // persistir sessão em processo de servidor vazaria estado entre
      // requisições.
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
