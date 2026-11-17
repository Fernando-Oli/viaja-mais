import "server-only"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { envServidor } from "@/lib/env"

/**
 * Leitura da API a partir de server components, no lugar do cliente do
 * Supabase no servidor (`lib/supabase/server.ts`).
 *
 * A página repassa o cookie de sessão do navegador e a API decide tudo:
 * sessão, autorização e RLS. A página não fala com o banco — é o mesmo caminho
 * que um aplicativo móvel usaria, e o único lugar onde a regra mora é a API.
 *
 * Os desfechos viram navegação, como as páginas faziam antes:
 *   - 401 → tela de login;
 *   - 403 e 404 → `notFound()`, para não revelar se a viagem existe;
 *   - outro erro → exceção, que cai no `error.tsx` do painel.
 */
export async function lerDaApi<T>(caminho: string): Promise<T> {
  const resposta = await chamarApi(caminho)
  if (resposta.status === 401) redirect("/auth/login")
  if (resposta.status === 403 || resposta.status === 404) notFound()
  if (!resposta.ok) throw new Error(`A API respondeu ${resposta.status} em ${caminho}`)
  return (await resposta.json()) as T
}

/**
 * Usuário da sessão, para o que a página decide sozinha (mostrar o botão do
 * dono, marcar "você" numa lista). Sem sessão, vai para o login. A decisão de
 * acesso continua sendo da API: isto só ajusta a tela.
 */
export async function usuarioDaSessao(): Promise<{ id: string; email: string }> {
  const sessao = await lerDaApi<{ user: { id: string; email: string } } | null>("/api/auth/get-session")
  if (!sessao?.user) redirect("/auth/login")
  return { id: sessao.user.id, email: sessao.user.email }
}

async function chamarApi(caminho: string): Promise<Response> {
  const base = envServidor().API_URL_INTERNA.replace(/\/$/, "")
  const cookie = (await cookies()).toString()
  return fetch(`${base}${caminho}`, {
    headers: cookie ? { cookie } : {},
    // Dado por usuário: nunca do cache de dados do Next.
    cache: "no-store",
  })
}
