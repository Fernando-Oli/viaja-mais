import { createAuthClient } from "better-auth/react"

/**
 * Cliente de autenticação do navegador, no lugar de `lib/supabase/client.ts`.
 *
 * Sem `baseURL`: as chamadas vão para a própria origem (`/api/auth/*`), e o
 * rewrite do Next as entrega à API. O cookie de sessão é httpOnly, definido pela
 * API — o JavaScript da página nunca vê o token.
 *
 * @RF01.3 autenticação com e-mail e senha
 */
export const authCliente = createAuthClient({ basePath: "/api/auth" })
