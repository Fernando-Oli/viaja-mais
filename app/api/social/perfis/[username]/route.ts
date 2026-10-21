import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { naoAutenticado, naoEncontrado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { formatoUsernameSchema } from "@/lib/schemas/perfil"
import { SEM_CACHE_COMPARTILHADO } from "@/lib/social/avatar"
import { buscarPerfilPorUsername, montarPerfilVisto } from "@/lib/social/perfil-visto"

/**
 * O perfil de outra pessoa, pelo username: a página /u/[username] da aba Rede
 * social, aberta pelos resultados da busca.
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts, com uma diferença
 * deliberada: sem `exigirMembro` / `exigirDono`. Perfil não é recurso de
 * viagem, e pelo catálogo (RF02) os dados básicos são visíveis a qualquer
 * autenticado, também em perfil privado. Não existe perfil que um autenticado
 * não possa ver, e por isso não há 403. A regra é "só autenticado", garantida
 * pelo `getUser()`, e a RLS de `profiles` é a segunda linha (anon não lê).
 *
 * O username da URL passa pelo formato da edição. A lista de reservados fica
 * de fora: ela é regra de escrita. Fora do formato, nenhum perfil pode ter o
 * nome: 400 sem consultar o banco. Maiúsculas viram minúsculas.
 *
 * A resposta é a de lib/social/perfil-visto.ts: dados básicos, vínculo de quem
 * vê e contadores (da função `contar_rede`, com a sessão), sem o `id` como
 * campo, e sem cache compartilhado (leva o link assinado da foto).
 *
 * @RF02.8 perfil de outro usuário · @RNF02.11 erro do banco não vaza
 */

async function usuarioAtual(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

export async function GET(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)

    const analise = formatoUsernameSchema.safeParse(username)
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    const perfil = await buscarPerfilPorUsername(supabase, analise.data)
    if (!perfil) throw naoEncontrado("Perfil")

    return NextResponse.json(
      { perfil: await montarPerfilVisto(supabase, criarClienteAdmin, user.id, perfil) },
      { headers: SEM_CACHE_COMPARTILHADO },
    )
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
