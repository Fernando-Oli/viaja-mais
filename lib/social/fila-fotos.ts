import type { SupabaseClient } from "@supabase/supabase-js"
import { BUCKET_CAPAS } from "./capa"
import { FORMATO_CAMINHO } from "./foto"

/**
 * Esvazia a fila de fotos a remover (`public.fotos_a_remover`, migration
 * 20261118174100, seção 11): apaga do bucket `capas-posts`, pela API do
 * Storage, as fotos de posts que saíram do banco sem passar pela rota de
 * excluir — a cascata da viagem apagada, a conta apagada, o DELETE direto pela
 * Data API. O trigger `posts_enfileirar_fotos` anota o caminho de cada foto de
 * todo post que sai; um DELETE em storage.objects pelo SQL não apagaria o
 * arquivo, só a API do Storage apaga (achado A2 de 19/11).
 *
 * As rotas de criar e de excluir post chamam esta função com `after()` (depois
 * da resposta): a fila esvazia aos poucos, `limite` caminhos por chamada, os
 * mais antigos primeiro.
 *
 * **Nunca lança.** Qualquer erro (da fila ou do Storage) vai ao
 * `console.error`, e a função devolve quantos caminhos já tinham saído da fila.
 * O que não saiu fica para a próxima chamada.
 *
 * **O que sai da fila**: os caminhos que o Storage apagou e os que ele diz que
 * não existem (o `remove` devolve só os que apagou; os outros já não estavam
 * lá — o caso comum é o post excluído pela rota, que já apagou as fotos antes
 * de o trigger as anotar). Se o `remove` falhar, nenhum sai. Um caminho fora do
 * formato `<uuid>/<uuid>.<ext>` não vai ao Storage e sai da fila com um log: o
 * CHECK de `posts.photos` não deixa ele existir, e preso no começo da fila ele
 * ocuparia o lote de toda chamada.
 *
 * Duas chamadas ao mesmo tempo leem o mesmo lote; a segunda acha os arquivos
 * já apagados e só limpa a fila. Sem dano, por isso sem trava.
 *
 * @RF09.17 excluir o post leva as fotos · @RF09.15 fotos do post
 */

export const TABELA_FILA_FOTOS = "fotos_a_remover"

/** Teto por chamada: o `remove` do Storage aceita até 1000 caminhos por pedido. */
const LIMITE_MAXIMO = 1000

/** Caminhos por DELETE na fila: eles vão na URL do PostgREST (`caminho=in.(...)`). */
const POR_DELETE = 50

/**
 * O cliente de serviço que a fila precisa: o Storage e **só** a tabela da fila.
 *
 * Exceção à regra de lib/social/ ("a chave de serviço só toca o Storage", o
 * `ClienteDeServico` de lib/social/avatar.ts): a fila não tem grant para
 * `authenticated` nem para `anon` — só `service_role` lê e apaga, porque uma
 * escrita nela apagaria a foto de qualquer pessoa. O tipo aceita `from` só com
 * o nome dela, para nenhuma outra tabela ser lida com a chave por aqui.
 */
export type ClienteDaFilaDeFotos = Pick<SupabaseClient, "storage"> & {
  from(tabela: typeof TABELA_FILA_FOTOS): ReturnType<SupabaseClient["from"]>
}

function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho))
  return lotes
}

/** Tira os caminhos da fila; devolve quantos saíram. Lança no primeiro erro. */
async function tirarDaFila(admin: ClienteDaFilaDeFotos, caminhos: readonly string[]): Promise<number> {
  let tirados = 0
  for (const lote of emLotes(caminhos, POR_DELETE)) {
    const { error } = await admin.from(TABELA_FILA_FOTOS).delete().in("caminho", lote)
    if (error) throw new Error("[fila de fotos] não foi possível tirar da fila", { cause: error })
    tirados += lote.length
  }
  return tirados
}

/**
 * Lê até `limite` caminhos da fila (os mais antigos), apaga do bucket e tira da
 * fila os que saíram do Storage ou que não existiam. Nunca lança.
 *
 * @returns quantos caminhos saíram da fila nesta chamada.
 */
export async function esvaziarFilaDeFotos(admin: ClienteDaFilaDeFotos, limite: number = 50): Promise<number> {
  const tamanho = Number.isFinite(limite) ? Math.min(Math.trunc(limite), LIMITE_MAXIMO) : 0
  if (tamanho < 1) return 0

  let tirados = 0
  try {
    const { data, error } = await admin
      .from(TABELA_FILA_FOTOS)
      .select("caminho")
      .order("criado_em", { ascending: true })
      .limit(tamanho)
    if (error) throw new Error("[fila de fotos] não foi possível ler a fila", { cause: error })

    const caminhos = ((data ?? []) as { caminho: unknown }[])
      .map((linha) => linha.caminho)
      .filter((caminho): caminho is string => typeof caminho === "string")
    if (caminhos.length === 0) return 0

    const foraDoFormato = caminhos.filter((caminho) => !FORMATO_CAMINHO.test(caminho))
    if (foraDoFormato.length > 0) {
      console.error("[fila de fotos] caminho fora do formato, tirado da fila sem ir ao Storage", foraDoFormato)
      tirados += await tirarDaFila(admin, foraDoFormato)
    }

    const validos = caminhos.filter((caminho) => FORMATO_CAMINHO.test(caminho))
    if (validos.length === 0) return tirados

    const { data: removidos, error: erroDoStorage } = await admin.storage.from(BUCKET_CAPAS).remove(validos)
    if (erroDoStorage) throw new Error("[fila de fotos] o Storage não apagou as fotos", { cause: erroDoStorage })

    // O `remove` devolve os objetos que apagou; quem não voltou não existia.
    // Os dois saem da fila: o arquivo não está mais no bucket.
    const apagados = new Set((removidos ?? []).map((objeto) => objeto.name))
    const saidos = validos.filter((caminho) => apagados.has(caminho))
    const inexistentes = validos.filter((caminho) => !apagados.has(caminho))
    tirados += await tirarDaFila(admin, [...saidos, ...inexistentes])
    return tirados
  } catch (erro) {
    console.error("[fila de fotos] esvaziamento interrompido", erro)
    return tirados
  }
}
