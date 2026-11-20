import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { exigirMembro } from "@/lib/authz/trip"
import { ErroHttp, naoAutenticado, respostaInvalida } from "@/lib/http"
import { exigirLimite, LIMITES } from "@/lib/seguranca/limite"
import { MAXIMO_FOTOS } from "@/lib/schemas/post"
import {
  CAMPO_FOTOS,
  conferirTamanhoDeclarado,
  enviarFotos,
  fotosDoFormulario,
  removerFotosSemFalhar,
  reprocessarFotos,
} from "@/lib/social/capa"
import { postNaoEncontrado, postVisto } from "@/lib/social/post"
import { responder } from "@/lib/social/post-http"
import { definirFotos, postDaViagem } from "@/lib/social/posts"

/**
 * PUT /api/social/viagens/[tripId]/post/fotos: troca as fotos do post que a
 * sessão publicou desta viagem — multipart `fotos`, **de 0 a 3**, na ordem do
 * carrossel; substitui todas (0 tira todas, e o post mostra o grafismo). →
 * `{ post: PostVisto }`. Substitui a antiga rota `/post/capa` (a capa virou a
 * 1ª foto, 18/11 noite).
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts: `await params`,
 * `getUser()`, `tripId` no formato (400 sem ir ao banco), `exigirMembro`
 * (quem saiu da viagem não mexe mais no post; a policy de UPDATE exige o
 * mesmo), validação, `respostaDaFalha`. O post é achado por `postDaViagem`,
 * que só responde sobre a sessão (404 sem post).
 *
 * **Ordem**: limite de envios (429, antes de ler o corpo; a regra da foto de
 * perfil, `LIMITES.fotoPerfil`, decisão de 18/11) → tamanho declarado (413) →
 * fotos pelos bytes (400/413) → post (404) → regerar com o sharp (WebP sem
 * EXIF/GPS) → enviar → trocar (condicionada às fotos lidas: outra aba trocou
 * antes, 409) → apagar as anteriores que saíram. Se a troca falhar, as fotos
 * recém-enviadas saem do bucket; se apagar as anteriores falhar, a troca já
 * valeu e a falha só vai ao log.
 *
 * A chave de serviço só envia, apaga e assina, na pasta da sessão. Toda
 * resposta sai com `Cache-Control: private, no-store`; nunca `trip_id`,
 * `author_id` nem caminho do Storage.
 *
 * @RF09.7 fotos do post de viagem · @RNF02.8 limite de envios · @RNF02.11 erro do banco não vaza
 */

type Contexto = { params: Promise<{ tripId: string }> }

const tripIdSchema = z.string().uuid("viagem inválida")

export async function PUT(request: Request, { params }: Contexto): Promise<NextResponse> {
  const { tripId } = await params
  return responder(async () => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw naoAutenticado()
    const analise = tripIdSchema.safeParse(tripId)
    if (!analise.success) return respostaInvalida(analise.error.flatten())
    const viagem = analise.data.toLowerCase()
    await exigirMembro(supabase, viagem, user.id)

    await exigirLimite(supabase, LIMITES.fotoPerfil)

    conferirTamanhoDeclarado(request, MAXIMO_FOTOS)
    const formulario = await request.formData().catch(() => null)
    if (!formulario) throw new ErroHttp(400, "Envie as fotos como formulário (multipart)")
    for (const nome of formulario.keys()) {
      if (nome !== CAMPO_FOTOS) throw new ErroHttp(400, `Campo não permitido: ${nome.slice(0, 40)}`)
    }
    const brutas = await fotosDoFormulario(formulario, { minimo: 0, maximo: MAXIMO_FOTOS })

    const atual = await postDaViagem(supabase, viagem)
    if (!atual) throw postNaoEncontrado()

    // Decodifica só depois de achar o post: um 404 não gasta CPU.
    const regeradas = await reprocessarFotos(brutas)
    const admin = criarClienteAdmin()
    const novas = await enviarFotos(admin, user.id, regeradas)

    let anteriores: string[]
    try {
      const troca = await definirFotos(supabase, atual.id, novas)
      // O post sumiu entre a leitura e a troca (despublicado em outra aba).
      if (!troca) throw postNaoEncontrado()
      anteriores = troca.fotosAnteriores
    } catch (erro) {
      await removerFotosSemFalhar(admin, novas, user.id)
      throw erro
    }

    await removerFotosSemFalhar(
      admin,
      anteriores.filter((caminho) => !novas.includes(caminho)),
      user.id,
    )

    const post = await postVisto(supabase, () => admin, atual.id, user.id)
    if (!post) throw postNaoEncontrado()
    return NextResponse.json({ post })
  })
}
