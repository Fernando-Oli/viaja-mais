import { createBrowserClient } from "@supabase/ssr"
import { env } from "@/lib/env"

/**
 * Cliente para componentes do navegador. Usa a chave anon, portanto **toda**
 * autorização depende das políticas de RLS — nunca confie em checagem feita aqui.
 * Escrita no banco não passa por este cliente: vai por route handler.
 */
export function createClient() {
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
