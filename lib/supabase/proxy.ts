import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { env } from "@/lib/env"

/**
 * Rotas acessíveis sem sessão. O modelo é allowlist: tudo que não está aqui
 * (nem é a raiz) exige autenticação.
 */
const PUBLICAS = ["/auth"]

/**
 * Rotas de autenticação que um usuário logado ainda precisa acessar.
 *
 * `/auth/reset-password` está aqui porque o link de recuperação do Supabase cria
 * uma sessão antes de o usuário definir a nova senha — redirecioná-lo para o
 * dashboard quebraria justamente o fluxo de troca de senha.
 */
const AUTH_PERMITIDAS_LOGADO = ["/auth/reset-password", "/auth/signout"]

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
      },
    },
  })

  // getUser() valida o token no servidor de auth. getSession() apenas decodifica
  // o cookie e por isso não serve para decidir acesso.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const ehPublica = pathname === "/" || PUBLICAS.some((rota) => pathname.startsWith(rota))

  if (!user && !ehPublica) {
    // Cliente de API recebe 401 em JSON. Antes recebia um 307 para uma página de
    // login em HTML, o que quebra qualquer consumidor programático e mascara a
    // causa real do erro.
    if (pathname.startsWith("/api")) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 })
    }
    const url = request.nextUrl.clone()
    url.pathname = "/auth/login"
    return NextResponse.redirect(url)
  }

  if (user && pathname.startsWith("/auth") && !AUTH_PERMITIDAS_LOGADO.some((r) => pathname.startsWith(r))) {
    const url = request.nextUrl.clone()
    url.pathname = "/dashboard"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
