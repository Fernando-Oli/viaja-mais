import type React from "react";
import DashboardLayout from "@/app/dashboard/layout";
import { PainelPessoas } from "./painel-pessoas";

/**
 * A aba Rede social: o painel de pessoas à esquerda e o conteúdo ao lado — o
 * feed (/feed) ou o perfil de outra pessoa (/u/<username>).
 *
 * Os dois moram num grupo de rotas do Next, `(rede-social)`, que não muda
 * endereço nenhum: servem para dividirem este layout. Assim o painel, com o
 * termo e os resultados, continua montado quando se abre um perfil pela busca.
 * Reaproveita o layout do painel por import, para manter o menu lateral; o
 * app/dashboard/layout.tsx, que é compartilhado, só ganhou a linha do menu.
 *
 * @RF09.10 buscar pessoas · @RF02.8 perfil de outro usuário
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
