/**
 * Geometria do enquadramento da foto de perfil — o "ajustar" do Instagram.
 *
 * A janela é um quadrado de lado `janela` (em px da tela). A imagem é mostrada
 * com escala `escalaBase × zoom`, onde a escala base a faz cobrir a janela
 * inteira com o lado menor. `x` e `y` são o deslocamento do centro da imagem em
 * relação ao centro da janela, em px da tela. A regra que vale sempre: a imagem
 * cobre a janela toda — não sobra faixa vazia no círculo do avatar.
 *
 * Funções puras, sem DOM: a tela as usa para arrastar, dar zoom e, no fim,
 * saber que pedaço da imagem original recortar.
 *
 * @RF02.2 foto de perfil
 */

export const ZOOM_MIN = 1
export const ZOOM_MAX = 3

export type Dimensoes = { largura: number; altura: number; janela: number }
export type Enquadramento = { zoom: number; x: number; y: number }
export type Recorte = { x: number; y: number; lado: number }

/** Escala em que o lado menor da imagem preenche a janela. */
export function escalaBase({ largura, altura, janela }: Dimensoes): number {
  return janela / Math.min(largura, altura)
}

// O `+ 0` transforma -0 em 0: sem sobra (lado que já encosta na janela), o limite
// é ±0, e -0 vazaria como "-0px" na tela.
const entre = (valor: number, minimo: number, maximo: number) => Math.min(Math.max(valor, minimo), maximo) + 0

/** Ponto de partida: imagem centralizada, sem zoom. */
export function enquadramentoInicial(): Enquadramento {
  return { zoom: ZOOM_MIN, x: 0, y: 0 }
}

/** Mantém a imagem cobrindo a janela: o deslocamento não passa da sobra de cada lado. */
export function limitar(e: Enquadramento, d: Dimensoes): Enquadramento {
  const zoom = entre(e.zoom, ZOOM_MIN, ZOOM_MAX)
  const escala = escalaBase(d) * zoom
  const sobraX = (d.largura * escala - d.janela) / 2
  const sobraY = (d.altura * escala - d.janela) / 2
  return { zoom, x: entre(e.x, -sobraX, sobraX), y: entre(e.y, -sobraY, sobraY) }
}

/** Arrastar: desloca e limita. */
export function mover(e: Enquadramento, dx: number, dy: number, d: Dimensoes): Enquadramento {
  return limitar({ zoom: e.zoom, x: e.x + dx, y: e.y + dy }, d)
}

/**
 * Zoom em torno do centro da janela: o ponto da imagem que está no centro
 * continua no centro, como no Instagram. Por isso o deslocamento cresce na
 * mesma proporção do zoom antes de ser limitado.
 */
export function aplicarZoom(e: Enquadramento, novoZoom: number, d: Dimensoes): Enquadramento {
  const zoom = entre(novoZoom, ZOOM_MIN, ZOOM_MAX)
  const fator = zoom / e.zoom
  return limitar({ zoom, x: e.x * fator, y: e.y * fator }, d)
}

/** Posição e tamanho da imagem na tela, para a renderização. */
export function caixaNaTela(e: Enquadramento, d: Dimensoes) {
  const escala = escalaBase(d) * e.zoom
  const largura = d.largura * escala
  const altura = d.altura * escala
  return {
    largura,
    altura,
    esquerda: d.janela / 2 + e.x - largura / 2,
    topo: d.janela / 2 + e.y - altura / 2,
  }
}

/**
 * O quadrado da imagem ORIGINAL que está dentro da janela — é o que vira a foto
 * de 512×512. Limitado às bordas da imagem por segurança contra arredondamento.
 */
export function recorteDaImagem(e: Enquadramento, d: Dimensoes): Recorte {
  const escala = escalaBase(d) * e.zoom
  const lado = Math.min(d.janela / escala, d.largura, d.altura)
  const centroX = d.largura / 2 - e.x / escala
  const centroY = d.altura / 2 - e.y / escala
  return {
    x: entre(centroX - lado / 2, 0, d.largura - lado),
    y: entre(centroY - lado / 2, 0, d.altura - lado),
    lado,
  }
}
