import { getSessionCookie } from "better-auth/cookies"
import { NextResponse, type NextRequest } from "next/server"
import { envServidor } from "@/lib/env"

/**
 * Controle de acesso das telas, no `proxy.ts`. Substitui
 * `lib/supabase/proxy.ts`.
 *
 * É checagem **otimista**, como a documentação do Next pede para o proxy: só
 * olha se o cookie de sessão existe, sem consultar o banco a cada navegação.
 * Quem decide de verdade é a API, que valida a sessão em toda requisição
 * (`api/http/sessao.ts`). Um cookie forjado passa daqui e recebe 401 lá.
 *
 * `/api/*` não é tocado: vai direto para a API pelo rewrite, e ela responde 401
 * em JSON quando precisa.
 */

/** Rotas acessíveis sem sessão. Allowlist: o resto exige login. */
const PUBLICAS = ["/auth"]

/**
 * Rotas de autenticação que um usuário logado ainda precisa acessar: trocar a
 * senha pelo link do e-mail e sair.
 */
const AUTH_PERMITIDAS_LOGADO = ["/auth/reset-password", "/auth/signout"]

export const PREFIXO_COOKIE = "avori"

/**
 * A sessão é válida? Só usado ao entrar em /auth/*, para decidir se manda para o
 * painel. Ali a checagem otimista não basta: um cookie velho prenderia a pessoa
 * fora da tela de login, redirecionada para um painel que responde 401.
 */
async function sessaoValida(request: NextRequest): Promise<boolean> {
  try {
    const resposta = await fetch(`${envServidor().API_URL_INTERNA}/api/auth/get-session`, {
      headers: { cookie: request.headers.get("cookie") ?? "" },
      cache: "no-store",
    })
    if (!resposta.ok) return false
    return (await resposta.json()) !== null
  } catch {
    return false
  }
}

export async function controlarAcesso(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl
  if (pathname.startsWith("/api")) return NextResponse.next({ request })

  const temCookie = Boolean(getSessionCookie(request, { cookiePrefix: PREFIXO_COOKIE }))
  const ehPublica = pathname === "/" || PUBLICAS.some((rota) => pathname.startsWith(rota))

  if (!temCookie && !ehPublica) {
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  if (
    temCookie &&
    pathname.startsWith("/auth") &&
    !AUTH_PERMITIDAS_LOGADO.some((r) => pathname.startsWith(r)) &&
    (await sessaoValida(request))
  ) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return NextResponse.next({ request })
}
