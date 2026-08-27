import { updateSession } from "@/lib/supabase/proxy"
import type { NextRequest } from "next/server"

/**
 * A partir do Next 16 a convenção `middleware.ts` passou a se chamar `proxy.ts`.
 * Comportamento idêntico; o nome antigo emite aviso de depreciação no build.
 *
 * Aqui só renovamos a sessão do Supabase e barramos o acesso não autenticado.
 * A documentação do Next é explícita: proxy serve para verificação otimista,
 * **não** é solução completa de autorização — quem decide de fato quem pode ver
 * o quê são as políticas de RLS e os `exigir*` de `lib/authz/`.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
}
