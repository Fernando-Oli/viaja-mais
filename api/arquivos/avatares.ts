import { FORMATO_CAMINHO, REUSO_URL_AVATAR_S, VALIDADE_URL_AVATAR_S } from "../../lib/social/foto"
import { envApi } from "../env"
import { assinarLeitura } from "./armazenamento"

/**
 * Links assinados das fotos de perfil, a partir de `profiles.avatar_url` (o
 * caminho no bucket). Portado de `lib/social/avatar.ts`, que assinava pelo
 * Supabase Storage; a regra é a mesma:
 *
 * - só assina o que está no formato do gatilho e na pasta do próprio perfil —
 *   o gatilho já garante isso em `profiles`, e a checagem aqui é a defesa para
 *   quando outra tabela (o feed) reusar o helper;
 * - devolve o mesmo link por `REUSO_URL_AVATAR_S`: assinatura nova é URL nova,
 *   e URL nova é download novo no navegador;
 * - falha ao assinar vira foto nula com log: uma foto que não abre não derruba
 *   o perfil, a lista ou o menu.
 *
 * A assinatura é injetada (`criarAssinadorDeAvatares`) para o teste unitário
 * provar o reaproveitamento sem armazenamento de verdade.
 *
 * @RF02.2 foto de perfil
 */

type PerfilComFoto = { id: string; avatar_url: string | null }
type Assinar = (caminho: string, validadeS: number) => Promise<string>

/** Teto de links guardados por instância da API; acima dele, sai o mais antigo. */
export const MAX_LINKS_GUARDADOS = 1000

/** O caminho da foto, se ele está no formato do gatilho e na pasta do próprio perfil. */
function caminhoDaFoto({ id, avatar_url }: PerfilComFoto): string | null {
  if (!avatar_url) return null
  const casou = FORMATO_CAMINHO.exec(avatar_url)
  return casou && casou[1] === id ? avatar_url : null
}

export function criarAssinadorDeAvatares(assinar: Assinar, agora: () => number = Date.now) {
  const emitidos = new Map<string, { url: string; emitidoEm: number }>()

  function reaproveitavel(caminho: string, momento: number) {
    const guardado = emitidos.get(caminho)
    if (!guardado) return null
    if (momento - guardado.emitidoEm < REUSO_URL_AVATAR_S * 1000) return guardado.url
    emitidos.delete(caminho)
    return null
  }

  function guardar(caminho: string, url: string, momento: number) {
    emitidos.delete(caminho)
    emitidos.set(caminho, { url, emitidoEm: momento })
    // O Map guarda a ordem de inserção: a primeira chave é a mais antiga.
    if (emitidos.size > MAX_LINKS_GUARDADOS) emitidos.delete(emitidos.keys().next().value!)
  }

  /** O link de cada perfil, na mesma ordem, ou nulo. */
  async function assinarAvatares(perfis: readonly PerfilComFoto[]): Promise<(string | null)[]> {
    const momento = agora()
    const caminhos = perfis.map(caminhoDaFoto)
    const faltando = [...new Set(caminhos.filter((c): c is string => c !== null && !reaproveitavel(c, momento)))]

    await Promise.all(
      faltando.map(async (caminho) => {
        try {
          guardar(caminho, await assinar(caminho, VALIDADE_URL_AVATAR_S), momento)
        } catch (erro) {
          console.error("[foto de perfil] foto não assinada", caminho, erro)
        }
      }),
    )
    return caminhos.map((caminho) => (caminho ? (emitidos.get(caminho)?.url ?? null) : null))
  }

  return {
    assinarAvatares,
    /** Atalho para um perfil só. */
    assinarAvatar: async (perfil: PerfilComFoto) => (await assinarAvatares([perfil]))[0],
  }
}

/** O assinador da API, sobre o bucket de fotos. */
export const { assinarAvatares, assinarAvatar } = criarAssinadorDeAvatares((caminho, validadeS) =>
  assinarLeitura(envApi.S3_BUCKET_AVATARES, caminho, validadeS),
)
