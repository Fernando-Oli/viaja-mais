import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { ErroHttp, naoAutenticado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { SEM_CACHE_COMPARTILHADO } from "@/lib/social/avatar"
import { removerMinhaMarcacao } from "@/lib/social/aba-marcacoes"

/**
 * DELETE: a pessoa marcada remove a própria marca do post `postId`, pela aba
 * "Marcações" do perfil dela. Funciona mesmo quando ela não enxerga o post
 * (ser marcado não abre o post). O autor não é avisado (sem aviso no sino).
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts, sem `exigirMembro` /
 * `exigirDono`: a marca não depende de a pessoa continuar na viagem (decisão
 * de 16/11: ela fica quando a pessoa sai, e é ela quem a remove). A regra é
 * "só a própria marca": quem é marcado vem sempre de `getUser()`, e a URL só
 * diz o post. Não há 403: ninguém alcança a marca de outra pessoa nem para ser
 * recusado; quem não está marcado no post recebe 404, inclusive o autor (ele
 * desmarca pelo diálogo de publicar). A RLS de `post_tags` é a segunda linha.
 *
 * O `postId` passa pelo formato de uuid antes do banco (400), e vai em
 * minúsculas. Toda resposta sai com `Cache-Control: private, no-store`.
 *
 * @RF09.14 remover a própria marca · @RNF02.11 erro do banco não vaza
 */

const postIdSchema = z.string().uuid("publicação inválida")

function semCache(resposta: NextResponse): NextResponse {
  for (const [nome, valor] of Object.entries(SEM_CACHE_COMPARTILHADO)) resposta.headers.set(nome, valor)
  return resposta
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw naoAutenticado()

    const analise = postIdSchema.safeParse(postId)
    if (!analise.success) return semCache(respostaInvalida(analise.error.flatten()))

    if (!(await removerMinhaMarcacao(supabase, analise.data.toLowerCase(), user.id))) {
      throw new ErroHttp(404, "Marcação não encontrada")
    }
    return NextResponse.json({ ok: true }, { headers: SEM_CACHE_COMPARTILHADO })
  } catch (erro) {
    return semCache(respostaDeErro(erro))
  }
}
