import type React from "react";
import DashboardLayout from "@/app/dashboard/layout";
import { PainelPessoas } from "./painel-pessoas";

/**
 * A aba Rede social: o painel de pessoas à esquerda e o conteúdo (o feed) ao lado.
 *
 * Mora em /feed, o caminho do domínio Social no CLAUDE.md, e reaproveita o
 * layout do painel por import, para manter o menu lateral. O
 * app/dashboard/layout.tsx, que é compartilhado, só ganhou a linha do menu.
 *
 * @RF09.10 buscar pessoas
 */
export default function RedeSocialLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
        <PainelPessoas />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </DashboardLayout>
  );
}
