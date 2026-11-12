import { updateSession } from "@/lib/supabase/proxy"
import { montarCsp } from "@/lib/seguranca/csp"
import { env, emDesenvolvimento } from "@/lib/env"
import type { NextRequest } from "next/server"

/**
 * A partir do Next 16 a convenção `middleware.ts` passou a se chamar `proxy.ts`.
 * Comportamento idêntico; o nome antigo emite aviso de depreciação no build.
 *
 * Aqui renovamos a sessão do Supabase, barramos o acesso não autenticado e
 * aplicamos a Content-Security-Policy. A documentação do Next é explícita:
 * proxy serve para verificação otimista, **não** é solução completa de
 * autorização — quem decide de fato quem pode ver o quê são as políticas de RLS
 * e os `exigir*` de `lib/authz/`.
 *
 * A CSP mora aqui, e não em `next.config.mjs`, porque depende da URL do
 * Supabase do ambiente, que só se lê por `lib/env.ts`. Ela não muda durante a
 * vida do processo, então é montada uma vez.
 *
 * @RNF02.12 política de segurança de conteúdo
 */
const CSP = montarCsp({ supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL, desenvolvimento: emDesenvolvimento })

export async function proxy(request: NextRequest) {
  // Toda saída de updateSession — a página, o redirect para o login e o 401 em
  // JSON — leva a política.
  const resposta = await updateSession(request)
  resposta.headers.set("Content-Security-Policy", CSP)
  return resposta
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
