import { controlarAcesso } from "@/lib/sessao/proxy"
import { montarCsp } from "@/lib/seguranca/csp"
import { env, envServidor, emDesenvolvimento } from "@/lib/env"
import type { NextRequest } from "next/server"

/**
 * A partir do Next 16 a convenção `middleware.ts` passou a se chamar `proxy.ts`.
 * Comportamento idêntico; o nome antigo emite aviso de depreciação no build.
 *
 * Aqui barramos o acesso não autenticado às telas (checagem otimista pelo
 * cookie do Better Auth) e aplicamos a Content-Security-Policy. A documentação do Next é explícita:
 * proxy serve para verificação otimista, **não** é solução completa de
 * autorização — quem decide de fato quem pode ver o quê é a API, com os
 * `exigir*` de `lib/authz/` e as políticas de RLS.
 *
 * A CSP mora aqui, e não em `next.config.mjs`, porque depende da URL do
 * Supabase do ambiente, que só se lê por `lib/env.ts`. Ela não muda durante a
 * vida do processo, então é montada uma vez.
 *
 * @RNF02.12 política de segurança de conteúdo
 */
const CSP = montarCsp({
  supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  armazenamentoUrl: envServidor().ARMAZENAMENTO_URL_PUBLICA,
  desenvolvimento: emDesenvolvimento,
})

export async function proxy(request: NextRequest) {
  // Toda saída — a página e o redirect para o login — leva a política.
  const resposta = await controlarAcesso(request)
  resposta.headers.set("Content-Security-Policy", CSP)
  return resposta
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
