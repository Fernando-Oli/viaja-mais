import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { naoAutenticado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { formatoUsernameSchema } from "@/lib/schemas/perfil"
import { SEM_CACHE_COMPARTILHADO } from "@/lib/social/avatar"
import { marcacoesDoPerfil } from "@/lib/social/aba-marcacoes"

/**
 * GET: a aba "Marcações" de `username`, os posts em que a pessoa foi marcada.
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts, sem `exigirMembro` /
 * `exigirDono`: o perfil não é recurso de viagem. A autorização é explícita,
 * como nas listas da rede (perfis/[username]/lista-da-rede.ts): a função
 * `pode_ver_rede` do banco decide se a sessão vê a aba (o próprio dono, quem
 * segue com vínculo aceito, ou perfil público); fora disso, 403 sem listar
 * nada. Cada post segue a RLS de `trip_posts`; ser marcado não abre o post
 * (lib/social/aba-marcacoes.ts).
 *
 * Esta regra (a aba de um perfil privado só abre a quem o segue) vale só
 * aqui, na rota. A RLS de `post_tags` não a repete, por decisão do Micael em
 * 18/11 ("igual ao Instagram"): a marca é visível a quem vê o post, mesmo que a
 * pessoa marcada seja privada, então a lista agregada por pessoa pode ser
 * montada pela Data API por quem já vê aqueles posts. Limite aceito, registrado
 * no plano da S06 e na seção 25.
 *
 * O username da URL passa pelo formato da leitura: fora dele, 400 sem
 * consultar o banco. Ninguém com o username: 404.
 *
 * A resposta, `{ marcacoes, proprio }`, leva links assinados (foto do autor e
 * capa): toda resposta sai com `Cache-Control: private, no-store`.
 *
 * @RF09.14 aba Marcações · @RNF02.11 erro do banco não vaza
 */

function semCache(resposta: NextResponse): NextResponse {
  for (const [nome, valor] of Object.entries(SEM_CACHE_COMPARTILHADO)) resposta.headers.set(nome, valor)
  return resposta
}

export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw naoAutenticado()

    const nome = formatoUsernameSchema.safeParse(username)
    if (!nome.success) return semCache(respostaInvalida(nome.error.flatten()))

    const { marcacoes, proprio } = await marcacoesDoPerfil(supabase, nome.data, user.id, criarClienteAdmin)
    return NextResponse.json({ marcacoes, proprio }, { headers: SEM_CACHE_COMPARTILHADO })
  } catch (erro) {
    return semCache(respostaDeErro(erro))
  }
}
