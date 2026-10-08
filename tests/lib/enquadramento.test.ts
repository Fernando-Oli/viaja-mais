import { describe, it, expect } from "vitest"
import {
  ZOOM_MAX,
  aplicarZoom,
  caixaNaTela,
  enquadramentoInicial,
  escalaBase,
  limitar,
  mover,
  recorteDaImagem,
} from "@/lib/social/enquadramento"

/**
 * Enquadramento da foto: a imagem sempre cobre a janela, o zoom é em torno do
 * centro, e o recorte final é exatamente o que estava dentro do círculo.
 *
 * @RF02.2
 */

// Foto deitada (900×600, como a do E2E) numa janela de 300 px.
const DEITADA = { largura: 900, altura: 600, janela: 300 }
// Foto em pé.
const EM_PE = { largura: 600, altura: 1200, janela: 300 }

describe("escalaBase e ponto de partida", () => {
  it("o lado menor preenche a janela", () => {
    expect(escalaBase(DEITADA)).toBe(0.5)
    expect(escalaBase(EM_PE)).toBe(0.5)
  })

  it("começa centralizado e sem zoom: recorte é o quadrado do meio", () => {
    expect(recorteDaImagem(enquadramentoInicial(), DEITADA)).toEqual({ x: 150, y: 0, lado: 600 })
    expect(recorteDaImagem(enquadramentoInicial(), EM_PE)).toEqual({ x: 0, y: 300, lado: 600 })
  })

  it("a caixa na tela cobre a janela e fica centralizada", () => {
    expect(caixaNaTela(enquadramentoInicial(), DEITADA)).toEqual({ largura: 450, altura: 300, esquerda: -75, topo: 0 })
  })
})

describe("arrastar", () => {
  it("arrastar para a direita mostra a parte esquerda da foto", () => {
    const e = mover(enquadramentoInicial(), 40, 0, DEITADA)
    expect(e.x).toBe(40)
    expect(recorteDaImagem(e, DEITADA).x).toBe(70) // 150 − 40/0,5
  })

  it("não passa da borda: a imagem continua cobrindo a janela", () => {
    // Sobra horizontal: (450 − 300)/2 = 75 px. Vertical: 0.
    expect(mover(enquadramentoInicial(), 500, 500, DEITADA)).toEqual({ zoom: 1, x: 75, y: 0 })
    expect(mover(enquadramentoInicial(), -500, -500, DEITADA)).toEqual({ zoom: 1, x: -75, y: 0 })
    expect(recorteDaImagem(mover(enquadramentoInicial(), 500, 0, DEITADA), DEITADA).x).toBe(0)
    expect(recorteDaImagem(mover(enquadramentoInicial(), -500, 0, DEITADA), DEITADA).x).toBe(300)
  })
})

describe("zoom", () => {
  it("zoom de 2× recorta um quadrado com metade do lado, no centro", () => {
    const e = aplicarZoom(enquadramentoInicial(), 2, DEITADA)
    expect(recorteDaImagem(e, DEITADA)).toEqual({ x: 300, y: 150, lado: 300 })
  })

  it("mantém o ponto do centro no centro: o deslocamento cresce com o zoom", () => {
    const deslocado = mover(enquadramentoInicial(), 40, 0, DEITADA)
    const ampliado = aplicarZoom(deslocado, 2, DEITADA)
    expect(ampliado.x).toBe(80)
    // O centro do recorte é o mesmo ponto da foto antes e depois.
    const centro = (r: { x: number; lado: number }) => r.x + r.lado / 2
    expect(centro(recorteDaImagem(ampliado, DEITADA))).toBe(centro(recorteDaImagem(deslocado, DEITADA)))
  })

  it("fica entre 1× e o máximo", () => {
    expect(aplicarZoom(enquadramentoInicial(), 10, DEITADA).zoom).toBe(ZOOM_MAX)
    expect(aplicarZoom(enquadramentoInicial(), 0.2, DEITADA).zoom).toBe(1)
  })

  it("ao diminuir o zoom, o deslocamento volta para dentro da borda", () => {
    const longe = mover(aplicarZoom(enquadramentoInicial(), 3, DEITADA), 1000, 1000, DEITADA)
    const volta = aplicarZoom(longe, 1, DEITADA)
    expect(volta).toEqual({ zoom: 1, x: 75, y: 0 })
  })

  it("limitar corrige um enquadramento fora das regras", () => {
    expect(limitar({ zoom: 7, x: 9999, y: -9999 }, EM_PE)).toEqual({ zoom: 3, x: 300, y: -750 })
  })
})

describe("recorte sempre dentro da imagem", () => {
  it.each([
    [{ zoom: 1, x: 0, y: 0 }],
    [{ zoom: 3, x: 0, y: 0 }],
    [{ zoom: 2.37, x: 123.4, y: -56.7 }],
    [{ zoom: 3, x: 675, y: 450 }],
  ])("enquadramento %o", (e) => {
    for (const d of [DEITADA, EM_PE]) {
      const r = recorteDaImagem(limitar(e, d), d)
      expect(r.x).toBeGreaterThanOrEqual(0)
      expect(r.y).toBeGreaterThanOrEqual(0)
      expect(r.x + r.lado).toBeLessThanOrEqual(d.largura + 1e-9)
      expect(r.y + r.lado).toBeLessThanOrEqual(d.altura + 1e-9)
    }
  })
})
