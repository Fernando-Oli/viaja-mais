"use client";

import Link from "next/link";
import { Lock, Loader2, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CapaViagem } from "@/components/brand/capa-viagem";
// Só o tipo (o import some no build): a tela segue o formato que a rota devolve.
import type { AutorDaMarcacao, Marcacao } from "@/lib/social/aba-marcacoes";

/**
 * Um cartão da aba "Marcações" (RF09.14). Só apresenta: os dados chegam
 * prontos de GET /api/social/perfis/<username>/marcacoes, e remover é do
 * componente da aba (marcacoes-do-perfil.tsx).
 *
 * - Post que quem vê enxerga: autor, capa (a assinada ou o grafismo da marca),
 *   destino e datas sobre a faixa Floresta, título e legenda.
 * - Post que a própria pessoa marcada não enxerga (ser marcado não abre o
 *   post): só quem a marcou e o aviso de que a publicação é só para seguidores.
 *
 * Ainda não há página de detalhe do post: o cartão não linka para ela, só para
 * o perfil do autor.
 *
 * @RF09.14 aba Marcações
 */

const diaEMes = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" });
const diaMesEAno = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "12 de jun. – 18 de jun. de 2026"; as datas chegam como AAAA-MM-DD e são lidas em UTC, sem trocar de dia. */
export function periodo(inicio: string, fim: string): string {
  const a = new Date(`${inicio}T00:00:00Z`);
  const b = new Date(`${fim}T00:00:00Z`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "";
  if (inicio === fim) return diaMesEAno.format(b);
  const mesmoAno = a.getUTCFullYear() === b.getUTCFullYear();
  return `${mesmoAno ? diaEMes.format(a) : diaMesEAno.format(a)} – ${diaMesEAno.format(b)}`;
}

function AvatarDoAutor({ autor }: { autor: AutorDaMarcacao }) {
  const nome = autor.full_name || autor.username;
  return (
    <Avatar className="h-11 w-11 shrink-0">
      {autor.avatar_url ? <AvatarImage src={autor.avatar_url} alt={`Foto de ${nome}`} /> : null}
      <AvatarFallback role="img" aria-label="Sem foto de perfil" className="bg-primary text-primary-foreground">
        <UserRound className="h-5 w-5" aria-hidden />
      </AvatarFallback>
    </Avatar>
  );
}

export function MarcacaoCartao({
  marcacao,
  proprio,
  ocupado,
  aoRemover,
}: {
  marcacao: Marcacao;
  proprio: boolean;
  ocupado: boolean;
  aoRemover: (marcacao: Marcacao) => void;
}) {
  const { autor, post } = marcacao;
  const nome = autor.full_name || autor.username;

  const remover = proprio ? (
    <Button
      size="sm"
      variant="outline"
      className="h-9 shrink-0 self-start rounded-xl sm:self-center"
      disabled={ocupado}
      aria-label={`Remover marcação na publicação de @${autor.username}`}
      onClick={() => aoRemover(marcacao)}
    >
      {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
      Remover marcação
    </Button>
  ) : null;

  const cabecalho = (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Link
        href={`/u/${autor.username}`}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-lg hover:underline focus-visible:underline"
      >
        <AvatarDoAutor autor={autor} />
        <span className="min-w-0 leading-tight">
          <span className="block truncate text-sm font-semibold text-foreground">{nome}</span>
          <span className="block truncate text-xs font-medium text-muted-foreground">@{autor.username}</span>
        </span>
      </Link>
      {remover}
    </header>
  );

  if (!post) {
    return (
      <article
        aria-label={`Marcação de @${autor.username}`}
        className="space-y-3 rounded-2xl border border-border bg-card p-4 md:p-5"
      >
        {cabecalho}
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold text-foreground">{nome}</strong> marcou você numa publicação que só os
            seguidores veem.
          </span>
        </p>
      </article>
    );
  }

  const datas = periodo(post.start_date, post.end_date);
  return (
    <article aria-label={post.title} className="space-y-3.5 rounded-2xl border border-border bg-card p-4 md:p-5">
      {cabecalho}
      <CapaViagem src={post.cover_url} semente={marcacao.post_id} className="h-56 rounded-2xl md:h-72">
        <div className="absolute inset-x-0 bottom-0 bg-primary px-5 py-4 text-primary-foreground">
          <p className="break-words text-2xl font-semibold leading-tight md:text-3xl">{post.destination}</p>
          {datas ? <p className="text-sm font-medium">{datas}</p> : null}
        </div>
      </CapaViagem>
      <h3 className="break-words text-base font-semibold text-foreground">{post.title}</h3>
      {post.caption ? (
        <p className="whitespace-pre-line break-words text-sm text-foreground">
          <strong className="font-semibold">{nome}</strong> {post.caption}
        </p>
      ) : null}
    </article>
  );
}
