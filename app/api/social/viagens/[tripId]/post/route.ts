import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { exigirMembro } from "@/lib/authz/trip"
import { ErroHttp, naoAutenticado, respostaInvalida } from "@/lib/http"
import { pedidoPostSchema } from "@/lib/schemas/post"
import { removerFotosSemFalhar } from "@/lib/social/capa"
import {
  comRecusas,
  conferirRecusas,
  membrosMarcaveis,
  perfisMarcadosDosPosts,
  recusasDaViagem,
  sincronizarMarcacoes,
  validarMarcados,
} from "@/lib/social/marcacoes"
import { temUsername } from "@/lib/social/perfil-visto"
import { postNaoEncontrado, postVisto } from "@/lib/social/post"
import { responder, semUsername } from "@/lib/social/post-http"
import {
  atualizar,
  despublicar,
  lugaresDaProjecao,
  montarPost,
  postDaViagem,
  publicar,
  type ProjecaoComLugares,
} from "@/lib/social/posts"
import { projecaoPublicaDaViagem } from "@/lib/trips/publico"

/**
 * O post da sessão numa viagem (S06-M-publicar-viagem): ver a prévia, as
 * sugestões de marcação e o estado (GET), publicar (POST), atualizar a
 * publicação (PATCH) e despublicar (DELETE).
 *
 * Desde 18/11 (noite) **uma viagem é um post**: o post de viagem é um post
 * comum (tabela `posts`) que leva, além disso, a cópia da viagem. A resposta é
 * o mesmo `PostVisto` do post sem viagem (lib/social/post.ts). As fotos (0 a 3)
 * entram depois, pela rota `./fotos`.
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts: `await params`,
 * `getUser()`, `tripId` no formato de uuid, autorização explícita, zod e
 * `respostaDaFalha`. As decisões do Micael (docs/plans/S06-M-publicar-viagem.md):
 *
 * - **Qualquer membro publica** (`exigirMembro`), e cada um tem o próprio post
 *   da mesma viagem. Publicar de novo é 409 (`unique (trip_id, author_id)`).
 * - **Só publica quem tem username**: 403 `sem_username`. A policy de INSERT
 *   de `posts` recusa o mesmo no banco.
 * - **O post é uma cópia montada no servidor** a partir da projeção pública da
 *   viagem (`projecaoPublicaDaViagem`, domínio da Audrey). Esta rota não lê
 *   `trips`, `itinerary_items`, `places` nem `trip_members`.
 * - **Marcar como no Instagram** (RF09.13, decisão de 18/11, noite): qualquer
 *   perfil com username, menos a sessão (`validarMarcados`: 400
 *   `marcado_invalido`), antes de gravar. Os membros da viagem com username
 *   são só **sugestões** (`marcaveis`). Ao atualizar, quem já está marcado
 *   continua aceito.
 * - **Quem removeu a própria marca não volta** a ser marcado por esta autora
 *   nesta viagem: no GET a sugestão vem com `recusou: true`, e `recusados`
 *   lista os ids de todos que recusaram (membros ou não); marcá-la é 400
 *   `marcado_recusou` com `recusados` (os pedidos que recusaram), antes de
 *   gravar. `social_pode_marcar` recusa o mesmo no
 *   banco.
 * - **Campo da viagem que o post não aceita**: 400 com `codigo`
 *   (`ViagemForaDoPost`), antes de gravar.
 * - **Quem saiu da viagem** não vê a prévia nem atualiza, mas **despublica**:
 *   o DELETE não chama `exigirMembro`; acha o post pelo `postDaViagem`, que só
 *   responde sobre a sessão. As fotos saem do bucket depois do post.
 *
 * **Publicar e marcar não são uma transação.** Se as marcas falharem no POST,
 * o post recém-criado é apagado (sem fotos ainda) e o erro segue. No PATCH o
 * conteúdo novo fica e o erro segue; repetir o PATCH completa as marcas
 * (limite aceito na revisão de 18/11, S1; fechar pede uma função no banco).
 *
 * **O que nunca sai**: `trip_id`, `author_id`, caminho do Storage, `budget`,
 * `currency`, `notes`, coordenadas, `status`, e-mail, a lista de membros (só as
 * sugestões, com username). Toda resposta, inclusive de erro, sai com
 * `Cache-Control: private, no-store`.
 *
 * @RF09.7 publicar viagem expondo só título, destino, datas, legenda, fotos, roteiro e lugares
 * @RF09.13 marcar qualquer perfil com username, com os membros como sugestão, menos quem recusou
 * @RNF02.11 erro do banco não vaza
 */

