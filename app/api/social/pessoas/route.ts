import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { naoAutenticado, respostaInvalida } from "@/lib/http"
import { buscaPessoasSchema } from "@/lib/schemas/busca"
import { buscarPessoasParaMarcar } from "@/lib/social/pessoas"
import { responder } from "@/lib/social/post-http"

/**
 * GET /api/social/pessoas?q=<texto>: a busca do "Marcar pessoas" ao criar ou
 * editar um post. Devolve `{ pessoas: PessoaNoPost[] }` — `id`, `username`,
 * `full_name` e `avatar_url` assinado —, até 10, só perfis com username e
 * nunca a própria sessão.
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts, sem `params` (o termo vem
 * em `?q=`) e sem `exigirMembro`: buscar não é recurso de viagem. Pelo
 * catálogo (RF09.10), qualquer autenticado busca, e nome, username e foto são
 * visíveis também em perfil privado; o `getUser()` garante a regra, e a RLS de
 * `profiles` é a segunda linha (anon não lê). O termo passa pelo mesmo schema
 * da busca da Rede social; a consulta e o porquê de não reaproveitar a rota de
 * lá estão em lib/social/pessoas.ts.
 *
 * Toda resposta, inclusive de erro, sai com `Cache-Control: private, no-store`.
 *
 * @RF09.13 marcar pessoas · @RNF02.11 erro do banco não vaza
 */

export async function GET(request: Request): Promise<NextResponse> {
  return responder(async () => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw naoAutenticado()

    const analise = buscaPessoasSchema.safeParse(new URL(request.url).searchParams.get("q") ?? "")
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    const encontradas = await buscarPessoasParaMarcar(supabase, criarClienteAdmin, analise.data, user.id)
    const pessoas = encontradas.map((pessoa) => ({
      id: pessoa.id,
      username: pessoa.username,
      full_name: pessoa.full_name,
      avatar_url: pessoa.avatar_url,
    }))
    return NextResponse.json({ pessoas })
  })
}
