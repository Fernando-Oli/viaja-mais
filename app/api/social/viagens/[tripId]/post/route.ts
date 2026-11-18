import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { exigirMembro } from "@/lib/authz/trip"
import { ErroHttp, naoAutenticado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { pedidoPostSchema } from "@/lib/schemas/post"
import { SEM_CACHE_COMPARTILHADO } from "@/lib/social/avatar"
import { assinarCapa, removerCapa } from "@/lib/social/capa"
import { temUsername } from "@/lib/social/perfil-visto"
import {
  atualizar,
  despublicar,
  montarPost,
  postDaViagem,
  publicar,
  type ItemDoPost,
  type PostDoAutor,
} from "@/lib/social/posts"
import { projecaoPublicaDaViagem, type ItemPublico, type ViagemPublica } from "@/lib/trips/publico"

/**
 * O post da sessão numa viagem (S06-M-publicar-viagem): ver a prévia e o
 * estado (GET), publicar (POST), atualizar a publicação (PATCH) e despublicar
 * (DELETE).
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts: `await params`,
 * `getUser()`, autorização explícita, zod e `respostaDeErro`. As decisões do
 * Micael em 11/11 (docs/plans/S06-M-publicar-viagem.md) definem o resto:
 *
 * - **Qualquer membro publica** (`exigirMembro`), e cada um tem o próprio post
 *   da mesma viagem. Publicar de novo é 409 (`unique (trip_id, author_id)`).
 * - **Só publica quem tem username**, porque o post vive em `/u/<username>`:
 *   403 com `codigo: "sem_username"`, como no seguir (S05-M-listas). A policy de
 *   INSERT de `trip_posts` recusa o mesmo no banco.
 * - **O post é uma cópia montada no servidor.** O corpo só escolhe quais itens
 *   entram e quais campos opcionais ficam visíveis; título, destino, datas e o
 *   texto dos itens saem da projeção pública da viagem
 *   (`projecaoPublicaDaViagem`, lib/trips/publico.ts, domínio da Audrey). Esta
 *   rota não lê `trips` nem `itinerary_items`: a projeção é a única janela.
 * - **Quem saiu da viagem** não vê a prévia nem atualiza (o `exigirMembro`
 *   recusa, e a policy de UPDATE também), mas **despublica**: o post é dele, e
 *   a policy de DELETE só exige ser o autor. Por isso o DELETE não chama
 *   `exigirMembro`; ele acha o post pelo `postDaViagem`, que só responde sobre a
 *   sessão.
 *
 * **Ordem das checagens.** A do molde: sessão, autorização, corpo. A
 * autorização aqui é o `exigirMembro` e, no POST, o username (o plano agrupa os
 * dois: "quem pode publicar"). Ela vem antes do zod para que quem não pode
 * publicar receba 403 venha o corpo que vier, sem aprender nada do formato
 * esperado. O zod vem logo depois e antes de qualquer outra leitura: corpo
 * inválido é 400 sem ler a projeção nem o post. JSON malformado também é 400,
 * e não o 500 de um `SyntaxError`.
 *
 * O `tripId` da URL é conferido como uuid antes da autorização: um id fora do
 * formato faria a consulta de `trip_members` falhar no Postgres (22P02), e o
 * erro dela sai como 500 com a mensagem do banco (`papelNaViagem`).
 *
 * **O que nunca sai.** A resposta é montada campo a campo, aqui também, e não
 * repassa o objeto da lib: nenhuma traz `trip_id`, `author_id`, `cover_path`,
 * `budget`, `currency`, `notes`, coordenadas, `status`, e-mail nem membros. Dois
 * posts com o mesmo `trip_id` revelariam quem viajou junto. A prévia leva o `id`
 * de cada item, só para a tela marcar o que entra; ele não vai para o post. A
 * capa vai como URL assinada em `cover_url` (lib/social/capa.ts), e por isso
 * toda resposta, inclusive as de erro, sai com `Cache-Control: private,
 * no-store`.
 *
 * **A chave de serviço** só assina a capa (GET e as respostas com post) e só a
 * apaga ao despublicar, sempre na pasta do autor (`removerCapa` confere). Não lê
 * dado da aplicação; post e prévia vêm com a sessão, sob a RLS.
 *
 * **Despublicar com o arquivo da capa preso.** O post sai primeiro, e a capa
 * depois. Se o Storage falhar ao apagar, o post já não existe e não volta: a
 * resposta é 200 (a pessoa despublicou) e a falha vai para o log. Sobra um
 * arquivo inalcançável no bucket, porque só se assina caminho que está num post;
 * é a mesma pendência registrada para a capa de viagem excluída (plano, bloco 1).
 *
 * Erro do banco nunca sai cru: 23505 vira 409 e 42501 vira 403 em
 * lib/social/posts.ts, e o resto cai no 500 genérico de `respostaDeErro`.
 *
 * @RF09.7 publicar viagem expondo só título, destino, datas, capa e itinerário
 * @RNF02.11 erro do banco não vaza
 */

type Supabase = Awaited<ReturnType<typeof createClient>>
type Contexto = { params: Promise<{ tripId: string }> }

const tripIdSchema = z.string().uuid("viagem inválida")

async function usuarioAtual(supabase: Supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

/** Sessão e `tripId` no formato; `null` em `tripId` quando a URL não traz um uuid. */
async function prepararPedido(contexto: Contexto) {
  const { tripId } = await contexto.params
  const supabase = await createClient()
  const user = await usuarioAtual(supabase)
  const analise = tripIdSchema.safeParse(tripId)
  return { supabase, user, tripId: analise.success ? analise.data : null }
}

/**
 * Executa o método e aplica o cabeçalho sem cache a qualquer resposta, inclusive
 * à de erro de `respostaDeErro`, que não o põe.
 */
async function responder(executar: () => Promise<NextResponse>): Promise<NextResponse> {
  let resposta: NextResponse
  try {
    resposta = await executar()
  } catch (erro) {
    resposta = respostaDeErro(erro)
  }
  for (const [nome, valor] of Object.entries(SEM_CACHE_COMPARTILHADO)) resposta.headers.set(nome, valor)
  return resposta
}

const viagemInvalida = () => respostaInvalida({ formErrors: ["viagem inválida"], fieldErrors: {} })

/** A prévia campo a campo: o que a tela mostra e marca. */
function previaDaResposta(projecao: ViagemPublica) {
  return {
    title: projecao.title,
    destination: projecao.destination,
    start_date: projecao.start_date,
    end_date: projecao.end_date,
    itens: projecao.itens.map((item: ItemPublico) => ({
      id: item.id,
      title: item.title,
      date: item.date,
      start_time: item.start_time,
      end_time: item.end_time,
      category: item.category,
      location: item.location,
      description: item.description,
    })),
  }
}

/** Um item gravado, campo a campo. Campo ausente fica ausente (o JSON omite `undefined`). */
function itemDaResposta(item: ItemDoPost): ItemDoPost {
  return {
    title: item.title,
    date: item.date,
    start_time: item.start_time,
    end_time: item.end_time,
    category: item.category,
    location: item.location,
    description: item.description,
  }
}

/** O post como a tela o recebe: sem `cover_path`, com a capa em URL assinada (ou nula). */
async function postDaResposta(post: PostDoAutor) {
  return {
    id: post.id,
    title: post.title,
    destination: post.destination,
    start_date: post.start_date,
    end_date: post.end_date,
    items: post.items.map(itemDaResposta),
    cover_url: post.cover_path ? await assinarCapa(criarClienteAdmin, post.cover_path) : null,
    created_at: post.created_at,
    updated_at: post.updated_at,
  }
}

/** A projeção da viagem, ou 404 quando ela não existe para a sessão. */
async function projecaoOu404(supabase: Supabase, tripId: string) {
  const projecao = await projecaoPublicaDaViagem(supabase, tripId)
  if (!projecao) throw new ErroHttp(404, "Viagem não encontrada")
  return projecao
}

/** O corpo de POST e PATCH; JSON malformado conta como inválido. */
async function lerPedido(request: Request) {
  return pedidoPostSchema.safeParse(await request.json().catch(() => null))
}

export async function GET(_request: Request, contexto: Contexto): Promise<NextResponse> {
  return responder(async () => {
    const { supabase, user, tripId } = await prepararPedido(contexto)
    if (!tripId) return viagemInvalida()
    await exigirMembro(supabase, tripId, user.id)

    const [projecao, post] = await Promise.all([projecaoOu404(supabase, tripId), postDaViagem(supabase, tripId)])

    return NextResponse.json({
      previa: previaDaResposta(projecao),
      post: post ? await postDaResposta(post) : null,
    })
  })
}

export async function POST(request: Request, contexto: Contexto): Promise<NextResponse> {
  return responder(async () => {
    const { supabase, user, tripId } = await prepararPedido(contexto)
    if (!tripId) return viagemInvalida()
    await exigirMembro(supabase, tripId, user.id)

    if (!(await temUsername(supabase, user.id))) {
      return NextResponse.json(
        { error: "Escolha um nome de usuário para publicar uma viagem", codigo: "sem_username" },
        { status: 403 },
      )
    }

    const analise = await lerPedido(request)
    if (!analise.success) return respostaInvalida(analise.error.flatten())
    const { itens, mostrar } = analise.data

    // A cópia sai só da projeção: o corpo escolhe ids e campos, não escreve texto.
    const copia = montarPost(await projecaoOu404(supabase, tripId), itens, mostrar)
    const post = await publicar(supabase, { tripId, autorId: user.id, copia })

    return NextResponse.json({ post: await postDaResposta(post) }, { status: 201 })
  })
}

export async function PATCH(request: Request, contexto: Contexto): Promise<NextResponse> {
  return responder(async () => {
    const { supabase, user, tripId } = await prepararPedido(contexto)
    if (!tripId) return viagemInvalida()
    // Quem saiu da viagem para aqui: o post fica como está, e ele só pode despublicar.
    await exigirMembro(supabase, tripId, user.id)

    const analise = await lerPedido(request)
    if (!analise.success) return respostaInvalida(analise.error.flatten())
    const { itens, mostrar } = analise.data

    const atual = await postDaViagem(supabase, tripId)
    if (!atual) throw new ErroHttp(404, "Publicação não encontrada")

    const copia = montarPost(await projecaoOu404(supabase, tripId), itens, mostrar)
    const post = await atualizar(supabase, atual.id, copia)
    // Sumiu entre a leitura e a escrita (despublicado em outra aba).
    if (!post) throw new ErroHttp(404, "Publicação não encontrada")

    return NextResponse.json({ post: await postDaResposta(post) })
  })
}

export async function DELETE(_request: Request, contexto: Contexto): Promise<NextResponse> {
  return responder(async () => {
    const { supabase, user, tripId } = await prepararPedido(contexto)
    if (!tripId) return viagemInvalida()
    // Sem `exigirMembro`: quem saiu da viagem despublica o próprio post.
    // `postDaViagem` só acha o post da sessão, e a policy de DELETE só exige ser o autor.

    const atual = await postDaViagem(supabase, tripId)
    if (!atual) throw new ErroHttp(404, "Publicação não encontrada")

    const apagado = await despublicar(supabase, atual.id)
    if (!apagado) throw new ErroHttp(404, "Publicação não encontrada")

    if (apagado.capaAnterior) {
      try {
        const removida = await removerCapa(criarClienteAdmin(), apagado.capaAnterior, user.id)
        if (!removida) console.error("[post da viagem] capa não apagada", apagado.capaAnterior)
      } catch (erro) {
        // O post já saiu e não volta: despublicar valeu. Só o arquivo ficou.
        console.error("[post da viagem] capa não apagada", apagado.capaAnterior, erro)
      }
    }

    return NextResponse.json({ post: null })
  })
}
