"use client";

import Link from "next/link";
import { Lock, Loader2, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { CapaViagem } from "@/components/brand/capa-viagem";

/**
 * Um cartão da aba "Marcações" (RF09.14). Só apresenta: os dados chegam
 * prontos de GET /api/social/perfis/<username>/marcacoes, e remover é do
 * componente da aba (marcacoes-do-perfil.tsx).
 *
 * - Post que quem vê enxerga: autor e a 1ª foto do post (`foto`, assinada pelo
 *   servidor) ou, num post de viagem sem fotos, o grafismo da marca com
 *   `semente = post_id`. A imagem leva ao detalhe, /feed/<post_id>. No post de
 *   viagem, destino e datas vão sobre a faixa Floresta e o título embaixo; em
 *   todo post, a legenda.
 * - Post que a própria pessoa marcada não enxerga (ser marcado não abre o
 *   post): só quem a marcou e o aviso de que a publicação é só para seguidores.
 *   Sem link: o detalhe responderia 404.
 *
 * Os tipos espelham o JSON de GET /api/social/perfis/<username>/marcacoes
 * (contrato do post de 18/11): ficam aqui, como em publicar-modelo.ts, porque a
 * tela só conhece o JSON da rota. Num post sem viagem, os quatro campos da
 * viagem chegam nulos.
 *
 * @RF09.14 aba Marcações
 */

/** Do autor, só o que o cartão mostra; o link do perfil sai do username. */
export type AutorDaMarcacao = {
  username: string;
  full_name: string | null;
  avatar_url: string | null;
};

/** O resumo do post que o cartão mostra, quando quem vê enxerga o post. */
export type ResumoDoPost = {
  /** Os quatro da viagem: nulos num post sem viagem. */
  title: string | null;
  destination: string | null;
  start_date: string | null;
  end_date: string | null;
  caption: string | null;
  /** A 1ª foto, assinada; `null` só em post de viagem sem fotos (grafismo). */
  foto: string | null;
};

/** Uma marcação na aba. `post` nulo: a própria pessoa marcada não enxerga o post. */
export type Marcacao = {
  post_id: string;
  marcado_em: string;
  autor: AutorDaMarcacao;
  post: ResumoDoPost | null;
};

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

  const deViagem = post.title !== null && post.destination !== null;
  const datas = post.start_date && post.end_date ? periodo(post.start_date, post.end_date) : "";
  const nomeDoPost = post.title ?? `Publicação de @${autor.username}`;
  return (
    <article aria-label={nomeDoPost} className="space-y-3.5 rounded-2xl border border-border bg-card p-4 md:p-5">
      {cabecalho}
      <Link
        href={`/feed/${marcacao.post_id}`}
        aria-label={
          deViagem
            ? `Abrir a publicação de @${autor.username}: ${post.destination}${datas ? `, ${datas}` : ""}`
            : `Abrir a publicação de @${autor.username}`
        }
        className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <CapaViagem
          src={post.foto}
          semente={marcacao.post_id}
          className={deViagem ? "h-56 rounded-2xl md:h-72" : "aspect-square w-full rounded-2xl sm:aspect-[4/3]"}
        >
          {deViagem ? (
            <div className="absolute inset-x-0 bottom-0 bg-primary px-5 py-4 text-primary-foreground">
              <p className="break-words text-2xl font-semibold leading-tight md:text-3xl">{post.destination}</p>
              {datas ? <p className="text-sm font-medium">{datas}</p> : null}
            </div>
          ) : null}
        </CapaViagem>
      </Link>
      {post.title ? <h3 className="break-words text-base font-semibold text-foreground">{post.title}</h3> : null}
      {post.caption ? (
        <p className="whitespace-pre-line break-words text-sm text-foreground">
          <strong className="font-semibold">{nome}</strong> {post.caption}
        </p>
      ) : null}
    </article>
  );
}
