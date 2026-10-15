import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { ErroHttp, naoAutenticado, naoEncontrado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { atualizarPerfilSchema } from "@/lib/schemas/perfil"
import { avatarPublico } from "@/lib/social/avatar"

/**
 * Perfil da própria pessoa: ler para o formulário de edição e editar.
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts, com duas diferenças
 * deliberadas:
 *
 *   - Sem `params`: a rota não tem segmento dinâmico.
 *   - Sem `exigirMembro` / `exigirDono`: eles respondem "participa desta
 *     viagem?", e perfil não é recurso de viagem. A regra aqui é "só o próprio
 *     perfil", e ela se garante pela origem do id: ele vem sempre de
 *     `getUser()`, nunca do corpo nem da URL — não existe parâmetro por onde
 *     pedir o perfil de outra pessoa. A RLS de `profiles`
 *     (`profiles_update_proprio`) é a segunda linha.
 *
 * A foto não muda aqui: `avatar_url` guarda o caminho no bucket e só as rotas de
 * /api/social/perfil/foto o alteram. Na resposta, o caminho vira URL pública.
 *
 * Erro do banco nunca volta cru para o cliente: username repetido vira 409 com
 * mensagem própria, e o resto cai no 500 genérico de `respostaDeErro`.
 *
 * @RF02.1 visualizar o próprio perfil · @RF02.2 nome e avatar · @RF02.5 username
 * @RF02.6 bio · @RF02.7 público/privado · @RNF02.11 erro do banco não vaza
 */

const COLUNAS = "id, full_name, avatar_url, username, bio, is_public"

/** Violação de unicidade. Em `profiles`, a única unique editável é o username. */
const VIOLA_UNICIDADE = "23505"

/** O banco guarda o caminho no bucket; a tela recebe a URL pública. */
function paraResposta<T extends { avatar_url: string | null }>(perfil: T): T {
  return { ...perfil, avatar_url: avatarPublico(perfil.avatar_url) }
}

async function usuarioAtual(supabase: Awaited<ReturnType<typeof createClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

export async function GET() {
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)

    const { data: perfil, error } = await supabase.from("profiles").select(COLUNAS).eq("id", user.id).maybeSingle()

    if (error) throw error
    if (!perfil) throw naoEncontrado("Perfil")
    return NextResponse.json({ perfil: paraResposta(perfil) })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)

    // JSON malformado é payload inválido (400), não erro do servidor.
    const corpo = await request.json().catch(() => null)
    const analise = atualizarPerfilSchema.safeParse(corpo)
    if (!analise.success) return respostaInvalida(analise.error.flatten())

    // Campo a campo. `id`, `created_at` e qualquer outra chave não estão no
    // schema e por isso não têm como chegar aqui. Os ausentes ficam undefined e
    // não vão no corpo da requisição ao banco: só muda o que foi enviado.
    const { full_name, username, bio, is_public } = analise.data

    const { data: perfil, error } = await supabase
      .from("profiles")
      .update({ full_name, username, bio, is_public })
      .eq("id", user.id)
      .select(COLUNAS)
      .maybeSingle()

    if (error?.code === VIOLA_UNICIDADE) throw new ErroHttp(409, "Esse nome de usuário já está em uso")
    if (error) throw error
    if (!perfil) throw naoEncontrado("Perfil")
    return NextResponse.json({ perfil: paraResposta(perfil) })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
