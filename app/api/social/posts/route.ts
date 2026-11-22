import { NextResponse, after } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { criarClienteAdmin } from "@/lib/supabase/admin"
import { ErroHttp, naoAutenticado, respostaInvalida } from "@/lib/http"
import { exigirLimite, LIMITES } from "@/lib/seguranca/limite"
import { MAXIMO_FOTOS, MINIMO_FOTOS, novoPostSchema } from "@/lib/schemas/post"
import {
  CAMPO_FOTOS,
  conferirTamanhoDeclarado,
  enviarFotos,
  fotosDoFormulario,
  removerFotosSemFalhar,
  reprocessarFotos,
} from "@/lib/social/capa"
import { esvaziarFilaDeFotos } from "@/lib/social/fila-fotos"
import { sincronizarMarcacoes, validarMarcados } from "@/lib/social/marcacoes"
import { temUsername } from "@/lib/social/perfil-visto"
import { criarPost, excluirPost, postNaoEncontrado, postVisto } from "@/lib/social/post"
import { responder, semUsername } from "@/lib/social/post-http"

/**
 * POST /api/social/posts: criar um post, no modelo do Instagram — 1 a 3 fotos
 * (o carrossel, na ordem em que vieram no formulário), legenda opcional e
 * pessoas marcadas. → 201 `{ post: PostVisto }`.
 *
 * Multipart: `fotos` (um arquivo por foto, repetido), `legenda` (opcional, até
 * 280) e `marcados` (opcional, lista JSON de uuids, até 20). Outro campo é 400.
 *
 * Segue o molde de app/api/trips/[tripId]/route.ts, sem `params` e sem
 * `exigirMembro` (o post sem viagem não é recurso de viagem). A autorização é
 * explícita: **só publica quem tem username** (o post vive em `/u/<username>`),
 * 403 `sem_username`; a policy de INSERT de `posts` exige o mesmo.
 *
 * **Ordem**: sessão (401) → username (403) → limite de envios (429, antes de
 * ler o corpo) → tamanho declarado (413) → formulário e fotos pelos bytes
 * (400/413) → zod dos campos de texto (400) → marcados (400 `marcado_invalido`:
 * uuid de ninguém, a própria sessão ou conta sem username) → regerar as fotos
 * (400 se o sharp recusar) → enviar → gravar o post → marcar → responder.
 * Nada vai ao Storage antes de tudo o que pode ser recusado barato ter passado.
 * Post novo não tem recusa de marcação (a recusa sem viagem é por post).
 *
 * **Limite de envios**: a regra da foto de perfil (`LIMITES.fotoPerfil`, a
 * mesma chave e o mesmo contador da capa, decisão do Micael de 18/11), uma
 * contagem por post — e não por foto: o que se limita é a pessoa publicando
 * em rajada.
 *
 * **A chave de serviço** só envia as fotos (e as apaga se algo falhar depois)
 * e assina os links, sempre na pasta da sessão (lib/social/capa.ts). O post e
 * as marcas são gravados com a sessão, sob a RLS. O que sobe é sempre o WebP
 * regerado pelo sharp, sem EXIF/GPS, nunca o arquivo recebido.
 *
 * **Falha depois do envio**: gravar o post falhou ⇒ as fotos enviadas saem do
 * bucket; marcar falhou ⇒ o post é apagado e as fotos também, e o erro segue.
 * A pessoa tenta de novo do zero, sem post pela metade.
 *
 * Toda resposta sai com `Cache-Control: private, no-store`; erros com
 * `{ error, codigo? }`. Nenhuma traz `author_id`, `trip_id` nem caminho do
 * Storage.
 *
 * @RF09.15 criar post com 1 a 3 fotos, legenda e marcados · @RF09.13 marcar
 * @RNF02.8 limite de envios · @RNF02.11 erro do banco não vaza
 */

/** Os campos que o formulário pode trazer; qualquer outro é 400. */
const CAMPOS_DO_FORMULARIO = new Set([CAMPO_FOTOS, "legenda", "marcados"])

/** Os campos de texto, como o zod os espera: ausente fica ausente. */
function camposDeTexto(formulario: FormData) {
  const campos: Record<string, unknown> = {}
  for (const [nome, valor] of formulario.entries()) {
    if (nome === CAMPO_FOTOS) continue
    if (!CAMPOS_DO_FORMULARIO.has(nome)) throw new ErroHttp(400, `Campo não permitido no post: ${nome.slice(0, 40)}`)
    if (nome in campos) throw new ErroHttp(400, `Envie o campo ${nome} uma vez só`)
    // Um arquivo num campo de texto cai no zod como "não é texto".
    campos[nome] = valor
  }
  return campos
}

export async function POST(request: Request): Promise<NextResponse> {
  return responder(async () => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw naoAutenticado()

    if (!(await temUsername(supabase, user.id))) throw semUsername("publicar")

    // Cada post decodifica até 3 imagens e grava no Storage com a chave de
    // serviço: contado antes de ler o corpo e de qualquer efeito.
    await exigirLimite(supabase, LIMITES.fotoPerfil)

    conferirTamanhoDeclarado(request, MAXIMO_FOTOS)
    const formulario = await request.formData().catch(() => null)
    if (!formulario) throw new ErroHttp(400, "Envie o post como formulário (multipart)")

    const campos = camposDeTexto(formulario)
    const brutas = await fotosDoFormulario(formulario, { minimo: MINIMO_FOTOS, maximo: MAXIMO_FOTOS })

    const analise = novoPostSchema.safeParse(campos)
    if (!analise.success) return respostaInvalida(analise.error.flatten())
    const { legenda, marcados } = analise.data

    await validarMarcados(supabase, marcados, user.id)

    // Decodifica só depois de tudo o que é barato: um 400 de marcado não gasta CPU.
    const regeradas = await reprocessarFotos(brutas)

    const admin = criarClienteAdmin()
    const fotos = await enviarFotos(admin, user.id, regeradas)

    let postId: string
    try {
      postId = await criarPost(supabase, { autorId: user.id, fotos, legenda })
    } catch (erro) {
      await removerFotosSemFalhar(admin, fotos, user.id)
      throw erro
    }

    try {
      await sincronizarMarcacoes(supabase, postId, user.id, marcados)
    } catch (erro) {
      // Sem as marcas, o post sai, e as fotos com ele: tentar de novo começa do zero.
      await excluirPost(supabase, postId, user.id).catch((falha: unknown) =>
        console.error("[post] post sem marcas não foi desfeito", postId, falha),
      )
      await removerFotosSemFalhar(admin, fotos, user.id)
      throw erro
    }

    const post = await postVisto(supabase, () => admin, postId, user.id)
    // Acabou de ser gravado pela sessão: sumir aqui é exclusão em outra aba.
    if (!post) throw postNaoEncontrado()
    // Depois da resposta: apaga do Storage as fotos de posts que saíram por
    // fora da rota (cascata, Data API), anotadas pelo trigger. Nunca lança.
    after(() => esvaziarFilaDeFotos(admin))
    return NextResponse.json({ post }, { status: 201 })
  })
}
