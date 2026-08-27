import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { env } from "@/lib/env"

/**
 * Cliente para Server Components e route handlers, autenticado pelo cookie da
 * sessão. Continua usando a chave anon: a RLS vale igual aqui. Para operações
 * que precisam ignorar a RLS, use `lib/supabase/admin.ts`.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Chamado de um Server Component: escrever cookie ali não é permitido.
          // Pode ser ignorado porque o middleware já renova a sessão a cada request.
        }
      },
    },
  })
}
