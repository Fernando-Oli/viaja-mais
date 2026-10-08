import type { Recorte } from "@/lib/social/enquadramento"

/**
 * Gera a foto de perfil no navegador, antes do envio: recorta o quadrado que a
 * pessoa enquadrou no modal e reduz para 512×512. Foto de celular de vários MB
 * vira ~100 KB.
 *
 * Fica ao lado da página, e não em lib/, porque depende de canvas e só roda no
 * navegador. A geometria do enquadramento está em lib/social/enquadramento.ts,
 * testada à parte. Quem garante o tipo e o tamanho é a rota: isto é conveniência.
 *
 * @RF02.2 foto de perfil
 */

export const LADO_FOTO = 512
export const TIPOS_ACEITOS = ["image/jpeg", "image/png", "image/webp"]

/** createImageBitmap respeita a orientação gravada pela câmera (EXIF) e falha para o que não é imagem. */
export function lerImagem(arquivo: File): Promise<ImageBitmap> {
  return createImageBitmap(arquivo)
}

function paraBlob(canvas: HTMLCanvasElement, tipo: string, qualidade: number): Promise<Blob> {
  return new Promise((resolver, rejeitar) =>
    canvas.toBlob((blob) => (blob ? resolver(blob) : rejeitar(new Error("não foi possível gerar a imagem"))), tipo, qualidade),
  )
}

export async function recortarFoto(imagem: ImageBitmap, recorte: Recorte): Promise<Blob> {
  const canvas = document.createElement("canvas")
  canvas.width = LADO_FOTO
  canvas.height = LADO_FOTO
  const contexto = canvas.getContext("2d")
  if (!contexto) throw new Error("não foi possível preparar a imagem")
  // Fundo branco: PNG com transparência viraria fundo preto se cair no JPEG.
  contexto.fillStyle = "#ffffff"
  contexto.fillRect(0, 0, LADO_FOTO, LADO_FOTO)
  contexto.imageSmoothingQuality = "high"
  contexto.drawImage(imagem, recorte.x, recorte.y, recorte.lado, recorte.lado, 0, 0, LADO_FOTO, LADO_FOTO)

  const webp = await paraBlob(canvas, "image/webp", 0.85)
  // Navegador que não codifica WebP devolve PNG no lugar; aí JPEG sai menor.
  return webp.type === "image/webp" ? webp : paraBlob(canvas, "image/jpeg", 0.85)
}
