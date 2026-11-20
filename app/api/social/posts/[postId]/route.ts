import { NextResponse, after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { naoAutenticado, respostaInvalida } from "@/lib/http"
import { editarPostSchema, postIdSchema } from "@/lib/schemas/post"
import { removerFotosSemFalhar } from "@/lib/social/capa"
import { esvaziarFilaDeFotos } from "@/lib/social/fila-fotos"
import {
  conferirRecusas,
  perfisMarcadosDosPosts,
  recusasDoPost,
  sincronizarMarcacoes,
  validarMarcados,
} from "@/lib/social/marcacoes"
import {
  atualizarLegenda,
  excluirPost,
  exigirPostDaAutora,
  postNaoEncontrado,
  postVisto,
} from "@/lib/social/post"
import { fotosGravadas } from "@/lib/social/posts"
import { responder } from "@/lib/social/post-http"

/**
 * Um post: ver (GET), editar a legenda e as marcações (PATCH) e excluir
 * (DELETE). Vale para qualquer post, com ou sem viagem.
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts: `await params` →
 * `getUser()` (401) → `postId` no formato de uuid (400, sem ir ao banco) →
 * autorização → zod → campo a campo → `respostaDaFalha`. Sem `exigirMembro`:
 * o post não é recurso de viagem (nem o de viagem — a viagem só é copiada).
 *
 * **Autorização** (lib/social/post.ts):
 * - GET → `{ post, recusados }`: o post da sessão, ou de um perfil cuja rede ela pode ver
 *   (`pode_ver_rede`, a mesma regra da policy de SELECT de `posts`). Fora
 *   disso, **404, igual ao post que não existe**: a resposta não revela que
 *   ele existe. `recusados` (ids) só vem preenchido para a autora: quem
 *   removeu a própria marca deste post ou, no post de viagem, de um post dela
 *   na viagem (`social_recusas_do_post`, que aplica as mesmas recusas que
 *   `social_pode_marcar`; a rota não lê o `trip_id`, ilegível); para os outros,
 *   `[]`.
 * - PATCH e DELETE: só a autora (`exigirPostDaAutora`): 404 quando ela não vê
 *   o post, 403 quando vê e não é a autora. A escrita filtra por `author_id`, e
 *   as policies de UPDATE e DELETE são a segunda linha.
 *
 * **PATCH** (como no Instagram, depois de publicar): `{ legenda?, marcados? }`,
 * estrito; as fotos não mudam (só no post de viagem, pela rota de fotos dele).
 * Quem já está marcado continua aceito; cada marcado novo precisa ser um perfil
 * com username, que não é a autora (400 `marcado_invalido`) e não removeu a
 * própria marca deste post — ou, no post de viagem, de um post desta autora na
 * viagem (400 `marcado_recusou`, pela `social_recusas_do_post`, que cobre as
 * duas). As marcas são trocadas antes da legenda: se o banco recusar uma
 * marca, nada mudou.
 *
 * **DELETE**: apaga o post (as marcas saem em cascata) e depois as fotos do
 * bucket, com a chave de serviço e só na pasta da sessão. Vale para o post de
 * viagem (equivale a despublicar). Se o Storage falhar, o post já saiu: 200, e
 * a falha vai ao log.
 *
 * Toda resposta sai com `Cache-Control: private, no-store`; erros com
 * `{ error, codigo? }`. Nunca `trip_id`, `author_id` nem caminho do Storage.
 *
 * @RF09.17 detalhe e exclusão do post · @RF09.15 editar legenda · @RF09.13 marcar
 * @RNF02.11 erro do banco não vaza
 */

type Contexto = { params: Promise<{ postId: string }> }

/** Sessão e `postId` no formato; `null` em `postId` quando a URL não traz um uuid. */
async function prepararPedido(contexto: Contexto) {
  const { postId } = await contexto.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  const analise = postIdSchema.safeParse(postId)
  return { supabase, user, postId: analise.success ? analise.data : null }
}

const postInvalido = () => respostaInvalida({ formErrors: ["publicação inválida"], fieldErrors: {} })

export async function GET(_request: Request, contexto: Contexto): Promise<NextResponse> {
  return responder(async () => {
    const { supabase, user, postId } = await prepararPedido(contexto)
    if (!postId) return postInvalido()

    const post = await postVisto(supabase, criarClienteAdmin, postId, user.id)
    if (!post) throw postNaoEncontrado()
    // Para a tela de editar: quem não pode ser marcado de novo neste post. Só a
    // autora recebe a lista; para os outros, vazia (a função também responde
    // vazio a quem não é a autora).
    const recusados = post.proprio ? [...(await recusasDoPost(supabase, postId))].sort() : []
    return NextResponse.json({ post, recusados })
  })
}

export async function PATCH(request: Request, contexto: Contexto): Promise<NextResponse> {
  return responder(async () => {
    const { supabase, user, postId } = await prepararPedido(contexto)
    if (!postId) return postInvalido()
    await exigirPostDaAutora(supabase, postId, user.id)

    const analise = editarPostSchema.safeParse(await request.json().catch(() => null))
    if (!analise.success) return respostaInvalida(analise.error.flatten())
    const { legenda, marcados } = analise.data

    if (marcados !== undefined) {
      const [jaMarcados, recusas] = await Promise.all([
        perfisMarcadosDosPosts(supabase, [postId]),
        recusasDoPost(supabase, postId),
      ])
      const atuais = new Set((jaMarcados.get(postId) ?? []).map((perfil) => perfil.id.toLowerCase()))
      // Quem já estava marcado fica; só os novos passam pela conferência.
      await validarMarcados(
        supabase,
        marcados.filter((id) => !atuais.has(id)),
        user.id,
      )
      conferirRecusas(marcados, recusas)
      await sincronizarMarcacoes(supabase, postId, user.id, marcados, recusas)
    }

    if (legenda !== undefined && !(await atualizarLegenda(supabase, postId, user.id, legenda))) {
      // Excluído em outra aba entre a conferência e a escrita.
      throw postNaoEncontrado()
    }

    const post = await postVisto(supabase, criarClienteAdmin, postId, user.id)
    if (!post) throw postNaoEncontrado()
    return NextResponse.json({ post })
  })
}

export async function DELETE(_request: Request, contexto: Contexto): Promise<NextResponse> {
  return responder(async () => {
    const { supabase, user, postId } = await prepararPedido(contexto)
    if (!postId) return postInvalido()
    const linha = await exigirPostDaAutora(supabase, postId, user.id)

    const apagado = await excluirPost(supabase, postId, user.id)
    if (!apagado) throw postNaoEncontrado()

    // O post já saiu e não volta: a falha do Storage só vai ao log.
    const fotos = apagado.fotos.length > 0 ? apagado.fotos : fotosGravadas(linha.photos)
    if (fotos.length > 0) await removerFotosSemFalhar(criarClienteAdmin(), fotos, user.id)
    // Depois da resposta: o trigger anotou as fotos deste post (que já saíram
    // acima, e só deixam a fila) e as de posts que saíram por fora da rota.
    after(() => esvaziarFilaDeFotos(criarClienteAdmin()))
    return NextResponse.json({ ok: true })
  })
}
