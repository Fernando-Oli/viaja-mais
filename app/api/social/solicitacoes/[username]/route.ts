import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { naoAutenticado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { formatoUsernameSchema } from "@/lib/schemas/perfil"
import { buscarPerfilPorUsername } from "@/lib/social/perfil-visto"
import { aprovarSolicitacao, recusarSolicitacao } from "@/lib/social/solicitacoes"

/**
 * A solicitação para seguir que `username` mandou à sessão:
 *
 * - POST: aprova, e a pessoa passa a ser seguidora;
 * - DELETE: recusa, em silêncio. Quem pediu não é avisado e pode pedir de novo.
 *
 * Mesmo molde de app/api/social/solicitacoes/route.ts: o dono vem de
 * `getUser()`, e a URL só diz QUEM pediu, pelo username no formato da leitura.
 * Fora do formato, nenhum perfil pode ter o nome: 400 sem consultar o banco.
 *
 * Os dois 404 levam um código estável, para a tela saber o que fazer:
 * - `perfil_nao_encontrado`: ninguém usa o username, o que acontece também
 *   quando quem pediu troca de username com a lista aberta. A solicitação pode
 *   continuar pendente, com o nome novo, e a tela recarrega a lista;
 * - `sem_pendente`: a pessoa existe, mas não há solicitação dela (nunca pediu,
 *   já foi resolvida em outra aba ou ela cancelou).
 * O código não revela nada além do que a mensagem já dizia.
 *
 * @RF09.4 aprovar ou recusar · @RF13.2 Zona 1 da central · @RNF02.11 erro do banco não vaza
 */

type Contexto = { params: Promise<{ username: string }> }

function naoEncontrada(error: string, codigo: "perfil_nao_encontrado" | "sem_pendente") {
  return NextResponse.json({ error, codigo }, { status: 404 })
}

async function resolver(contexto: Contexto, acao: typeof aprovarSolicitacao) {
  const { username } = await contexto.params
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw naoAutenticado()

    const analise = formatoUsernameSchema.safeParse(username)
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    const perfil = await buscarPerfilPorUsername(supabase, analise.data)
    if (!perfil) return naoEncontrada("Perfil não encontrado", "perfil_nao_encontrado")

    if (!(await acao(supabase, user.id, perfil.id))) return naoEncontrada("Solicitação não encontrada", "sem_pendente")
    return NextResponse.json({ success: true })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function POST(_request: Request, contexto: Contexto) {
  return resolver(contexto, aprovarSolicitacao)
}

export async function DELETE(_request: Request, contexto: Contexto) {
  return resolver(contexto, recusarSolicitacao)
}
