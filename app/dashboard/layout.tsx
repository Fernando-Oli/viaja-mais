"use client";

import type React from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { House, LogOut, Plus, Search, Settings, UserRound, Luggage } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Logo } from "@/components/brand/logo";
import { SinoNotificacoes } from "@/app/(rede-social)/sino";
import { useAuth } from "@/context/auth-context";
import { cn } from "@/lib/utils";

/**
 * Casca do app logado (S12-F-rebranding-avori).
 *
 * Desktop (lg+): barra superior Floresta com a assinatura, as seções em
 * pílulas, Pesquisar, o sino, "Nova viagem" em Cítrico e o avatar.
 * Celular: a barra superior só com a assinatura, o sino e o avatar, e a barra
 * de abas fixa no rodapé (Início · Pesquisar · Nova · Viagens · Perfil). As
 * seções que não cabem nas abas (SO_NO_MENU) ficam no menu do avatar.
 * O `pb-28` do conteúdo reserva o espaço da barra de abas.
 */

const SECOES = [
  { nome: "Painel", href: "/dashboard", exato: true },
  { nome: "Feed", href: "/feed" },
  { nome: "Viagens", href: "/dashboard/trips" },
  { nome: "Agenda", href: "/dashboard/itinerary" },
  { nome: "Finanças", href: "/dashboard/finances" },
  { nome: "Reservas", href: "/dashboard/bookings" },
  { nome: "Lugares", href: "/dashboard/places" },
] as const;

/** Seções sem aba no celular: lá, entram no menu do avatar. */
const SO_NO_MENU = SECOES.filter((s) => s.href !== "/feed" && s.href !== "/dashboard/trips");

const ABAS = [
  { nome: "Início", href: "/feed", Icone: House },
  { nome: "Pesquisar", href: "/pesquisar", Icone: Search },
  { nome: "Nova viagem", href: "/dashboard/trips/criar", Icone: Plus, destaque: true },
  { nome: "Viagens", href: "/dashboard/trips", Icone: Luggage },
  { nome: "Perfil", href: "/dashboard/perfil", Icone: UserRound },
] as const;

function estaEm(caminho: string, href: string, exato?: boolean) {
  if (exato) return caminho === href;
  if (href === "/dashboard/trips") return caminho.startsWith(href) && !caminho.startsWith("/dashboard/trips/criar");
  if (href === "/dashboard/bookings" && caminho.startsWith("/dashboard/reservar")) return true;
  return caminho === href || caminho.startsWith(`${href}/`);
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile, loading, signOut } = useAuth();
  const router = useRouter();
  const caminho = usePathname() ?? "";

  useEffect(() => {
    if (!loading && !user) {
      router.push("/auth/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-x-4 bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-2xl text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const initials =
    profile?.full_name
      ?.split(" ")
      .map((n: string) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  const pilula = (ativo: boolean) =>
    cn(
      "inline-flex h-10 shrink-0 items-center rounded-full px-4 text-sm transition-colors",
      ativo
        ? "bg-primary-foreground font-semibold text-foreground"
        : "font-medium text-primary-foreground hover:bg-primary-foreground/10",
    );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-card focus:px-4 focus:py-2"
      >
        Pular para o conteúdo
      </a>

      <header className="sticky top-0 z-40 bg-primary text-primary-foreground">
        <div className="mx-auto flex h-16 max-w-[1360px] items-center gap-4 px-4 md:px-10 lg:h-[72px]">
          <Link href="/dashboard" className="flex shrink-0 rounded-md">
            <Logo variante="marfim" />
          </Link>

          <nav aria-label="Principal" className="hidden min-w-0 flex-1 items-center gap-1 lg:flex">
            {SECOES.map((s) => {
              const ativo = estaEm(caminho, s.href, "exato" in s ? s.exato : undefined);
              return (
                <Link key={s.href} href={s.href} aria-current={ativo ? "page" : undefined} className={pilula(ativo)}>
                  {s.nome}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/pesquisar"
              aria-label="Pesquisar"
              aria-current={caminho === "/pesquisar" ? "page" : undefined}
              className="hidden h-11 w-11 items-center justify-center rounded-full border border-primary-foreground/35 text-primary-foreground transition-colors hover:bg-primary-foreground/10 lg:inline-flex"
            >
              <Search className="h-5 w-5" aria-hidden />
            </Link>
            <SinoNotificacoes tom="escuro" />
            <Link
              href="/dashboard/trips/criar"
              className="hidden h-11 items-center gap-2 rounded-xl bg-citrico px-5 text-sm font-medium text-grafite transition-colors hover:bg-citrico/90 lg:inline-flex"
            >
              <Plus className="h-[18px] w-[18px]" aria-hidden />
              Nova viagem
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger
                className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-citrico"
              >
                <span className="sr-only">Minha conta, {profile?.full_name || "Usuário"}</span>
                <Avatar className="h-11 w-11" aria-hidden>
                  {profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- avatar do Storage, URL assinada
                    <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <AvatarFallback className="bg-primary-foreground font-semibold text-foreground">{initials}</AvatarFallback>
                  )}
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="flex flex-col">
                  <span>{profile?.full_name || "Usuário"}</span>
                  <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {SO_NO_MENU.map((s) => (
                  <DropdownMenuItem key={s.href} asChild className="lg:hidden">
                    <Link href={s.href} aria-current={estaEm(caminho, s.href, "exato" in s ? s.exato : undefined) ? "page" : undefined}>
                      {s.nome}
                    </Link>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator className="lg:hidden" />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/perfil">
                    <UserRound className="mr-2 h-4 w-4" />
                    Meu perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Configurações
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

      </header>

      <main id="conteudo" className="mx-auto w-full min-w-0 max-w-[1360px] flex-1 px-4 pb-28 pt-6 md:px-10 lg:pb-10 lg:pt-8">
        {children}
      </main>

      <nav aria-label="Atalhos" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card lg:hidden">
        <ul className="mx-auto flex h-16 max-w-lg items-center">
          {ABAS.map(({ nome, href, Icone, ...resto }) => {
            const ativo = estaEm(caminho, href);
            const destaque = "destaque" in resto && resto.destaque;
            return (
              <li key={href} className="flex flex-1 justify-center">
                <Link
                  href={href}
                  aria-label={nome}
                  aria-current={ativo ? "page" : undefined}
                  className={cn(
                    "inline-flex items-center justify-center transition-colors",
                    destaque
                      ? "h-11 w-14 rounded-2xl bg-citrico text-grafite"
                      : cn("h-12 w-12 rounded-full", ativo ? "text-primary" : "text-muted-foreground hover:text-foreground"),
                  )}
                >
                  <Icone className={cn("h-6 w-6", ativo && !destaque && "stroke-[2.5]")} aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