type Supabase = Awaited<ReturnType<typeof createClient>>
type Contexto = { params: Promise<{ tripId: string }> }

const tripIdSchema = z.string().uuid("viagem inválida")

/** Sessão e `tripId` no formato; `null` em `tripId` quando a URL não traz um uuid. */
async function prepararPedido(contexto: Contexto) {
  const { tripId } = await contexto.params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  const analise = tripIdSchema.safeParse(tripId)
  return { supabase, user, tripId: analise.success ? analise.data.toLowerCase() : null }
}

const viagemInvalida = () => respostaInvalida({ formErrors: ["viagem inválida"], fieldErrors: {} })

/** A prévia campo a campo: o que o diálogo mostra. Itens sem id; lugares com id, para escolher o endereço. */
function previaDaResposta(projecao: ProjecaoComLugares) {
  return {
    title: projecao.title,
    destination: projecao.destination,
    start_date: projecao.start_date,
    end_date: projecao.end_date,
    itens: projecao.itens.map((item) => ({
      title: item.title,
      date: item.date,
      start_time: item.start_time,
      end_time: item.end_time,
      category: item.category,
      location: item.location,
      description: item.description,
    })),
    lugares: lugaresDaProjecao(projecao).map((lugar) => ({
      id: lugar.id,
      name: lugar.name,
      category: lugar.category,
      address: lugar.address,
    })),
  }
}

/** A projeção da viagem, ou 404 quando ela não existe para a sessão. */
async function projecaoOu404(supabase: Supabase, tripId: string): Promise<ProjecaoComLugares> {
  const projecao = await projecaoPublicaDaViagem(supabase, tripId)
  if (!projecao) throw new ErroHttp(404, "Viagem não encontrada")
  return projecao
}

/** O corpo de POST e PATCH; JSON malformado conta como inválido. */
async function lerPedido(request: Request) {
  return pedidoPostSchema.safeParse(await request.json().catch(() => null))
}

/** O `PostVisto` do post recém-gravado pela sessão. */
async function respostaDoPost(supabase: Supabase, postId: string, sessaoId: string) {
  const post = await postVisto(supabase, criarClienteAdmin, postId, sessaoId)
  if (!post) throw postNaoEncontrado()
  return post
}

export async function GET(_request: Request, contexto: Contexto): Promise<NextResponse> {
  return responder(async () => {
    const { supabase, user, tripId } = await prepararPedido(contexto)
    if (!tripId) return viagemInvalida()
    await exigirMembro(supabase, tripId, user.id)

    // As recusas valem para a viagem: são lidas com ou sem post.
    const [projecao, sugestoes, recusas, meu] = await Promise.all([
      projecaoOu404(supabase, tripId),
      membrosMarcaveis(supabase, tripId, criarClienteAdmin),
      recusasDaViagem(supabase, tripId),
      postDaViagem(supabase, tripId),
    ])
    const post = meu ? await postVisto(supabase, criarClienteAdmin, meu.id, user.id) : null

    return NextResponse.json({
      previa: previaDaResposta(projecao),
      marcaveis: comRecusas(sugestoes, recusas).map((pessoa) => ({
        id: pessoa.id,
        username: pessoa.username,
        full_name: pessoa.full_name,
        avatar_url: pessoa.avatar_url,
        recusou: pessoa.recusou,
      })),
      // Todos que recusaram esta autora nesta viagem, membros ou não: a tela
      // desabilita quem aparecer na busca antes do 400.
      recusados: [...recusas].sort(),
      post,
    })
  })
}

