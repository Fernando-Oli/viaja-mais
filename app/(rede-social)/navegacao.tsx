"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { House, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * O menu da aba Rede social (S05-M-pesquisa): Início, que é o feed, e
 * Pesquisar. No desktop, uma coluna à esquerda do conteúdo; no celular, ícones
 * numa barra fixa no rodapé, como no Instagram (decisão do Micael em 21/10).
 *
 * O item da página aberta leva `aria-current="page"`. No perfil de outra pessoa
 * (/u/...) nenhum fica marcado: o perfil não é uma das opções do menu.
 *
 * @RF09.10 buscar pessoas · @RF09.12 histórico de pesquisa
 */

const ITENS = [
  { nome: "Início", href: "/feed", Icone: House },
  { nome: "Pesquisar", href: "/pesquisar", Icone: Search },
] as const;

export function NavegacaoRedeSocial() {
  const caminho = usePathname();

  return (
    <>
      {/* Desktop: coluna à esquerda do conteúdo. */}
      <Card className="hidden shrink-0 gap-0 p-2 md:sticky md:top-8 md:block md:w-56">
        <nav aria-label="Rede social">
          <ul className="space-y-1">
            {ITENS.map(({ nome, href, Icone }) => {
              const ativo = caminho === href;
              return (
                <li key={href}>
                  <Link
                    href={href}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                      ativo
                        ? "bg-gray-100 font-semibold text-viaja-navy"
                        : "font-medium text-gray-600 hover:bg-gray-100 hover:text-viaja-navy",
                    )}
                  >
                    <Icone className="h-5 w-5" aria-hidden />
                    {nome}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </Card>

      {/* Celular: ícones no rodapé. Começa depois do trilho do menu principal
          (w-20 em app/dashboard/layout.tsx), para não cobrir a foto do usuário. */}
      <nav aria-label="Rede social" className="fixed bottom-0 left-20 right-0 z-40 border-t border-gray-200 bg-white md:hidden">
        <ul className="flex">
          {ITENS.map(({ nome, href, Icone }) => {
            const ativo = caminho === href;
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-label={nome}
                  aria-current={ativo ? "page" : undefined}
                  className={cn(
                    "flex h-14 items-center justify-center transition-colors",
                    ativo ? "text-viaja-navy" : "text-gray-500 hover:text-viaja-navy",
                  )}
                >
                  <Icone className={cn("h-6 w-6", ativo && "stroke-[2.5]")} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
