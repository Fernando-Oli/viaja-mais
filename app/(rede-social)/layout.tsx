import type React from "react";
import DashboardLayout from "@/app/dashboard/layout";

/**
 * A aba Rede social: o feed (/feed), a pesquisa (/pesquisar), as notificações
 * (/notificacoes) e o perfil de outra pessoa (/u/<username>).
 *
 * Os quatro moram num grupo de rotas do Next, `(rede-social)`, que não muda
 * endereço nenhum. Desde o rebranding Avori (S12) o menu da aba, o sino e a
 * pesquisa ficam na barra do app (app/dashboard/layout.tsx): no desktop, Feed
 * e o botão Pesquisar na barra superior; no celular, Início e Pesquisar na
 * barra de abas do rodapé.
 *
 * @RF09.10 buscar pessoas · @RF09.12 histórico de pesquisa · @RF02.8 perfil de outro usuário ·
 * @RF13.2 Zona 1 da central
 */
export default function RedeSocialLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}
