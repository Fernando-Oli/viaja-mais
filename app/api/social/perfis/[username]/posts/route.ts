import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { naoAutenticado, respostaInvalida } from "@/lib/http"
import { formatoUsernameSchema } from "@/lib/schemas/perfil"
import { lerCursor, postsDoPerfil } from "@/lib/social/post"
import { responder } from "@/lib/social/post-http"

/**
 * GET /api/social/perfis/[username]/posts?cursor=<opaco>: a grade
 * "Publicações" do perfil — todos os posts, com ou sem viagem, sem distinguir,
 * do mais recente ao mais antigo, 12 por página.
 *
 * → 200 `{ posts: Array<{ id, foto, quantidade_fotos, descricao }>, proximo }`:
 * `foto` é a 1ª foto assinada (ou nula: post de viagem sem foto, a tela desenha
 * o grafismo com `semente = id`); `descricao` é o `alt` (a legenda, o título
 * da viagem ou "Publicação de @username"); `proximo` é o cursor da página
 * seguinte, ou nulo.
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts, sem `exigirMembro`: o
 * perfil não é recurso de viagem. A autorização é explícita, como na aba
 * Marcações: `pode_ver_rede` decide (a própria pessoa, quem a segue com
 * vínculo aceito, ou perfil público); fora disso, 403 sem listar nada. A
 * policy de SELECT de `posts` é a segunda linha.
 *
 * 400: username fora do formato (sem ir ao banco) ou cursor que não é um dos
 * nossos (`lerCursor`); 404: ninguém com o username; 401 sem sessão. Toda
 * resposta sai com `Cache-Control: private, no-store` (os links assinados
 * valem como senha).
 *
 * @RF09.16 aba Publicações · @RNF02.11 erro do banco não vaza
 */

export async function GET(request: Request, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  return responder(async () => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw naoAutenticado()

    const nome = formatoUsernameSchema.safeParse(username)
    if (!nome.success) return respostaInvalida(nome.error.flatten())

    const texto = new URL(request.url).searchParams.get("cursor")
    const cursor = texto === null ? null : lerCursor(texto)
    if (texto !== null && !cursor) return respostaInvalida({ formErrors: ["cursor inválido"], fieldErrors: {} })

    const { posts, proximo } = await postsDoPerfil(supabase, criarClienteAdmin, nome.data, user.id, cursor)
    return NextResponse.json({
      posts: posts.map((post) => ({
        id: post.id,
        foto: post.foto,
        quantidade_fotos: post.quantidade_fotos,
        descricao: post.descricao,
      })),
      proximo,
    })
  })
}
