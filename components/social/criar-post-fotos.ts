import { LIMITE_FOTO_BYTES, TIPOS_FOTO } from "@/lib/social/foto"
import { MAXIMO_FOTOS } from "./post-detalhe-modelo"

/**
 * A seleção de fotos do "Criar" (passo 1), sem I/O: o que entra, o que é
 * recusado e por quê. A tela (criar-post.tsx) cuida das URLs de prévia.
 *
 * - A ordem é a da escolha: o que vem depois entra depois, e é essa a ordem
 *   do carrossel e do multipart (`fotos`).
 * - Escolher de novo acrescenta, até `MAXIMO_FOTOS`; o que passa fica de fora.
 * - Tipo e tamanho são conferidos aqui com os limites da capa
 *   (lib/social/foto.ts) só para avisar cedo: quem decide é a rota, que lê a
 *   assinatura do arquivo e reprocessa a imagem.
 *
 * @RF09.15 post com fotos — de 1 a 3, na ordem escolhida
 */

export type MotivoRecusa = "tipo" | "tamanho"

export type ResultadoDaEscolha<T> = {
  /** As fotos depois da escolha: as de antes, e as novas aceitas, na ordem. */
  fotos: T[]
  /** Arquivos recusados por tipo ou tamanho. */
  recusados: Array<{ nome: string; motivo: MotivoRecusa }>
  /** Quantos arquivos válidos ficaram de fora por passar do limite. */
  excedentes: number
}

export function motivoDeRecusa(arquivo: Pick<File, "type" | "size">): MotivoRecusa | null {
  if (!(TIPOS_FOTO as readonly string[]).includes(arquivo.type)) return "tipo"
  if (arquivo.size > LIMITE_FOTO_BYTES) return "tamanho"
  return null
}

/** Acrescenta os arquivos escolhidos às fotos atuais. `criar` monta a foto da tela a partir do arquivo aceito. */
export function acrescentarFotos<T>(
  atuais: T[],
  arquivos: File[],
  criar: (arquivo: File) => T,
  maximo: number = MAXIMO_FOTOS,
): ResultadoDaEscolha<T> {
  const fotos = [...atuais]
  const recusados: ResultadoDaEscolha<T>["recusados"] = []
  let excedentes = 0
  for (const arquivo of arquivos) {
    const motivo = motivoDeRecusa(arquivo)
    if (motivo) {
      recusados.push({ nome: arquivo.name, motivo })
      continue
    }
    if (fotos.length >= maximo) {
      excedentes++
      continue
    }
    fotos.push(criar(arquivo))
  }
  return { fotos, recusados, excedentes }
}

/** O aviso de uma escolha com recusas, ou `null` se tudo entrou. */
export function avisoDaEscolha(resultado: Pick<ResultadoDaEscolha<unknown>, "recusados" | "excedentes">, maximo = MAXIMO_FOTOS) {
  const partes: string[] = []
  const porTipo = resultado.recusados.filter((r) => r.motivo === "tipo")
  const porTamanho = resultado.recusados.filter((r) => r.motivo === "tamanho")
  if (porTipo.length > 0) partes.push(`${listar(porTipo.map((r) => r.nome))}: envie JPEG, PNG ou WebP.`)
  if (porTamanho.length > 0) partes.push(`${listar(porTamanho.map((r) => r.nome))}: cada foto pode ter até 2 MB.`)
  if (resultado.excedentes > 0) {
    partes.push(
      `Um post tem até ${maximo} fotos; ${resultado.excedentes === 1 ? "1 ficou" : `${resultado.excedentes} ficaram`} de fora.`,
    )
  }
  return partes.length > 0 ? partes.join(" ") : null
}

function listar(nomes: string[]) {
  return nomes.length === 1 ? nomes[0] : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`
}
