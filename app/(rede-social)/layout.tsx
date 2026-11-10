import type React from "react";
import DashboardLayout from "@/app/dashboard/layout";
import { NavegacaoRedeSocial } from "./navegacao";
import { SinoNotificacoes } from "./sino";

/**
 * A aba Rede social: o menu da aba (Início e Pesquisar) e o conteúdo ao lado —
 * o feed (/feed), a pesquisa (/pesquisar), as notificações (/notificacoes) ou
 * o perfil de outra pessoa (/u/<username>) —, com o sino das notificações no
 * canto superior direito.
 *
 * Os quatro moram num grupo de rotas do Next, `(rede-social)`, que não muda
 * endereço nenhum: servem para dividirem este layout e o menu. Reaproveita o
 * layout do painel por import, para manter o menu lateral do app; o
 * app/dashboard/layout.tsx, que é compartilhado, só ganhou a linha do menu.
 *
 * O sino fica numa linha própria, no topo e à direita, em qualquer tamanho de
 * tela, como no Instagram: assim não cobre o título nem o cartão de nenhuma
 * página.
 *
 * No celular o menu da aba vira uma barra fixa no rodapé; o `pb-20` reserva o
 * espaço dela, para o fim do conteúdo não ficar escondido.
 *
 * @RF09.10 buscar pessoas · @RF09.12 histórico de pesquisa · @RF02.8 perfil de outro usuário ·
 * @RF13.2 Zona 1 da central
 */
export default function RedeSocialLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardLayout>
      <header className="-mt-2 mb-2 flex justify-end">
        <SinoNotificacoes />
      </header>
      <div className="flex flex-col gap-4 pb-20 md:flex-row md:items-start md:gap-6 md:pb-0">
        <NavegacaoRedeSocial />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </DashboardLayout>
  );
}
