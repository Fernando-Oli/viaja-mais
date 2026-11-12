import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { naoAutenticado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { formatoUsernameSchema } from "@/lib/schemas/perfil"
import { buscarPerfilPorUsername } from "@/lib/social/perfil-visto"
import { removerSeguidor } from "@/lib/social/rede"

/**
 * DELETE: remove `username` dos seguidores da sessão, em silêncio. O removido
 * não é avisado e pode seguir de novo (perfil público) ou pedir de novo
 * (privado): é essa ausência de barreira que mantém a remoção indetectável
 * (catálogo, RF09.9).
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts, sem `exigirMembro` /
 * `exigirDono`: a rede não é recurso de viagem. A regra é "só os próprios
 * seguidores": o followee vem sempre de `getUser()`, e a URL só diz QUEM sai.
 * Não há 403: ninguém alcança os seguidores de outra pessoa nem para ser
 * recusado. A RLS de `follows` é a segunda linha. Só o vínculo aceito sai; uma
 * solicitação pendente se recusa pelas Notificações.
 *
 * Os dois 404 levam um código estável, para a tela saber o que fazer:
 * - `perfil_nao_encontrado`: ninguém usa o username (também quando a pessoa
 *   trocou de username com a lista aberta);
 * - `nao_e_seguidor`: a pessoa existe, mas não segue a sessão (já foi removida
 *   em outra aba, ou deixou de seguir).
 *
 * @RF09.9 remover seguidor · @RNF02.11 erro do banco não vaza
 */

function naoEncontrado(error: string, codigo: "perfil_nao_encontrado" | "nao_e_seguidor") {
  return NextResponse.json({ error, codigo }, { status: 404 })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw naoAutenticado()

    const analise = formatoUsernameSchema.safeParse(username)
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    const perfil = await buscarPerfilPorUsername(supabase, analise.data)
    if (!perfil) return naoEncontrado("Perfil não encontrado", "perfil_nao_encontrado")

    if (!(await removerSeguidor(supabase, user.id, perfil.id))) {
      return naoEncontrado("Essa pessoa não segue você", "nao_e_seguidor")
    }
    return NextResponse.json({ success: true })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
