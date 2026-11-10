"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * O sino das Notificações (S05-M-solicitacoes): no canto superior direito da
 * aba Rede social, no desktop e no celular, como no Instagram (decisão do
 * Micael em 10/11). Leva a /notificacoes, e a bolinha mostra quantas
 * solicitações para seguir estão pendentes.
 *
 * Não há tempo real (o projeto não usa Realtime): a contagem vem de
 * GET /api/social/solicitacoes?contagem=1 (só o número, sem lista nem fotos) ao
 * abrir cada página da aba e ao voltar para a janela. Com a sessão vencida, a
 * bolinha some: a contagem antiga não é mais da pessoa que está na tela. A tela de Notificações avisa na hora, pelo evento abaixo, quando o
 * dono aprova ou recusa.
 *
 * @RF13.2 Zona 1 da central · @RF13.4 central de notificações (parcial: sem não-lidas)
 */

const EVENTO = "viajamais:solicitacoes";

/** Para a tela de Notificações: o total de pendentes mudou. */
export function avisarTotalDeSolicitacoes(total: number) {
  window.dispatchEvent(new CustomEvent<number>(EVENTO, { detail: total }));
}

/** O texto da bolinha: até 9, o número; acima, "9+". */
export function textoDaBolinha(total: number) {
  return total > 9 ? "9+" : String(total);
}

function nomeAcessivel(total: number) {
  if (total === 0) return "Notificações";
  return total === 1 ? "Notificações: 1 solicitação pendente" : `Notificações: ${total} solicitações pendentes`;
}

export function SinoNotificacoes() {
  const caminho = usePathname();
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let ativo = true;
    async function contar() {
      try {
        const r = await fetch("/api/social/solicitacoes?contagem=1");
        // Sem sessão, a bolinha some; a página aberta é quem avisa da sessão
        // vencida. Com outro erro, fica a última contagem.
        if (r.status === 401) {
          if (ativo) setTotal(0);
          return;
        }
        if (!r.ok) return;
        const { total: novo } = (await r.json()) as { total: number };
        if (ativo) setTotal(novo);
      } catch {
        // Rede fora: mantém a última contagem.
      }
    }
    function aoMudar(evento: Event) {
      setTotal((evento as CustomEvent<number>).detail);
    }

    void contar();
    window.addEventListener("focus", contar);
    window.addEventListener(EVENTO, aoMudar);
    return () => {
      ativo = false;
      window.removeEventListener("focus", contar);
      window.removeEventListener(EVENTO, aoMudar);
    };
  }, [caminho]);

  const ativo = caminho === "/notificacoes";
  return (
    <Link
      href="/notificacoes"
      aria-label={nomeAcessivel(total)}
      aria-current={ativo ? "page" : undefined}
      className={cn(
        "relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-gray-100",
        ativo ? "text-viaja-navy" : "text-gray-600 hover:text-viaja-navy",
      )}
    >
      <Bell className={cn("h-6 w-6", ativo && "stroke-[2.5]")} aria-hidden />
      {total > 0 ? (
        <span
          aria-hidden
          data-testid="bolinha-notificacoes"
          className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-xs font-semibold leading-none text-white"
        >
          {textoDaBolinha(total)}
        </span>
      ) : null}
    </Link>
  );
}
