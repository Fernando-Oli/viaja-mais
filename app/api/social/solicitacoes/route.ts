import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { naoAutenticado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { consultaSolicitacoesSchema } from "@/lib/schemas/solicitacoes"
import { SEM_CACHE_COMPARTILHADO } from "@/lib/social/avatar"
import { contarSolicitacoes, listarSolicitacoes } from "@/lib/social/solicitacoes"

/**
 * GET: as solicitações para seguir que a sessão recebeu e ainda não resolveu
 * (a Zona 1 da central de Notificações), da mais recente para a mais antiga,
 * com o total. Com `?contagem=1`, só o total, que é o que a bolinha do sino
 * mostra: sem lista, sem foto e sem a chave de serviço.
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts, sem `exigirMembro` /
 * `exigirDono`: a solicitação não é recurso de viagem. A regra é "só as
 * próprias": o dono vem sempre de `getUser()`. A RLS de `follows` é a segunda
 * linha. Não há 403: ninguém alcança as solicitações de outra pessoa nem para
 * ser recusado.
 *
 * As duas respostas são da pessoa (e a lista leva links assinados de foto):
 * nada de cache compartilhado.
 *
 * @RF09.3 ver solicitações pendentes · @RF13.2 Zona 1 da central · @RNF02.11 erro do banco não vaza
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw naoAutenticado()

    const analise = consultaSolicitacoesSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    if (analise.data.contagem) {
      const total = await contarSolicitacoes(supabase, user.id)
      return NextResponse.json({ total }, { headers: SEM_CACHE_COMPARTILHADO })
    }

    const { solicitacoes, total } = await listarSolicitacoes(supabase, criarClienteAdmin, user.id)
    return NextResponse.json({ solicitacoes, total }, { headers: SEM_CACHE_COMPARTILHADO })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
