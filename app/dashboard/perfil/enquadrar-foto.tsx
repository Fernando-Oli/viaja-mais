"use client";

import type React from "react";

import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ZoomIn, ZoomOut } from "lucide-react";
import {
  ZOOM_MAX,
  ZOOM_MIN,
  aplicarZoom,
  caixaNaTela,
  enquadramentoInicial,
  mover,
  recorteDaImagem,
  type Dimensoes,
  type Enquadramento,
  type Recorte,
} from "@/lib/social/enquadramento";

/**
 * Modal de enquadramento da foto de perfil, como o "ajustar" do Instagram:
 * arrastar posiciona (mouse ou dedo), o zoom vem do controle, da roda do mouse
 * ou da pinça no celular, e as setas/+/− fazem o mesmo pelo teclado. O círculo
 * mostra exatamente o que vai virar o avatar.
 *
 * A matemática (limites, zoom em torno do centro, recorte final) está em
 * lib/social/enquadramento.ts, testada à parte; aqui só há eventos e desenho.
 *
 * @RF02.2 foto de perfil
 */

/** Lado da janela de enquadramento, em px — cabe no modal de um celular de 320 px. */
const JANELA = 272;
const PASSO_TECLADO = 12;
const PASSO_ZOOM = 0.1;

type Props = {
  foto: { imagem: ImageBitmap; url: string } | null;
  enviando: boolean;
  onCancelar: () => void;
  onAplicar: (recorte: Recorte) => void;
};

export function EnquadrarFoto({ foto, enviando, onCancelar, onAplicar }: Props) {
  // A key recomeça o enquadramento a cada foto escolhida.
  return (
    <Dialog open={foto !== null} onOpenChange={(aberto) => !aberto && !enviando && onCancelar()}>
      {foto ? (
        <JanelaDeEnquadramento key={foto.url} foto={foto} enviando={enviando} onCancelar={onCancelar} onAplicar={onAplicar} />
      ) : null}
    </Dialog>
  );
}

function JanelaDeEnquadramento({
  foto,
  enviando,
  onCancelar,
  onAplicar,
}: Props & { foto: NonNullable<Props["foto"]> }) {
  const dimensoes: Dimensoes = { largura: foto.imagem.width, altura: foto.imagem.height, janela: JANELA };
  const [enquadramento, setEnquadramento] = useState<Enquadramento>(enquadramentoInicial);
  // Ponteiros ativos: um arrasta, dois fazem pinça.
  const ponteiros = useRef(new Map<number, { x: number; y: number }>());
  const distanciaDaPinca = useRef<number | null>(null);

  const caixa = caixaNaTela(enquadramento, dimensoes);

  function distanciaEntrePonteiros() {
    const [a, b] = [...ponteiros.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function aoPressionar(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    distanciaDaPinca.current = ponteiros.current.size === 2 ? distanciaEntrePonteiros() : null;
  }

  function aoMover(e: React.PointerEvent<HTMLDivElement>) {
    const anterior = ponteiros.current.get(e.pointerId);
    if (!anterior) return;
    ponteiros.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (ponteiros.current.size === 2 && distanciaDaPinca.current) {
      const distancia = distanciaEntrePonteiros();
      const fator = distancia / distanciaDaPinca.current;
      distanciaDaPinca.current = distancia;
      setEnquadramento((atual) => aplicarZoom(atual, atual.zoom * fator, dimensoes));
    } else if (ponteiros.current.size === 1) {
      const dx = e.clientX - anterior.x;
      const dy = e.clientY - anterior.y;
      setEnquadramento((atual) => mover(atual, dx, dy, dimensoes));
    }
  }

  function aoSoltar(e: React.PointerEvent<HTMLDivElement>) {
    ponteiros.current.delete(e.pointerId);
    distanciaDaPinca.current = ponteiros.current.size === 2 ? distanciaEntrePonteiros() : null;
  }

  function aoRolar(e: React.WheelEvent<HTMLDivElement>) {
    const fator = e.deltaY < 0 ? 1 + PASSO_ZOOM : 1 / (1 + PASSO_ZOOM);
    setEnquadramento((atual) => aplicarZoom(atual, atual.zoom * fator, dimensoes));
  }

  function aoTeclar(e: React.KeyboardEvent<HTMLDivElement>) {
    const movimentos: Record<string, [number, number]> = {
      ArrowLeft: [-PASSO_TECLADO, 0],
      ArrowRight: [PASSO_TECLADO, 0],
      ArrowUp: [0, -PASSO_TECLADO],
      ArrowDown: [0, PASSO_TECLADO],
    };
    if (movimentos[e.key]) {
      e.preventDefault();
      const [dx, dy] = movimentos[e.key];
      setEnquadramento((atual) => mover(atual, dx, dy, dimensoes));
    } else if (e.key === "+" || e.key === "=" || e.key === "-") {
      e.preventDefault();
      const delta = e.key === "-" ? -PASSO_ZOOM : PASSO_ZOOM;
      setEnquadramento((atual) => aplicarZoom(atual, atual.zoom + delta, dimensoes));
    }
  }

  return (
    <DialogContent
      showCloseButton={false}
      className="sm:max-w-sm"
      // Clicar fora durante o envio não pode fechar e perder o resultado.
      onInteractOutside={(e) => enviando && e.preventDefault()}
      onEscapeKeyDown={(e) => enviando && e.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>Ajustar foto</DialogTitle>
        <DialogDescription>Arraste para posicionar e use o zoom. O círculo é o que aparece no seu perfil.</DialogDescription>
      </DialogHeader>

      <div
        role="application"
        aria-label="Área de enquadramento: arraste ou use as setas para posicionar; + e − para zoom"
        tabIndex={0}
        className="relative mx-auto cursor-grab touch-none select-none overflow-hidden rounded-md bg-black outline-none focus-visible:ring-2 focus-visible:ring-viaja-orange active:cursor-grabbing"
        style={{ width: JANELA, height: JANELA }}
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerCancel={aoSoltar}
        onWheel={aoRolar}
        onKeyDown={aoTeclar}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem local (object URL), sem otimização */}
        <img
          src={foto.url}
          alt="Foto escolhida"
          draggable={false}
          className="pointer-events-none absolute max-w-none"
          style={{ width: caixa.largura, height: caixa.altura, left: caixa.esquerda, top: caixa.topo }}
        />
        {/* Máscara: escurece tudo fora do círculo que vira o avatar. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/80"
          style={{ boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)" }}
        />
      </div>

      <div className="flex items-center gap-3">
        <ZoomOut className="h-4 w-4 text-gray-500" aria-hidden />
        <input
          type="range"
          aria-label="Zoom"
          min={ZOOM_MIN}
          max={ZOOM_MAX}
          step={0.01}
          value={enquadramento.zoom}
          onChange={(e) => setEnquadramento((atual) => aplicarZoom(atual, Number(e.target.value), dimensoes))}
          disabled={enviando}
          className="w-full"
          // A cor da marca vem de classes escritas à mão em app/globals.css, não do
          // tema do Tailwind — não existe accent-viaja-orange. Mesmo valor de .bg-viaja-orange.
          style={{ accentColor: "#ff7f50" }}
        />
        <ZoomIn className="h-4 w-4 text-gray-500" aria-hidden />
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancelar} disabled={enviando}>
          Cancelar
        </Button>
        <Button
          type="button"
          className="bg-viaja-orange hover:bg-viaja-orange/90"
          onClick={() => onAplicar(recorteDaImagem(enquadramento, dimensoes))}
          disabled={enviando}
        >
          {enviando ? "Enviando..." : "Aplicar"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
