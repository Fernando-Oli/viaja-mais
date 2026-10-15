import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { ErroHttp, naoAutenticado, naoEncontrado, respostaDeErro } from "@/lib/http"
import { avatarPublico } from "@/lib/social/avatar"
import { BUCKET_AVATARES, LIMITE_FOTO_BYTES, caminhoApagavel, caminhoDaNovaFoto, tipoDaImagem } from "@/lib/social/foto"

/**
 * Foto do próprio perfil: enviar (POST, multipart com o campo `foto`) e
 * remover (DELETE).
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts, com as diferenças da rota
 * de perfil: sem `params` e sem `exigirMembro`/`exigirDono` — a foto é do
 * próprio perfil, e o caminho no Storage é montado com o id de `getUser()`.
 *
 * Por que a chave de serviço no Storage: o bucket não tem policy nenhuma para
 * usuário (migration social_avatares), então ninguém grava nem apaga nele pela
 * API do Storage com o JWT do navegador. Só esta rota grava, e só depois de
 * conferir a assinatura do arquivo (os magic bytes do começo) — que nem a RLS
 * nem o bucket conferem, já que o bucket confia no tipo declarado. É só a
 * assinatura: a rota não decodifica a imagem. É o critério de
 * lib/supabase/admin.ts: usar a chave para o que a RLS não resolve.
 *
 * O perfil, ao contrário, é atualizado com a sessão do usuário: a RLS de
 * `profiles` e o trigger de `avatar_url` continuam valendo.
 *
 * Erro do Storage ou do banco cai no 500 genérico de `respostaDeErro`.
 *
 * @RF02.2 foto de perfil · @RNF02.11 erro do banco não vaza
 */

const COLUNAS = "id, full_name, avatar_url, username, bio, is_public"

/** Folga do multipart (fronteiras e cabeçalhos) sobre o limite do arquivo. */
const FOLGA_MULTIPART = 64 * 1024

type Supabase = Awaited<ReturnType<typeof createClient>>
type Perfil = { avatar_url: string | null } & Record<string, unknown>

async function usuarioAtual(supabase: Supabase) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw naoAutenticado()
  return user
}

/** O banco guarda o caminho no bucket; a tela recebe a URL pública. */
function paraResposta(perfil: Perfil) {
  return { ...perfil, avatar_url: avatarPublico(perfil.avatar_url) }
}

async function avatarAtual(supabase: Supabase, userId: string) {
  const { data, error } = await supabase.from("profiles").select("avatar_url").eq("id", userId).maybeSingle()
  if (error) throw error
  if (!data) throw naoEncontrado("Perfil")
  return data.avatar_url as string | null
}

/**
 * Troca avatar_url só se ele ainda for o que foi lido no começo. Duas abas
 * enviando ao mesmo tempo, ou um envio e uma remoção, não podem as duas apagar
 * a mesma foto anterior e deixar a outra órfã: a segunda não acha a linha e
 * recebe 409.
 */
async function trocarAvatar(supabase: Supabase, userId: string, anterior: string | null, novo: string | null) {
  const consulta = supabase.from("profiles").update({ avatar_url: novo }).eq("id", userId)
  const condicionada = anterior === null ? consulta.is("avatar_url", null) : consulta.eq("avatar_url", anterior)
  const { data, error } = await condicionada.select(COLUNAS).maybeSingle()
  if (error) throw error
  if (!data) throw new ErroHttp(409, "A foto foi alterada em outra aba. Recarregue a página e tente de novo.")
  return data
}

/**
 * Apaga um arquivo com a chave de serviço. Quem decide se pode é
 * `caminhoApagavel`: só arquivo no formato da rota, na pasta da própria pessoa.
 * A foto em uso já foi trocada a essa altura; se apagar falhar, sobra um arquivo
 * no bucket, mas nada quebra para quem usa — por isso só registra.
 */
async function apagar(admin: ReturnType<typeof criarClienteAdmin>, caminho: string | null) {
  if (!caminho) return
  const { data, error } = await admin.storage.from(BUCKET_AVATARES).remove([caminho])
  if (error || !data?.length) console.error("[foto de perfil] arquivo não apagado", caminho, error)
}

/** Uma página do `list` do Storage (o padrão dele). */
const PAGINA_DA_VARREDURA = 100

/**
 * Depois da troca, apaga da pasta da pessoa as fotos que nenhuma troca vai
 * usar. O grant deixa gravar avatar_url direto pelo PostgREST: quem o zerava e
 * enviava de novo deixava até 2 MB públicos no bucket a cada volta, para sempre.
 *
 * Só sai o que foi criado antes da referência: a foto nova (POST) ou a que
 * acabou de sair do perfil (DELETE). Um envio de outra aba que leu o avatar
 * depois da troca sobe o arquivo depois dela e ainda pode virar o avatar — fica.
 * Relógio: o `created_at` de storage.objects dos dois lados (o now() do banco),
 * nunca o do servidor da aplicação. Não o updated_at do perfil porque, num
 * DELETE sem foto, a troca é de nulo para nulo e não barra um envio que leu nulo
 * antes dela; sem referência, não varre. Fica o ABA do nulo (uma aba lê nulo,
 * outra põe e tira uma foto antes de ela gravar): o arquivo dela pode sair, e
 * fechar isso pede versão na linha, não relógio.
 *
 * Uma página (100), do mais novo para o mais antigo, para a referência estar
 * sempre nela; com mais arquivos (só sobra de falha), os mais antigos ficam para
 * a próxima troca. Em ordem crescente, a referência sairia da página e nada mais
 * seria apagado.
 *
 * Como em `apagar`: todo caminho passa por `caminhoApagavel`, a anterior fica
 * com `apagar` (`jaTratada`) e erro só vai para o log — a troca já valeu.
 *
 * @RF02.2
 */
