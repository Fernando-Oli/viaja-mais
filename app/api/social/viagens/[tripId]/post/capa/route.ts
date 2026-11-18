import { NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { exigirMembro } from "@/lib/authz/trip"
import { ErroHttp, naoAutenticado, respostaDeErro, respostaInvalida } from "@/lib/http"
import { exigirLimite, LIMITES } from "@/lib/seguranca/limite"
import { SEM_CACHE_COMPARTILHADO } from "@/lib/social/avatar"
import { tipoDaImagem } from "@/lib/social/foto"
import { LIMITE_CAPA_BYTES, assinarCapa, caminhoDaNovaCapa, enviarCapa, removerCapa } from "@/lib/social/capa"
import { LADO_CAPA, reprocessarImagem } from "@/lib/social/imagem"
import { definirCapa, postDaViagem } from "@/lib/social/posts"

/**
 * Capa do post que a sessão publicou desta viagem: trocar (PUT, multipart com o
 * campo `capa`) e tirar (DELETE).
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts — `await params`,
 * `getUser()`, `exigirMembro`, validação, `respostaDeErro` — e a rota irmã da
 * foto de perfil (app/api/social/perfil/foto), de onde vêm a recusa pelo
 * `Content-Length`, o tipo pelos bytes, o reprocessamento e a troca
 * condicionada.
 *
 * **Quem pode.** Qualquer membro da viagem (`exigirMembro`), sobre o próprio
 * post: o post é achado por `postDaViagem`, que só responde sobre a sessão.
 * Quem saiu da viagem recebe 403 aqui — e a policy de UPDATE de `trip_posts`,
 * que também exige ser membro, é a segunda linha. Ele ainda pode despublicar
 * (rota do post), o que apaga a capa junto.
 *
 * O `tripId` da URL é conferido como uuid antes da autorização: fora do formato,
 * a consulta de `trip_members` falharia no Postgres (22P02), e `papelNaViagem`
 * lança essa falha como ErroHttp 500 com a mensagem do banco.
 *
 * **Por que a chave de serviço, e só aqui.** O bucket `capas-posts` é privado e
 * não tem policy nenhuma em storage.objects: com o JWT do navegador ninguém
 * envia, apaga nem assina nele. Só esta rota envia, e só depois de conferir a
 * assinatura dos bytes (`tipoDaImagem`), que o bucket não confere — ele confia
 * no tipo declarado. A chave fica restrita ao Storage, sempre na pasta da
 * sessão (`caminhoDaNovaCapa`, `removerCapa`); o post em si é gravado com o
 * cliente da sessão, e a RLS e o CHECK de `cover_path` continuam valendo.
 *
 * **Limite aceito: esta rota não é o único caminho para `cover_path`.** O autor
 * também consegue gravar a coluna pelo UPDATE da Data API, mas só com um
 * caminho da própria pasta (CHECK do banco): aponta o post para outro arquivo
 * dele, nunca de outra pessoa, e nada entra no bucket sem passar por aqui.
 * Impacto baixo; o detalhe está em lib/social/capa.ts e no plano da S06
 * (bloco 7, item 4 da revisão de 18/11).
 *
 * **Limite de envios.** O PUT conta na regra da foto de perfil
 * (`LIMITES.fotoPerfil`, mesma chave, mesmo contador) até existir uma regra
 * própria; ver o comentário no PUT.
 *
 * **O que vai ao bucket é uma imagem nova, nunca o arquivo recebido.** A
 * assinatura só recusa o óbvio, barato; depois de achar o post, a capa é
 * decodificada e regerada com o sharp (`reprocessarImagem`, lib/social/imagem.ts):
 * WebP de até `LADO_CAPA` px, girada pelo EXIF e sem metadado nenhum. O GPS da
 * foto não chega ao bucket, e um arquivo que só começa como imagem é 400 sem
 * gravar nada. Por isso o caminho termina sempre em `.webp`.
 *
 * **A ordem: enviar → trocar → apagar.** O arquivo sobe primeiro, num caminho
 * novo, para que o post nunca aponte para um arquivo que não existe. A troca
 * (`definirCapa`) só vale se a capa ainda for a lida; se ela falhar (outra aba
 * trocou antes: 409; a pessoa saiu da viagem: 403; erro do banco: 500), o
 * arquivo recém-enviado é apagado, porque nenhum post aponta para ele. Só depois
 * da troca a capa anterior sai do bucket: apagá-la antes deixaria o post com
 * uma capa quebrada se a troca falhasse. Se apagar a anterior falhar, a troca já
 * valeu — sobra um arquivo inalcançável (só se assina caminho que está num
 * post), e a falha só vai ao log.
 *
 * **A resposta.** A capa vai como URL assinada (10 min), nunca o `cover_path`
 * cru, e com `Cache-Control: private, no-store`: o link vale como senha. Nenhuma
 * resposta traz `trip_id` nem `author_id`. Erro do Storage ou do banco cai no
 * 500 genérico de `respostaDeErro`, sem a mensagem original.
 *
 * @RF09.7 publicar viagem — capa do post
 */

/** Folga do multipart (fronteiras e cabeçalhos) sobre o limite do arquivo. */
const FOLGA_MULTIPART = 64 * 1024

const MENSAGEM_TAMANHO = "A capa pode ter até 2 MB"

const tripIdSchema = z.string().uuid()

/** `naoEncontrado` diria "Publicação não encontrado". */
const semPost = () => new ErroHttp(404, "Publicação não encontrada")

type Supabase = Awaited<ReturnType<typeof createClient>>
type Admin = ReturnType<typeof criarClienteAdmin>
type Contexto = { params: Promise<{ tripId: string }> }

/** Toda resposta, de sucesso ou de erro, sai sem cache compartilhado. */
function semCache(resposta: NextResponse): NextResponse {
  for (const [nome, valor] of Object.entries(SEM_CACHE_COMPARTILHADO)) resposta.headers.set(nome, valor)
  return resposta
}

/**
 * Erro em resposta. `papelNaViagem` lança ErroHttp 500 com a mensagem do banco:
 * ela vira um erro comum, para `respostaDeErro` responder o 500 genérico e
 * deixar a mensagem só no log.
 */
function falha(erro: unknown): NextResponse {
  if (erro instanceof ErroHttp && erro.status >= 500) {
    return semCache(respostaDeErro(new Error("[capa do post] erro interno", { cause: erro })))
  }
  return semCache(respostaDeErro(erro))
}

const viagemInvalida = () => semCache(respostaInvalida({ tripId: ["identificador de viagem inválido"] }))

async function usuarioAtual(supabase: Supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

/** O post da sessão nesta viagem, ou 404. */
async function meuPost(supabase: Supabase, tripId: string) {
  const post = await postDaViagem(supabase, tripId)
  if (!post) throw semPost()
  return post
}

/**
 * Apaga um arquivo do autor com a chave de serviço. Chamado quando a operação
 * principal já decidiu o resultado: a falha só vai ao log, nunca à resposta.
 */
async function apagarSemFalhar(admin: Admin, caminho: string | null, autorId: string) {
  if (!caminho) return
  try {
    if (!(await removerCapa(admin, caminho, autorId))) console.error("[capa do post] arquivo não apagado", caminho)
  } catch (erro) {
    console.error("[capa do post] arquivo não apagado", caminho, erro)
  }
}

/**
 * Os bytes do campo `capa`, conferidos: tamanho real e tipo pelos bytes. É só a
 * conferência barata; quem decodifica de verdade é `reprocessarImagem`.
 */
async function lerCapa(request: Request): Promise<Uint8Array> {
  // Recusa pelo cabeçalho, antes de processar o multipart. Como na foto, não
  // evita a leitura do corpo (o Next já o leu, até o limite do proxy): poupa
  // montar o formulário e copiar o arquivo só para descobrir que era grande.
  const declarado = Number(request.headers.get("content-length") ?? 0)
  if (declarado > LIMITE_CAPA_BYTES + FOLGA_MULTIPART) throw new ErroHttp(400, MENSAGEM_TAMANHO)

  const formulario = await request.formData().catch(() => null)
  const arquivo = formulario?.get("capa")
  if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroHttp(400, 'Envie a capa no campo "capa"')
  if (arquivo.size > LIMITE_CAPA_BYTES) throw new ErroHttp(400, MENSAGEM_TAMANHO)

  // O tipo vem dos bytes, não do nome nem do content-type que o cliente mandou.
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  if (!tipoDaImagem(bytes)) throw new ErroHttp(400, "Envie uma imagem JPEG, PNG ou WebP")
  return bytes
}

export async function PUT(request: Request, { params }: Contexto) {
  const { tripId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    if (!tripIdSchema.safeParse(tripId).success) return viagemInvalida()
    await exigirMembro(supabase, tripId, user.id)

    // Cada envio decodifica uma imagem e grava no Storage com a chave de
    // serviço (RNF02.8). Contado antes de ler o corpo e de qualquer efeito: o
    // 429 não monta o formulário, não decodifica e não grava nada.
    //
    // Decisão do Micael (18/11): a capa usa a MESMA regra da foto de perfil,
    // `LIMITES.fotoPerfil`. A contagem do `consumir_limite()` é por usuário e
    // por `chave`, e a chave é a da regra ("foto-perfil"): foto e capa somam
    // no mesmo contador — 10 envios de imagem, de qualquer das duas, a cada
    // 10 minutos. É de propósito, e não um esquecimento: o custo que se limita
    // (decodificar e gravar) é o mesmo nas duas rotas.
    // TODO(Fernando): criar a regra própria `LIMITES.capaPost` em
    // lib/seguranca/limite.ts (pedido registrado em
    // docs/plans/S06-M-publicar-viagem.md, bloco 7, segunda revisão de 18/11)
    // e trocar aqui.
    await exigirLimite(supabase, LIMITES.fotoPerfil)

    const recebidos = await lerCapa(request)
    const post = await meuPost(supabase, tripId)

    // Decodifica só depois de achar o post: um 404 não gasta CPU. O que sobe é
    // o WebP regerado, sem EXIF/GPS; o arquivo recebido não vai ao bucket.
    const capa = await reprocessarImagem(recebidos, { lado: LADO_CAPA, limiteBytes: LIMITE_CAPA_BYTES })

    const admin = criarClienteAdmin()
    const caminho = caminhoDaNovaCapa(user.id, capa.tipo)
    await enviarCapa(admin, caminho, capa.bytes, capa.tipo)

    let capaAnterior: string | null
    try {
      const troca = await definirCapa(supabase, post.id, caminho)
      // O post sumiu entre a leitura e a troca (despublicado em outra aba).
      if (!troca) throw semPost()
      capaAnterior = troca.capaAnterior
    } catch (erro) {
      // Sem post apontando para ele, o arquivo novo ficaria órfão no bucket.
      await apagarSemFalhar(admin, caminho, user.id)
      throw erro
    }

    await apagarSemFalhar(admin, capaAnterior, user.id)
    return NextResponse.json({ capa: await assinarCapa(() => admin, caminho) }, { headers: SEM_CACHE_COMPARTILHADO })
  } catch (erro) {
    return falha(erro)
  }
}

/**
 * Tira a capa. Idempotente: sem capa, responde 200 com `{ capa: null }` sem
 * gravar nada — o UPDATE de nulo para nulo só mexeria no `updated_at` do post.
 */
export async function DELETE(_request: Request, { params }: Contexto) {
  const { tripId } = await params
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)
    if (!tripIdSchema.safeParse(tripId).success) return viagemInvalida()
    await exigirMembro(supabase, tripId, user.id)

    const post = await meuPost(supabase, tripId)
    if (post.cover_path !== null) {
      const troca = await definirCapa(supabase, post.id, null)
      if (!troca) throw semPost()
      await apagarSemFalhar(criarClienteAdmin(), troca.capaAnterior, user.id)
    }
    return NextResponse.json({ capa: null }, { headers: SEM_CACHE_COMPARTILHADO })
  } catch (erro) {
    return falha(erro)
  }
}
