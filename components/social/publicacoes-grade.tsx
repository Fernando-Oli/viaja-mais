import Link from "next/link";
import type { Ref } from "react";
import { Images } from "lucide-react";
import { CapaViagem } from "@/components/brand/capa-viagem";

/**
 * A grade de posts da aba "Publicações" do perfil (S06, modelo Instagram):
 * quadrados em 3 colunas, no computador e no celular, cada um levando ao
 * detalhe do post em /feed/<id>. Só apresenta: quem lê a rota e pagina é
 * publicacoes-do-perfil.tsx.
 *
 * - A 1ª foto (URL assinada pelo servidor) ou, sem foto (só o post de viagem
 *   pode ter zero), o grafismo `CapaViagem` com `semente = id`, para dois posts
 *   vizinhos não ficarem iguais.
 * - `alt` da foto = `descricao` da rota (a legenda, o título da viagem ou
 *   "Publicação de @username"). No grafismo, que é decorativo, a mesma
 *   descrição vai em texto só para leitor de tela: o link sempre tem nome.
 * - Mais de uma foto: o ícone de "várias fotos" no canto, com o número em
 *   texto acessível ("3 fotos").
 *
 * @RF09.16 aba Publicações do perfil
 */

/** Um item da página de GET /api/social/perfis/[username]/posts. */
export type PublicacaoNaGrade = {
  id: string;
  foto: string | null;
  quantidade_fotos: number;
  descricao: string;
};

export function PublicacoesGrade({
  publicacoes,
  primeiroNovo,
  refPrimeiroNovo,
}: {
  publicacoes: PublicacaoNaGrade[];
  /** Índice do primeiro item da última página carregada: recebe o foco depois do "Carregar mais". */
  primeiroNovo?: number;
  refPrimeiroNovo?: Ref<HTMLAnchorElement>;
}) {
  return (
    <ul className="grid grid-cols-3 gap-1 sm:gap-2">
      {publicacoes.map((p, i) => (
        <li key={p.id} className="min-w-0">
          <Link
            href={`/feed/${p.id}`}
            ref={i === primeiroNovo ? refPrimeiroNovo : undefined}
            className="group relative block aspect-square overflow-hidden rounded-sm bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:rounded-md"
          >
            {p.foto ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, de validade curta
              <img
                src={p.foto}
                alt={p.descricao}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover transition-opacity group-hover:opacity-90"
              />
            ) : (
              <>
                <CapaViagem semente={p.id} className="absolute inset-0 h-full w-full" />
                <span className="sr-only">{p.descricao}</span>
              </>
            )}
            {p.quantidade_fotos > 1 ? (
              <span
                role="img"
                aria-label={`${p.quantidade_fotos} fotos`}
                className="absolute right-1.5 top-1.5 rounded-full bg-black/45 p-1 text-white sm:right-2 sm:top-2"
              >
                <Images className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden />
              </span>
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}