async function varrerPasta(
  admin: ReturnType<typeof criarClienteAdmin>,
  userId: string,
  referencia: string | null,
  jaTratada: string | null,
) {
  if (!referencia) return
  try {
    const pasta = admin.storage.from(BUCKET_AVATARES)
    const { data, error } = await pasta.list(userId, {
      limit: PAGINA_DA_VARREDURA,
      sortBy: { column: "created_at", order: "desc" },
    })
    if (error || !data) {
      console.error("[foto de perfil] pasta não listada", userId, error)
      return
    }

    // Pasta vem com created_at nulo; NaN nunca é menor que nada, então fica.
    const criadoEm = (o: { created_at: string | null }) => (o.created_at ? Date.parse(o.created_at) : NaN)
    const ref = data.find((o) => `${userId}/${o.name}` === referencia)
    const corte = ref ? criadoEm(ref) : NaN
    if (Number.isNaN(corte)) return

    const sobras = data
      .filter((o) => criadoEm(o) < corte)
      .map((o) => caminhoApagavel(`${userId}/${o.name}`, userId))
      .filter((caminho): caminho is string => caminho !== null && caminho !== jaTratada)
    if (!sobras.length) return

    const { data: apagados, error: erroRemocao } = await pasta.remove(sobras)
    if (erroRemocao || (apagados?.length ?? 0) < sobras.length) {
      console.error("[foto de perfil] sobras não apagadas", sobras, erroRemocao)
    }
  } catch (erro) {
    console.error("[foto de perfil] varredura da pasta falhou", userId, erro)
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)

    // Recusa pelo cabeçalho, antes de processar o multipart. Não evita a leitura
    // do corpo: o proxy.ts casa com /api, e o Next lê até 10 MB dele para a
    // memória (proxyClientMaxBodySize) antes de chamar a rota. O que se poupa é
    // montar o formulário e copiar o arquivo só para descobrir que era grande
    // demais.
    const declarado = Number(request.headers.get("content-length") ?? 0)
    if (declarado > LIMITE_FOTO_BYTES + FOLGA_MULTIPART) throw new ErroHttp(413, "A foto pode ter até 2 MB")

    const formulario = await request.formData().catch(() => null)
    const arquivo = formulario?.get("foto")
    if (!(arquivo instanceof File) || arquivo.size === 0) {
      throw new ErroHttp(400, "Envie a foto no campo \"foto\"")
    }
    if (arquivo.size > LIMITE_FOTO_BYTES) throw new ErroHttp(413, "A foto pode ter até 2 MB")

    // O tipo vem dos bytes, não do nome nem do content-type que o cliente mandou.
    const bytes = new Uint8Array(await arquivo.arrayBuffer())
    const tipo = tipoDaImagem(bytes)
    if (!tipo) throw new ErroHttp(400, "Envie uma imagem JPEG, PNG ou WebP")

    const anterior = await avatarAtual(supabase, user.id)

    const admin = criarClienteAdmin()
    const caminho = caminhoDaNovaFoto(user.id, randomUUID(), tipo)
    const { error: erroEnvio } = await admin.storage
      .from(BUCKET_AVATARES)
      .upload(caminho, bytes, { contentType: tipo, upsert: false })
    if (erroEnvio) throw erroEnvio

    let perfil: Perfil
    try {
      perfil = await trocarAvatar(supabase, user.id, anterior, caminho)
    } catch (erro) {
      // Sem o perfil apontando para ela, a foto nova ficaria órfã no bucket.
      await apagar(admin, caminho)
      throw erro
    }

    const anteriorApagavel = caminhoApagavel(anterior, user.id)
    await varrerPasta(admin, user.id, caminho, anteriorApagavel)
    await apagar(admin, anteriorApagavel)
    return NextResponse.json({ perfil: paraResposta(perfil) })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient()
    const user = await usuarioAtual(supabase)

    const anterior = await avatarAtual(supabase, user.id)
    const perfil = await trocarAvatar(supabase, user.id, anterior, null)

    // A referência da varredura é a foto que saiu: ela precisa estar na
    // listagem, então `apagar` vem depois.
    const admin = criarClienteAdmin()
    const anteriorApagavel = caminhoApagavel(anterior, user.id)
    await varrerPasta(admin, user.id, anteriorApagavel, anteriorApagavel)
    await apagar(admin, anteriorApagavel)
    return NextResponse.json({ perfil: paraResposta(perfil) })
  } catch (erro) {
    return respostaDeErro(erro)
  }
}