export async function POST(request: Request, contexto: Contexto): Promise<NextResponse> {
  return responder(async () => {
    const { supabase, user, tripId } = await prepararPedido(contexto)
    if (!tripId) return viagemInvalida()
    await exigirMembro(supabase, tripId, user.id)
    if (!(await temUsername(supabase, user.id))) throw semUsername("publicar uma viagem")

    const analise = await lerPedido(request)
    if (!analise.success) return respostaInvalida(analise.error.flatten())
    const { titulo, legenda, roteiro, lugares, marcados } = analise.data

    const [projecao, recusas] = await Promise.all([projecaoOu404(supabase, tripId), recusasDaViagem(supabase, tripId)])
    // Antes de gravar: marcado inválido ou que recusou não deixa post publicado pela metade.
    await validarMarcados(supabase, marcados, user.id)
    conferirRecusas(marcados, recusas)

    const copia = montarPost(projecao, { titulo, legenda, roteiro, lugares })
    const post = await publicar(supabase, { tripId, autorId: user.id, copia })

    try {
      await sincronizarMarcacoes(supabase, post.id, user.id, marcados, recusas)
    } catch (erro) {
      // Sem as marcas, desfaz a publicação: tentar de novo não pode esbarrar no 409.
      await despublicar(supabase, post.id).catch((falha: unknown) =>
        console.error("[post da viagem] post sem marcas não foi desfeito", post.id, falha),
      )
      throw erro
    }

    return NextResponse.json({ post: await respostaDoPost(supabase, post.id, user.id) }, { status: 201 })
  })
}

export async function PATCH(request: Request, contexto: Contexto): Promise<NextResponse> {
  return responder(async () => {
    const { supabase, user, tripId } = await prepararPedido(contexto)
    if (!tripId) return viagemInvalida()
    // Quem saiu da viagem para aqui: o post fica como está, e ela só pode despublicar.
    await exigirMembro(supabase, tripId, user.id)

    const analise = await lerPedido(request)
    if (!analise.success) return respostaInvalida(analise.error.flatten())
    const { titulo, legenda, roteiro, lugares, marcados } = analise.data

    const atual = await postDaViagem(supabase, tripId)
    if (!atual) throw postNaoEncontrado()

    const [projecao, jaMarcados, recusas] = await Promise.all([
      projecaoOu404(supabase, tripId),
      perfisMarcadosDosPosts(supabase, [atual.id]),
      recusasDaViagem(supabase, tripId),
    ])
    // Quem já está marcado fica; só os novos passam pela conferência.
    const atuais = new Set((jaMarcados.get(atual.id) ?? []).map((perfil) => perfil.id.toLowerCase()))
    await validarMarcados(
      supabase,
      marcados.filter((id) => !atuais.has(id)),
      user.id,
    )
    conferirRecusas(marcados, recusas)

    const copia = montarPost(projecao, { titulo, legenda, roteiro, lugares })
    const post = await atualizar(supabase, atual.id, copia)
    // Sumiu entre a leitura e a escrita (despublicado em outra aba).
    if (!post) throw postNaoEncontrado()

    await sincronizarMarcacoes(supabase, post.id, user.id, marcados, recusas)
    return NextResponse.json({ post: await respostaDoPost(supabase, post.id, user.id) })
  })
}

export async function DELETE(_request: Request, contexto: Contexto): Promise<NextResponse> {
  return responder(async () => {
    const { supabase, user, tripId } = await prepararPedido(contexto)
    if (!tripId) return viagemInvalida()
    // Sem `exigirMembro`: quem saiu da viagem despublica o próprio post.

    const atual = await postDaViagem(supabase, tripId)
    if (!atual) throw postNaoEncontrado()

    const apagado = await despublicar(supabase, atual.id)
    if (!apagado) throw postNaoEncontrado()

    // O post já saiu e não volta: despublicar valeu. Se o Storage falhar, só o log.
    if (apagado.fotosAnteriores.length > 0) {
      await removerFotosSemFalhar(criarClienteAdmin(), apagado.fotosAnteriores, user.id)
    }
    return NextResponse.json({ ok: true })
  })
}
