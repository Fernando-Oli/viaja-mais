"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ConfirmModal from "@/components/ui/confirm-modal";
import { ArrowLeft, Loader2, Lock, UserRound, UserRoundX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * As listas da rede de um perfil (S05-M-listas): /u/<username>/seguidores e
 * /u/<username>/seguindo, abertas pelos contadores do perfil, como no Instagram.
 *
 * - Lê por GET /api/social/perfis/<username>/<lado>, 20 por vez, e "Ver mais"
 *   pede a página seguinte com o cursor que a rota devolveu. Nada de cliente
 *   Supabase nesta tela.
 * - Quem decide se a rede é visível é a rota (403 vira "Esta conta é privada").
 * - Na própria lista de seguidores, Remover pede confirmação e apaga por DELETE
 *   /api/social/seguidores/<username>. A pessoa sai da lista na hora, a remoção
 *   é anunciada, e o foco vai ao título, porque o botão some com ela. Cada
 *   pessoa com pedido em andamento tem o próprio botão travado, e só o dela é
 *   solto quando ele termina.
 * - Um 404 ao remover, ou um cursor que a rota não acha mais, diz que a tela
 *   está velha: a lista é recarregada do começo. Se outra remoção terminar
 *   enquanto essa carga está no ar, a resposta dela é descartada e a carga é
 *   refeita: ela poderia trazer de volta quem acabou de sair.
 * - Remover é silencioso: a pessoa não é avisada e pode seguir de novo.
 *
 * @RF09.6 listas de seguidores e de seguindo · @RF09.9 remover seguidor
 */

export type Lado = "seguidores" | "seguindo";

type Pessoa = {
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_public: boolean;
};

type Estado =
  | { tipo: "carregando" }
  | { tipo: "pronto"; pessoas: Pessoa[]; proximo: string | null; proprio: boolean }
  | { tipo: "privado" }
  | { tipo: "nao-encontrado" }
  | { tipo: "sessao" }
  | { tipo: "erro" };

type Pagina = { pessoas: Pessoa[]; proximo: string | null; proprio: boolean };

function titulo(lado: Lado, username: string) {
  return lado === "seguidores" ? `Seguidores de @${username}` : `@${username} segue`;
}

function vazio(lado: Lado, username: string, proprio: boolean) {
  if (lado === "seguidores") return proprio ? "Ninguém segue você ainda." : `Ninguém segue @${username} ainda.`;
  return proprio ? "Você ainda não segue ninguém." : `@${username} ainda não segue ninguém.`;
}

export function ListaDaRede({ username: daUrl, lado }: { username: string; lado: Lado }) {
  const username = daUrl.toLowerCase();
  const endereco = `/api/social/perfis/${encodeURIComponent(username)}/${lado}`;
  const { toast } = useToast();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const [aviso, setAviso] = useState("");
  const [alvo, setAlvo] = useState<string | null>(null);
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(() => new Set());
  const cabecalho = useRef<HTMLHeadingElement>(null);
  const focarTitulo = useRef(false);
  const atual = useRef(estado);
  // Quantas remoções já terminaram. Uma carga pedida antes da última que
  // terminou pode trazer de volta quem acabou de sair: a resposta dela é
  // descartada, e a carga é refeita (achado m2 da revisão independente).
  const concluidas = useRef(0);

  useEffect(() => {
    atual.current = estado;
    if (!focarTitulo.current || estado.tipo !== "pronto") return;
    focarTitulo.current = false;
    cabecalho.current?.focus();
  }, [estado]);

  useEffect(() => {
    let ativo = true;
    const pedidaEm = concluidas.current;
    (async () => {
      try {
        const r = await fetch(endereco);
        if (!ativo) return;
        if (concluidas.current !== pedidaEm) return setTentativa((t) => t + 1);
        if (r.status === 401) return setEstado({ tipo: "sessao" });
        if (r.status === 403) return setEstado({ tipo: "privado" });
        // 400 é nome fora do formato: nenhum perfil pode tê-lo, então é o mesmo que não existir.
        if (r.status === 404 || r.status === 400) return setEstado({ tipo: "nao-encontrado" });
        if (!r.ok) throw new Error();
        const pagina = (await r.json()) as Pagina;
        if (ativo) setEstado({ tipo: "pronto", ...pagina });
      } catch {
        if (ativo) setEstado({ tipo: "erro" });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [endereco, tentativa]);

  function recarregar() {
    focarTitulo.current = true;
    setTentativa((t) => t + 1);
  }

  async function verMais() {
    const agora = atual.current;
    if (agora.tipo !== "pronto" || !agora.proximo) return;
    setCarregandoMais(true);
    try {
      const r = await fetch(`${endereco}?cursor=${encodeURIComponent(agora.proximo)}`);
      if (r.status === 401) return setEstado({ tipo: "sessao" });
      if (r.status === 403) return setEstado({ tipo: "privado" });
      // O cursor não acha mais a pessoa (ela deixou a lista): recomeça do início.
      if (r.status === 400) {
        setAviso("A lista mudou e foi carregada de novo.");
        return recarregar();
      }
      if (!r.ok) throw new Error();
      const pagina = (await r.json()) as Pagina;
      setEstado((antes) => {
        if (antes.tipo !== "pronto") return antes;
        const vistos = new Set(antes.pessoas.map((p) => p.username));
        return {
          ...antes,
          pessoas: [...antes.pessoas, ...pagina.pessoas.filter((p) => !vistos.has(p.username))],
          proximo: pagina.proximo,
        };
      });
    } catch {
      toast({ title: "Erro", description: "Não foi possível carregar mais agora. Tente de novo.", variant: "destructive" });
    } finally {
      setCarregandoMais(false);
    }
  }

  function marcarOcupado(quem: string, ocupado: boolean) {
    setOcupados((antes) => {
      const depois = new Set(antes);
      if (ocupado) depois.add(quem);
      else depois.delete(quem);
      return depois;
    });
  }

  async function remover(quem: string) {
    marcarOcupado(quem, true);
    try {
      const r = await fetch(`/api/social/seguidores/${encodeURIComponent(quem)}`, { method: "DELETE" });
      if (r.status === 401) return setEstado({ tipo: "sessao" });
      // 404: a tela está velha (a pessoa já saiu, ou trocou de username). Recarrega.
      if (r.status === 404) {
        const { codigo } = (await r.json().catch(() => ({}))) as { codigo?: string };
        if (codigo === "nao_e_seguidor") setAviso(`@${quem} já não segue você.`);
        return recarregar();
      }
      if (!r.ok) throw new Error();
      concluidas.current++;

      const antes = atual.current;
      const restantes = antes.tipo === "pronto" ? antes.pessoas.filter((p) => p.username !== quem) : [];
      // Se quem saiu era o cursor e não sobrou ninguém carregado, não há de onde continuar.
      if (antes.tipo === "pronto" && antes.proximo === quem && restantes.length === 0) {
        setAviso(`@${quem} saiu dos seus seguidores.`);
        return recarregar();
      }
      focarTitulo.current = true;
      setEstado((anterior) => {
        if (anterior.tipo !== "pronto") return anterior;
        const pessoas = anterior.pessoas.filter((p) => p.username !== quem);
        // O cursor é a última pessoa carregada: se ela saiu, a anterior continua dali.
        const proximo = anterior.proximo === quem ? (pessoas.at(-1)?.username ?? null) : anterior.proximo;
        return { ...anterior, pessoas, proximo };
      });
      setAviso(`@${quem} saiu dos seus seguidores.`);
    } catch {
      toast({ title: "Erro", description: "Não foi possível remover agora. Tente de novo.", variant: "destructive" });
    } finally {
      marcarOcupado(quem, false);
    }
  }

  return (
    <div className="space-y-4">
      <Link
        href={`/u/${username}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Perfil de @{username}
      </Link>
      <h1 ref={cabecalho} tabIndex={-1} className="rounded-sm text-3xl font-semibold tracking-tight text-foreground">
        {titulo(lado, username)}
      </h1>
      <p role="status" className="sr-only">
        {aviso}
      </p>

      <Card>
        <CardContent className="space-y-3">
          {estado.tipo === "carregando" ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Carregando...
            </p>
          ) : estado.tipo === "sessao" ? (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>Sua sessão expirou.</p>
              <Button asChild variant="outline" size="sm">
                <Link href="/auth/login">Entrar de novo</Link>
              </Button>
            </div>
          ) : estado.tipo === "erro" ? (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>Não foi possível carregar a lista.</p>
              <Button variant="outline" size="sm" onClick={() => setTentativa((t) => t + 1)}>
                Tentar de novo
              </Button>
            </div>
          ) : estado.tipo === "privado" ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Lock className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="font-semibold text-foreground">Esta conta é privada</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Só quem segue @{username} vê quem segue e quem é seguido por essa conta.
              </p>
              <Button asChild variant="outline">
                <Link href={`/u/${username}`}>Ver o perfil</Link>
              </Button>
            </div>
          ) : estado.tipo === "nao-encontrado" ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <UserRoundX className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="font-semibold text-foreground">Perfil não encontrado</p>
              <p className="text-sm text-muted-foreground">Confira o endereço: nenhum perfil usa esse nome de usuário.</p>
              <Button asChild variant="outline">
                <Link href="/feed">Voltar à Rede social</Link>
              </Button>
            </div>
          ) : estado.pessoas.length === 0 ? (
            <p className="text-sm text-muted-foreground">{vazio(lado, username, estado.proprio)}</p>
          ) : (
            <>
              <ul aria-label={titulo(lado, username)} className="space-y-1">
                {estado.pessoas.map((p) => (
                  // No celular, o Remover vai para baixo do nome: lado a lado, ele cortava o nome
                  // com reticências (regressão no E2E), como nas Notificações.
                  <li key={p.username} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                    <div className="min-w-0 sm:flex-1">
                      <ItemPessoa pessoa={p} />
                    </div>
                    {estado.proprio && lado === "seguidores" ? (
                      <Button
                        className="ml-15 self-start sm:ml-0 sm:self-auto"
                        size="sm"
                        variant="outline"
                        aria-label={`Remover @${p.username}`}
                        disabled={ocupados.has(p.username)}
                        onClick={() => setAlvo(p.username)}
                      >
                        Remover
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
              {estado.proximo ? (
                <div className="flex justify-center pt-1">
                  <Button variant="outline" size="sm" onClick={verMais} disabled={carregandoMais}>
                    {carregandoMais ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                    Ver mais
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      <ConfirmModal
        open={alvo !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setAlvo(null);
        }}
        title={`Remover @${alvo ?? ""} dos seus seguidores?`}
        description={`@${alvo ?? ""} não recebe nenhum aviso e pode voltar a seguir você.`}
        confirmText="Remover"
        variant="destructive"
        onConfirm={() => {
          if (alvo) void remover(alvo);
        }}
      />
    </div>
  );
}

function ItemPessoa({ pessoa }: { pessoa: Pessoa }) {
  const nome = pessoa.full_name || pessoa.username;
  return (
    <Link
      href={`/u/${pessoa.username}`}
      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted focus-visible:bg-muted"
    >
      <Avatar className="h-10 w-10">
        {pessoa.avatar_url ? <AvatarImage src={pessoa.avatar_url} alt={`Foto de ${nome}`} /> : null}
        <AvatarFallback role="img" aria-label="Sem foto de perfil" className="bg-primary text-primary-foreground">
          <UserRound className="h-5 w-5" aria-hidden />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-sm font-medium text-foreground">
          <span className="truncate">{nome}</span>
          {pessoa.is_public ? null : (
            <span role="img" aria-label="Perfil privado" title="Perfil privado" className="shrink-0">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">@{pessoa.username}</p>
      </div>
    </Link>
  );
}
