import { randomUUID } from "node:crypto"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { ErroHttp, naoEncontrado } from "../../../lib/erros"
import { LIMITES } from "../../../lib/seguranca/limite"
import { LIMITE_FOTO_BYTES, caminhoApagavel, caminhoDaNovaFoto, tipoDaImagem } from "../../../lib/social/foto"
import { apagarArquivos, enviarArquivo, listarPasta } from "../../arquivos/armazenamento"
import { assinarAvatar } from "../../arquivos/avatares"
import { comoUsuario } from "../../db/como-usuario"
import { envApi } from "../../env"
import { exigirLimiteNaTx } from "../../http/limite"
import { exigirSessao, type VariaveisSessao } from "../../http/sessao"
import * as repo from "./repositorio"

/**
 * Foto do próprio perfil, em `/api/social/perfil/foto`: enviar (POST, multipart
 * com o campo `foto`) e remover (DELETE). Portada de
 * `app/api/social/perfil/foto/route.ts`, do Supabase Storage para S3.
 *
 * Sem parâmetro de quem: a foto é do próprio perfil, e o caminho no bucket é
 * montado com o id da sessão. O perfil é atualizado com a sessão do usuário (a
 * RLS de `profiles` e o gatilho de `avatar_url` valem); o bucket só a API
 * alcança, com as chaves dela, e só depois de conferir a assinatura do arquivo
 * (os bytes do começo) — o tipo e o nome que o cliente manda mentem de graça.
 *
 * O bucket é privado: a resposta leva a foto como link assinado de 10 minutos,
 * sem cache compartilhado.
 *
 * @RF02.2 foto de perfil · @RNF02.8 10 envios por 10 minutos, por usuário
 * @RNF02.11 erro do armazenamento ou do banco não vaza
 */

/** Folga do multipart (fronteiras e cabeçalhos) sobre o limite do arquivo. */
const FOLGA_MULTIPART = 64 * 1024

const SEM_CACHE = { "Cache-Control": "private, no-store" } as const
const FOTO_GRANDE = "A foto pode ter até 2 MB"
const OUTRA_ABA = "A foto foi alterada em outra aba. Recarregue a página e tente de novo."

const bucket = () => envApi.S3_BUCKET_AVATARES

/**
 * Apaga arquivos que já não são a foto de ninguém. A foto em uso já foi trocada
 * a essa altura; se apagar falhar, sobra um arquivo no bucket, mas nada quebra
 * para quem usa — por isso só registra.
 */
async function apagarSemFalhar(caminhos: (string | null)[]) {
  const validos = caminhos.filter((c): c is string => c !== null)
  try {
    const falharam = await apagarArquivos(bucket(), validos)
    if (falharam.length) console.error("[foto de perfil] arquivos não apagados", falharam)
  } catch (erro) {
    console.error("[foto de perfil] arquivos não apagados", validos, erro)
  }
}

/**
 * Depois da troca, apaga da pasta da pessoa as fotos gravadas **antes** da
 * referência (a foto nova, no envio; a que saiu, na remoção): sobras de envios
 * que falharam no meio. Um envio de outra aba que grava depois da referência
 * ainda pode virar o avatar e fica. O relógio é o do armazenamento dos dois
 * lados, nunca o da API.
 *
 * Todo caminho passa por `caminhoApagavel` (formato da rota, pasta da própria
 * pessoa); erro só vai para o log — a troca já valeu.
 */
async function varrerPasta(userId: string, referencia: string | null, jaTratada: string | null) {
  if (!referencia) return
  try {
    const arquivos = await listarPasta(bucket(), userId)
    const ref = arquivos.find((a) => a.caminho === referencia)
    if (!ref) return
    const sobras = arquivos
      .filter((a) => a.gravadoEm < ref.gravadoEm)
      .map((a) => caminhoApagavel(a.caminho, userId))
      .filter((c): c is string => c !== null && c !== jaTratada)
    await apagarSemFalhar(sobras)
  } catch (erro) {
    console.error("[foto de perfil] varredura da pasta falhou", userId, erro)
  }
}

export const rotasFoto = new Hono<{ Variables: VariaveisSessao }>()
  .use(exigirSessao)

  .post(
    "/",
    // Lê no máximo o limite do corpo, de verdade: o cabeçalho pode mentir.
    bodyLimit({ maxSize: LIMITE_FOTO_BYTES + FOLGA_MULTIPART, onError: (c) => c.json({ error: FOTO_GRANDE }, 413) }),
    async (c) => {
      const usuario = c.var.usuario

      // O limite numa transação própria, confirmada antes do envio: cada envio
      // grava no armazenamento, dê certo a troca ou não.
      const anterior = await comoUsuario(usuario, async (tx) => {
        await exigirLimiteNaTx(tx, LIMITES.fotoPerfil)
        return repo.avatarAtual(tx, usuario.id)
      })
      if (anterior === undefined) throw naoEncontrado("Perfil")

      const corpo = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>)
      const arquivo = corpo.foto
      if (!(arquivo instanceof File) || arquivo.size === 0) throw new ErroHttp(400, 'Envie a foto no campo "foto"')
      if (arquivo.size > LIMITE_FOTO_BYTES) throw new ErroHttp(413, FOTO_GRANDE)

      // O tipo vem dos bytes, não do nome nem do content-type do cliente.
      const bytes = new Uint8Array(await arquivo.arrayBuffer())
      const tipo = tipoDaImagem(bytes)
      if (!tipo) throw new ErroHttp(400, "Envie uma imagem JPEG, PNG ou WebP")

      const caminho = caminhoDaNovaFoto(usuario.id, randomUUID(), tipo)
      await enviarArquivo(bucket(), caminho, bytes, tipo)

      const perfil = await comoUsuario(usuario, (tx) => repo.trocarAvatar(tx, usuario.id, anterior, caminho)).catch(
        async (erro) => {
          // Sem o perfil apontando para ela, a foto nova ficaria órfã no bucket.
          await apagarSemFalhar([caminho])
          throw erro
        },
      )
      if (!perfil) {
        await apagarSemFalhar([caminho])
        throw new ErroHttp(409, OUTRA_ABA)
      }

      const anteriorApagavel = caminhoApagavel(anterior, usuario.id)
      await varrerPasta(usuario.id, caminho, anteriorApagavel)
      await apagarSemFalhar([anteriorApagavel])
      return c.json({ perfil: { ...perfil, avatar_url: await assinarAvatar(perfil) } }, 200, SEM_CACHE)
    },
  )

  .delete("/", async (c) => {
    const usuario = c.var.usuario
    const { anterior, perfil } = await comoUsuario(usuario, async (tx) => {
      const atual = await repo.avatarAtual(tx, usuario.id)
      if (atual === undefined) throw naoEncontrado("Perfil")
      return { anterior: atual, perfil: await repo.trocarAvatar(tx, usuario.id, atual, null) }
    })
    if (!perfil) throw new ErroHttp(409, OUTRA_ABA)

    // A referência da varredura é a foto que saiu: ela precisa estar na
    // listagem, então apagá-la vem depois.
    const anteriorApagavel = caminhoApagavel(anterior, usuario.id)
    await varrerPasta(usuario.id, anteriorApagavel, anteriorApagavel)
    await apagarSemFalhar([anteriorApagavel])
    return c.json({ perfil: { ...perfil, avatar_url: null } }, 200, SEM_CACHE)
  })
