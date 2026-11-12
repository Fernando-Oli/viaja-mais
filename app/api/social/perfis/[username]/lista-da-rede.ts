import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { naoAutenticado, naoEncontrado, respostaDeErro, respostaInvalida, semPermissao } from "@/lib/http"
import { formatoUsernameSchema } from "@/lib/schemas/perfil"
import { consultaRedeSchema } from "@/lib/schemas/rede"
import { SEM_CACHE_COMPARTILHADO } from "@/lib/social/avatar"
import { buscarPerfilPorUsername } from "@/lib/social/perfil-visto"
import { listarRede, podeVerRede, type Lado } from "@/lib/social/rede"

/**
 * O GET das duas listas da rede de um perfil, que os `route.ts` de
 * `seguidores/` e `seguindo/` chamam: quem segue `username` e quem `username`
 * segue, 20 por vez, do vínculo mais recente para o mais antigo.
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts, sem `exigirMembro` /
 * `exigirDono`: a rede não é recurso de viagem. A autorização é explícita aqui,
 * pela função `pode_ver_rede` do banco: o próprio dono, quem segue com vínculo
 * aceito, ou perfil público. Fora disso, 403, sem listar ninguém. A RLS de
 * `follows` é a segunda linha, e sozinha não bastaria: ela mostra um vínculo a
 * quem pode ver a rede de qualquer um dos lados (ver o plano, bloco 1).
 *
 * O username da URL e o cursor passam pelo formato da leitura: fora dele, 400
 * sem consultar o banco. Um cursor que não acha mais o vínculo (a pessoa deixou
 * a lista) dá 400 com o código `cursor_invalido`, para a tela recomeçar.
 *
 * A resposta leva as pessoas campo a campo, sem `id`, o cursor da próxima página
 * e se a lista é da própria sessão (a tela mostra Remover só aí). Leva links
 * assinados de foto: nada de cache compartilhado.
 *
 * @RF09.6 listas de seguidores e de seguindo · @RNF02.11 erro do banco não vaza
 */

type Contexto = { params: Promise<{ username: string }> }

export async function responderListaDaRede(request: Request, contexto: Contexto, lado: Lado) {
  const { username } = await contexto.params
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw naoAutenticado()

    const nome = formatoUsernameSchema.safeParse(username)
    if (!nome.success) return respostaInvalida(nome.error.flatten())
    const consulta = consultaRedeSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!consulta.success) return respostaInvalida(consulta.error.flatten())

    const perfil = await buscarPerfilPorUsername(supabase, nome.data)
    if (!perfil) throw naoEncontrado("Perfil")
    if (!(await podeVerRede(supabase, perfil.id))) throw semPermissao("a rede deste perfil")

    const pagina = await listarRede(supabase, criarClienteAdmin, perfil.id, lado, consulta.data.cursor)
    if (!pagina) {
      return NextResponse.json({ error: "A lista mudou; recarregue", codigo: "cursor_invalido" }, { status: 400 })
    }
    return NextResponse.json(
      { pessoas: pagina.pessoas, proximo: pagina.proximo, proprio: perfil.id === user.id },
      { headers: SEM_CACHE_COMPARTILHADO },
    )
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
