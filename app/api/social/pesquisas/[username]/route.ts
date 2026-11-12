import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { naoAutenticado, naoEncontrado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { formatoUsernameSchema } from "@/lib/schemas/perfil"
import { buscarPerfilPorUsername } from "@/lib/social/perfil-visto"
import { apagarDoHistorico } from "@/lib/social/pesquisas"

/**
 * DELETE: o X de uma entrada do histórico de pesquisa de quem está na sessão.
 *
 * Mesmo molde de app/api/social/pesquisas/route.ts: o dono vem de `getUser()`,
 * e a URL só diz QUEM sai do histórico, pelo username no formato da leitura.
 * Fora do formato, nenhum perfil pode ter o nome: 400 sem consultar o banco.
 * Tirar quem não está no histórico também é sucesso.
 *
 * @RF09.12 histórico de pesquisa · @RNF02.11 erro do banco não vaza
 */

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
    if (!perfil) throw naoEncontrado("Perfil")

    await apagarDoHistorico(supabase, user.id, perfil.id)
    return NextResponse.json({ success: true })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
