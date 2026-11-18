import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { exigirMembro } from "@/lib/authz/trip"
import { ErroHttp, naoAutenticado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { pedidoPostSchema } from "@/lib/schemas/post"
import { SEM_CACHE_COMPARTILHADO } from "@/lib/social/avatar"
import { assinarCapa, removerCapa } from "@/lib/social/capa"
import {
  MARCADO_INVALIDO,
  conferirMarcados,
  marcadosDoPost,
  membrosMarcaveis,
  sincronizarMarcacoes,
  type PessoaMarcada,
} from "@/lib/social/marcacoes"
import { temUsername } from "@/lib/social/perfil-visto"
import {
  atualizar,
  despublicar,
  lugaresDaProjecao,
  montarPost,
  postDaViagem,
  publicar,
  type ItemDoPost,
  type LugarDoPost,
  type PostDoAutor,
  type ProjecaoComLugares,
} from "@/lib/social/posts"
import { projecaoPublicaDaViagem } from "@/lib/trips/publico"

/**
 * O post da sessão numa viagem (S06-M-publicar-viagem): ver a prévia, os
 * marcáveis e o estado (GET), publicar (POST), atualizar a publicação (PATCH) e
 * despublicar (DELETE).
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts: `await params`,
 * `getUser()`, autorização explícita, zod e `respostaDeErro`. As decisões do
 * Micael (docs/plans/S06-M-publicar-viagem.md; as de 18/11 seguem a prévia do
 * Fernando) definem o resto:
 *
 * - **Qualquer membro publica** (`exigirMembro`), e cada um tem o próprio post
 *   da mesma viagem. Publicar de novo é 409 (`unique (trip_id, author_id)`).
 * - **Só publica quem tem username**, porque o post vive em `/u/<username>`:
 *   403 com `codigo: "sem_username"`, como no seguir (S05-M-listas). A policy de
 *   INSERT de `trip_posts` recusa o mesmo no banco.
 * - **O post é uma cópia montada no servidor.** O corpo escolhe a legenda, se o
 *   roteiro e os lugares entram (e como), e quem é marcado; título, destino,
 *   datas, itens e lugares saem da projeção pública da viagem
 *   (`projecaoPublicaDaViagem`, lib/trips/publico.ts, domínio da Audrey). Esta
 *   rota não lê `trips`, `itinerary_items`, `places` nem `trip_members`: a
 *   projeção e a função `social_membros_marcaveis` são as únicas janelas.
 * - **Marcar** (RF09.13): só membros da viagem com username, menos a sessão
 *   (`membrosMarcaveis`). Um marcado fora dessa lista é 400 com
 *   `codigo: "marcado_invalido"`, **antes de gravar** o post. Ao atualizar,
 *   quem já estava marcado e saiu da viagem continua aceito: a marca é dele
 *   para remover (decisão de 16/11). A policy de `post_tags` é a segunda linha.
 * - **Quem saiu da viagem** não vê a prévia nem atualiza (o `exigirMembro`
 *   recusa, e a policy de UPDATE também), mas **despublica**: o post é dele, e
 *   a policy de DELETE só exige ser o autor. Por isso o DELETE não chama
 *   `exigirMembro`; ele acha o post pelo `postDaViagem`, que só responde sobre a
 *   sessão. As marcas saem junto, em cascata.
 *
 * **Ordem das checagens.** A do molde: sessão, autorização, corpo. A
 * autorização aqui é o `exigirMembro` e, no POST, o username. Ela vem antes do
 * zod para que quem não pode publicar receba 403 venha o corpo que vier, sem
 * aprender nada do formato esperado. O zod vem logo depois e antes de qualquer
 * outra leitura: corpo inválido é 400 sem ler a projeção nem o post. JSON
 * malformado também é 400, e não o 500 de um `SyntaxError`.
 *
 * O `tripId` da URL é conferido como uuid antes da autorização: um id fora do
 * formato faria a consulta de `trip_members` falhar no Postgres (22P02).
 *
 * **Publicar e marcar não são uma transação.** O post é gravado e depois as
 * marcas. Se as marcas falharem no POST, o post recém-criado é apagado (sem
 * capa ainda, não há arquivo a limpar) e o erro segue: a pessoa tenta de novo
 * sem esbarrar no 409. No PATCH o conteúdo novo fica e o erro segue; repetir o
 * PATCH completa as marcas.
 *
 * **O que nunca sai.** A resposta é montada campo a campo, aqui também, e não
 * repassa o objeto da lib: nenhuma traz `trip_id`, `author_id`, `cover_path`,
 * `budget`, `currency`, `notes`, coordenadas, `status`, e-mail nem a lista de
 * membros (só os marcáveis, com username). A prévia não leva o `id` dos itens
 * (o roteiro entra inteiro) e leva o dos lugares, para a tela escolher o
 * endereço de cada um; nenhum id vai para o post. A capa e as fotos vão como
 * URL assinada, e por isso toda resposta, inclusive as de erro, sai com
 * `Cache-Control: private, no-store`.
 *
 * **A chave de serviço** só assina capa e fotos, e só apaga a capa ao
 * despublicar, sempre na pasta do autor (`removerCapa` confere). Não lê dado da
 * aplicação; post, prévia e marcas vêm com a sessão, sob a RLS.
 *
 * **Despublicar com o arquivo da capa preso.** O post sai primeiro, e a capa
 * depois. Se o Storage falhar ao apagar, o post já não existe e não volta: a
 * resposta é 200 (a pessoa despublicou) e a falha vai para o log.
 *
 * Erro do banco nunca sai cru: 23505 vira 409 e 42501 vira 403 nas libs, e o
 * resto cai no 500 genérico de `respostaDeErro` — inclusive o `ErroHttp` 500
 * de `papelNaViagem`, que carrega a mensagem do Postgres.
 *
 * @RF09.7 publicar viagem expondo só título, destino, datas, legenda, capa, roteiro e lugares
 * @RF09.13 marcar quem viajou junto
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
 * Erro em resposta. `ErroHttp` 5xx (o de `papelNaViagem` leva a mensagem do
 * banco) vira o 500 genérico; o `marcado_invalido` ganha a mensagem legível e o
 * código, no formato do `sem_username`.
 */
function respostaDaFalha(erro: unknown): NextResponse {
  if (erro instanceof ErroHttp && erro.status >= 500) {
    return respostaDeErro(new Error("[post da viagem] erro interno", { cause: erro }))
  }
  if (erro instanceof ErroHttp && erro.status === 400 && erro.message === MARCADO_INVALIDO) {
    return NextResponse.json(
      { error: "Só dá para marcar quem viajou com você e tem nome de usuário", codigo: MARCADO_INVALIDO },
      { status: 400 },
    )
  }
  return respostaDeErro(erro)
}

/**
 * Executa o método e aplica o cabeçalho sem cache a qualquer resposta, inclusive
 * à de erro.
 */
async function responder(executar: () => Promise<NextResponse>): Promise<NextResponse> {
  let resposta: NextResponse
  try {
    resposta = await executar()
  } catch (erro) {
    resposta = respostaDaFalha(erro)
  }
  for (const [nome, valor] of Object.entries(SEM_CACHE_COMPARTILHADO)) resposta.headers.set(nome, valor)
  return resposta
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

/** Uma pessoa marcável ou marcada, campo a campo. */
function pessoaDaResposta(pessoa: PessoaMarcada): PessoaMarcada {
  return { id: pessoa.id, username: pessoa.username, full_name: pessoa.full_name, avatar_url: pessoa.avatar_url }
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

/** Um lugar gravado, campo a campo. */
function lugarDaResposta(lugar: LugarDoPost): LugarDoPost {
  return { name: lugar.name, category: lugar.category, address: lugar.address }
}

/** O post como a tela o recebe: sem `cover_path`, com a capa em URL assinada (ou nula) e os marcados. */
async function postDaResposta(post: PostDoAutor, marcados: PessoaMarcada[]) {
  return {
    id: post.id,
    title: post.title,
    destination: post.destination,
    start_date: post.start_date,
    end_date: post.end_date,
    caption: post.caption,
    items: post.items.map(itemDaResposta),
    places: post.places.map(lugarDaResposta),
    cover_url: post.cover_path ? await assinarCapa(criarClienteAdmin, post.cover_path) : null,
    created_at: post.created_at,
    updated_at: post.updated_at,
    marcados: marcados.map(pessoaDaResposta),
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

const idsDe = (pessoas: PessoaMarcada[]) => pessoas.map((pessoa) => pessoa.id)

export async function GET(_request: Request, contexto: Contexto): Promise<NextResponse> {
  return responder(async () => {
    const { supabase, user, tripId } = await prepararPedido(contexto)
    if (!tripId) return viagemInvalida()
    await exigirMembro(supabase, tripId, user.id)

    const [projecao, marcaveis, post] = await Promise.all([
      projecaoOu404(supabase, tripId),
      membrosMarcaveis(supabase, tripId, criarClienteAdmin),
      postDaViagem(supabase, tripId),
    ])
    const marcados = post ? await marcadosDoPost(supabase, post.id, criarClienteAdmin) : []

    return NextResponse.json({
      previa: previaDaResposta(projecao),
      marcaveis: marcaveis.map(pessoaDaResposta),
      post: post ? await postDaResposta(post, marcados) : null,
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
    const { legenda, roteiro, lugares, marcados } = analise.data

    const [projecao, marcaveis] = await Promise.all([
      projecaoOu404(supabase, tripId),
      membrosMarcaveis(supabase, tripId, criarClienteAdmin),
    ])
    // Antes de gravar: um marcado inválido não deixa post publicado pela metade.
    const permitidos = idsDe(marcaveis)
    conferirMarcados(marcados, permitidos)

    // A cópia sai só da projeção: o corpo escolhe, e só escreve a legenda e o endereço digitado.
    const copia = montarPost(projecao, { legenda, roteiro, lugares })
    const post = await publicar(supabase, { tripId, autorId: user.id, copia })

    try {
      await sincronizarMarcacoes(supabase, post.id, user.id, marcados, permitidos)
    } catch (erro) {
      // Sem as marcas, desfaz a publicação: tentar de novo não pode esbarrar no 409.
      await despublicar(supabase, post.id).catch((falha: unknown) =>
        console.error("[post da viagem] post sem marcas não foi desfeito", post.id, falha),
      )
      throw erro
    }

    const marcadosGravados = await marcadosDoPost(supabase, post.id, criarClienteAdmin)
    return NextResponse.json({ post: await postDaResposta(post, marcadosGravados) }, { status: 201 })
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
    const { legenda, roteiro, lugares, marcados } = analise.data

    const atual = await postDaViagem(supabase, tripId)
    if (!atual) throw new ErroHttp(404, "Publicação não encontrada")

    const [projecao, marcaveis, jaMarcados] = await Promise.all([
      projecaoOu404(supabase, tripId),
      membrosMarcaveis(supabase, tripId, criarClienteAdmin),
      marcadosDoPost(supabase, atual.id, criarClienteAdmin),
    ])
    // Quem já estava marcado e saiu da viagem pode continuar marcado; ninguém novo de fora entra.
    const permitidos = [...idsDe(marcaveis), ...idsDe(jaMarcados)]
    conferirMarcados(marcados, permitidos)

    const copia = montarPost(projecao, { legenda, roteiro, lugares })
    const post = await atualizar(supabase, atual.id, copia)
    // Sumiu entre a leitura e a escrita (despublicado em outra aba).
    if (!post) throw new ErroHttp(404, "Publicação não encontrada")

    await sincronizarMarcacoes(supabase, post.id, user.id, marcados, permitidos)

    const marcadosGravados = await marcadosDoPost(supabase, post.id, criarClienteAdmin)
    return NextResponse.json({ post: await postDaResposta(post, marcadosGravados) })
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

    return NextResponse.json({ ok: true })
  })
}
