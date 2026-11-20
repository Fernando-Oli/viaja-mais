import type React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Globe, Lock, UserRound } from "lucide-react";
import type { PerfilVisto } from "@/lib/social/perfil-visto";

/**
 * O cabeçalho de um perfil no modelo do Instagram (S06-M-perfil-instagram),
 * o mesmo nos dois endereços: o próprio perfil (/dashboard/perfil, o "Perfil"
 * do menu) e o perfil visto por outra pessoa (/u/<username>).
 *
 * Foto, nome, @username com a visibilidade, os três contadores (publicações,
 * seguidores e seguindo), a bio e, num espaço próprio (`acoes`), os botões de
 * quem usa a página: Editar perfil e Criar no próprio perfil, Seguir/Solicitar
 * no de outra pessoa. `children` vai no fim do cartão (a região de status do
 * Seguir, no /u).
 *
 * Um só DOM para celular e desktop, reordenado pela grade: no celular, foto e
 * nome no topo, contadores, botões em linha e bio; no desktop, a foto à
 * esquerda, os botões empilhados à direita do nome. Assim nada se repete na
 * página (o botão de seguir guarda o foco por ref).
 *
 * Os contadores de seguidores e de seguindo levam às listas (RF09.6) só quando
 * a rede do perfil é visível a quem vê; quem decide de verdade é a rota das
 * listas (403). Contador nulo (a contagem falhou, ou as publicações de quem
 * não se pode ver) aparece como "—". Componente sem estado e sem dados próprios:
 * quem o usa lê o perfil por GET /api/social/perfis/<username>.
 *
 * @RF02.1 ver o próprio perfil · @RF02.8 perfil de outro usuário · @RF09.6 listas
 * @RF09.16 contador de publicações
 */

export type PerfilDoCabecalho = Pick<
  PerfilVisto,
  "username" | "full_name" | "avatar_url" | "bio" | "is_public" | "vinculo" | "seguidores" | "seguindo" | "publicacoes"
>;

const numero = new Intl.NumberFormat("pt-BR");

/** Os mesmos três casos da função `pode_ver_rede` do banco: o dono, quem segue com vínculo aceito, ou perfil público. */
export function podeVerRedeDo(perfil: Pick<PerfilVisto, "vinculo" | "is_public">) {
  return perfil.vinculo === "proprio" || perfil.vinculo === "seguindo" || perfil.is_public;
}

function Contador({
  valor,
  singular,
  plural,
  href,
}: {
  valor: number | null;
  singular: string;
  plural: string;
  href?: string;
}) {
  // O espaço entre número e rótulo fica no texto: o nome acessível do link é "3 seguidores".
  const conteudo = (
    <>
      <span className="font-semibold text-foreground">{valor === null ? "—" : numero.format(valor)}</span>{" "}
      <span className="text-muted-foreground sm:text-foreground">{valor === 1 ? singular : plural}</span>
    </>
  );
  const forma = "flex flex-col items-center rounded-sm sm:flex-row sm:gap-1";
  return (
    <li>
      {href ? (
        <Link href={href} className={`${forma} hover:underline`}>
          {conteudo}
        </Link>
      ) : (
        <span className={forma}>{conteudo}</span>
      )}
    </li>
  );
}

export function PerfilCabecalho({
  perfil,
  acoes,
  children,
}: {
  perfil: PerfilDoCabecalho;
  acoes?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const nome = perfil.full_name || perfil.username;
  const proprio = perfil.vinculo === "proprio";
  const rede = podeVerRedeDo(perfil);
  const base = `/u/${encodeURIComponent(perfil.username)}`;

  return (
    <Card role="region" aria-label={`Perfil de @${perfil.username}`}>
      <CardContent className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:gap-x-6 sm:gap-y-3">
        {/* A key recria o avatar quando a foto muda: o Avatar do Radix guarda
            "imagem carregada", e sem ela o ícone não voltava ao remover a foto. */}
        <Avatar
          key={perfil.avatar_url ?? "sem-foto"}
          className="col-start-1 row-start-1 h-20 w-20 shrink-0 sm:row-span-3 sm:h-28 sm:w-28"
        >
          {perfil.avatar_url ? <AvatarImage src={perfil.avatar_url} alt={`Foto de ${nome}`} /> : null}
          <AvatarFallback role="img" aria-label="Sem foto de perfil" className="bg-primary text-primary-foreground">
            <UserRound className="h-10 w-10 sm:h-12 sm:w-12" aria-hidden />
          </AvatarFallback>
        </Avatar>

        <div className="col-start-2 row-start-1 min-w-0 space-y-1">
          <h1 className="break-words text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{nome}</h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>@{perfil.username}</span>
            {proprio ? (
              <Badge variant="outline" className="gap-1">
                {perfil.is_public ? <Globe aria-hidden /> : <Lock aria-hidden />}
                {perfil.is_public ? "Público" : "Privado"}
              </Badge>
            ) : perfil.is_public ? null : (
              <Badge variant="outline" className="gap-1">
                <Lock aria-hidden />
                Perfil privado
              </Badge>
            )}
          </p>
        </div>

        {acoes ? (
          <div className="col-span-2 row-start-3 flex flex-wrap gap-2 [&>*]:flex-1 sm:col-span-1 sm:col-start-3 sm:row-span-2 sm:row-start-1 sm:flex-col sm:items-stretch sm:[&>*]:flex-none">
            {acoes}
          </div>
        ) : null}

        <ul
          aria-label="Contadores do perfil"
          className="col-span-2 row-start-2 grid grid-cols-3 gap-2 text-center text-sm sm:col-span-1 sm:col-start-2 sm:flex sm:gap-6 sm:text-left"
        >
          <Contador valor={perfil.publicacoes} singular="publicação" plural="publicações" />
          <Contador
            valor={perfil.seguidores}
            singular="seguidor"
            plural="seguidores"
            href={rede ? `${base}/seguidores` : undefined}
          />
          {/* "seguindo" não varia: "1 seguindo", "2 seguindo". */}
          <Contador valor={perfil.seguindo} singular="seguindo" plural="seguindo" href={rede ? `${base}/seguindo` : undefined} />
        </ul>

        {perfil.bio ? (
          <p className="col-span-2 row-start-4 whitespace-pre-line break-words text-foreground sm:col-span-2 sm:col-start-2 sm:row-start-3">
            {perfil.bio}
          </p>
        ) : null}

        {children}
      </CardContent>
    </Card>
  );
}
