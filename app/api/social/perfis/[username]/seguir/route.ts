import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { ErroHttp, naoAutenticado, naoEncontrado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { formatoUsernameSchema } from "@/lib/schemas/perfil"
import { SEM_CACHE_COMPARTILHADO } from "@/lib/social/avatar"
import { exigirLimite, LIMITES } from "@/lib/seguranca/limite"
import { buscarPerfilPorUsername, montarPerfilVisto, temUsername, type PerfilAlvo } from "@/lib/social/perfil-visto"

/**
 * Seguir (POST) e deixar de seguir (DELETE) o perfil do username.
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts, sem `exigirMembro` /
 * `exigirDono`: perfil não é recurso de viagem. A regra é "só em nome de quem
 * está na sessão": o `follower_id` vem sempre de `getUser()`, nunca do corpo
 * nem da URL, que só diz QUEM seguir. Não há corpo: o único dado de entrada é
 * o username, validado pelo schema. A RLS de `follows` é a segunda linha (só
 * cria vínculo em nome de si mesmo, e as duas partes podem apagá-lo).
 *
 * - POST: perfil público nasce aceito e privado nasce pendente. Quem decide é
 *   o trigger `follows_estado_inicial`, não a rota (RF09.1 e RF09.2). Seguir
 *   de novo não duplica: é o INSERT ... ON CONFLICT DO NOTHING que a migration
 *   da S03 previu, e para o qual os grants foram pensados (o vínculo que já
 *   existe fica como está, pendente ou aceito).
 * - DELETE: deixa de seguir ou cancela a solicitação ainda pendente (RF09.5).
 *   Apagar o que não existe também é sucesso.
 * - O próprio perfil é 400, antes de ir ao banco (que também recusa seguir a
 *   si mesmo, por constraint).
 * - Sem username, a sessão não segue ninguém: 403 com o código `sem_username`
 *   (S05-M-listas, I1; decisão do Micael, como no Instagram). Sem ele, o
 *   seguidor ficaria invisível na lista do dono e não poderia ser removido. A
 *   policy `follows_insert` recusa o mesmo no banco (migration 20261110200043).
 *   Deixar de seguir e cancelar continuam livres.
 *
 * As duas devolvem o perfil atualizado (lib/social/perfil-visto.ts), para a tela
 * mostrar o botão e os contadores novos sem outra requisição.
 *
 * @RF09.1 seguir perfil público · @RF09.2 solicitar perfil privado
 * @RF09.5 deixar de seguir ou cancelar · @RF09.9 sem username, fora da rede
 * @RNF02.11 erro do banco não vaza
 */

type Supabase = Awaited<ReturnType<typeof createClient>>
type Contexto = { params: Promise<{ username: string }> }

async function usuarioAtual(supabase: Supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

/** Sessão, username válido e perfil existente, que não seja o de quem pede. */
async function prepararVinculo(contexto: Contexto, recusaDoProprio: string) {
  const { username } = await contexto.params
  const supabase = await createClient()
  const user = await usuarioAtual(supabase)

  const analise = formatoUsernameSchema.safeParse(username)
  if (!analise.success) return { ok: false, resposta: respostaInvalida(analise.error.flatten()) } as const

  const perfil = await buscarPerfilPorUsername(supabase, analise.data)
  if (!perfil) throw naoEncontrado("Perfil")
  if (perfil.id === user.id) throw new ErroHttp(400, recusaDoProprio)

  return { ok: true, supabase, user, perfil } as const
}

async function responder(supabase: Supabase, quemVe: string, perfil: PerfilAlvo) {
  return NextResponse.json(
    { perfil: await montarPerfilVisto(supabase, criarClienteAdmin, quemVe, perfil) },
    { headers: SEM_CACHE_COMPARTILHADO },
  )
}

export async function POST(_request: Request, contexto: Contexto): Promise<NextResponse> {
  try {
    const preparo = await prepararVinculo(contexto, "Você não pode seguir a si mesmo")
    if (!preparo.ok) return preparo.resposta
    const { supabase, user, perfil } = preparo

    // Seguir perfil privado gera solicitação para a outra pessoa (RNF02.8).
    await exigirLimite(supabase, LIMITES.seguir)

    if (!(await temUsername(supabase, user.id))) {
      return NextResponse.json(
        { error: "Escolha um nome de usuário para seguir alguém", codigo: "sem_username" },
        { status: 403 },
      )
    }

    // Campo a campo, e só os dois que o grant de INSERT aceita: status e datas
    // são do trigger. `ignoreDuplicates` é o ON CONFLICT DO NOTHING; sem ele, o
    // upsert viraria DO UPDATE, que o grant não permite.
    const { error } = await supabase
      .from("follows")
      .upsert(
        { follower_id: user.id, followee_id: perfil.id },
        { onConflict: "follower_id,followee_id", ignoreDuplicates: true },
      )
    if (error) throw error

    return await responder(supabase, user.id, perfil)
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function DELETE(_request: Request, contexto: Contexto): Promise<NextResponse> {
  try {
    const preparo = await prepararVinculo(contexto, "Não existe vínculo com o próprio perfil")
    if (!preparo.ok) return preparo.resposta
    const { supabase, user, perfil } = preparo

    const { error } = await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("followee_id", perfil.id)
    if (error) throw error

    return await responder(supabase, user.id, perfil)
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
