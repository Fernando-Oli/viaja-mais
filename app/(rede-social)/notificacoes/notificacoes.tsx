"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Lock, UserRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { avisarTotalDeSolicitacoes } from "../sino";

/**
 * A central de Notificações da aba Rede social (S05-M-solicitacoes). Por
 * enquanto só a Zona 1, as solicitações para seguir: acionáveis e persistentes,
 * só saem quando o dono aprova ou recusa (seção 16). A Zona 2, de atividades,
 * depende da tabela `notifications` e fica para outra atividade.
 *
 * - Lê por GET /api/social/solicitacoes; aprova por POST e recusa por DELETE em
 *   /api/social/solicitacoes/<username>. Nada de cliente Supabase nesta tela.
 * - Aprovar ou recusar tira a pessoa da lista na hora, atualiza a bolinha do
 *   sino e anuncia o resultado. O botão some com a pessoa, então o foco vai
 *   para o título da lista, como no X da pesquisa.
 * - Cada pessoa com pedido em andamento tem os próprios botões travados, e só
 *   os dela são soltos quando ele termina: dá para resolver várias em sequência.
 * - Um 404 diz que a tela está velha (já resolvida em outro lugar, ou quem pediu
 *   trocou de username): a lista é recarregada do servidor, em vez de a tela
 *   adivinhar o total. Se outra ação terminar enquanto essa carga está no ar, a
 *   resposta dela é descartada e a carga é refeita: ela poderia trazer de volta
 *   quem acabou de ser resolvido.
 * - Com a sessão vencida, a bolinha do sino some junto com a lista.
 * - Recusar é silencioso: quem pediu não é avisado e pode pedir de novo.
 *
 * @RF09.3 ver solicitações pendentes · @RF09.4 aprovar ou recusar · @RF13.2 Zona 1 da central
 */

type Solicitacao = {
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_public: boolean;
};

type Estado =
  | { tipo: "carregando" }
  | { tipo: "pronto"; solicitacoes: Solicitacao[]; total: number }
  | { tipo: "sessao" }
  | { tipo: "erro" };

type Acao = "aprovar" | "recusar";

export function Notificacoes() {
  const { toast } = useToast();
  const idTitulo = useId();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [aviso, setAviso] = useState("");
  // Quem está com um pedido em andamento: os dois botões de cada uma ficam desabilitados.
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(() => new Set());
  const titulo = useRef<HTMLHeadingElement>(null);
  const focarTitulo = useRef(false);
  // Quantas ações (aprovar ou recusar) já terminaram. Uma carga pedida antes da
  // última que terminou pode trazer de volta quem acabou de sair: a resposta dela
  // é descartada, e a carga é refeita (achado m2 da 2ª revisão independente).
  const concluidas = useRef(0);

  useEffect(() => {
    if (!focarTitulo.current) return;
    focarTitulo.current = false;
    titulo.current?.focus();
  }, [estado]);

  // A bolinha do sino acompanha o total desta tela: ao carregar e a cada pessoa resolvida.
  useEffect(() => {
    if (estado.tipo === "pronto") avisarTotalDeSolicitacoes(estado.total);
  }, [estado]);

  useEffect(() => {
    let ativo = true;
    const pedidaEm = concluidas.current;
    (async () => {
      try {
        const r = await fetch("/api/social/solicitacoes");
        if (!ativo) return;
        if (r.status === 401) {
          // Como em sessaoVencida(), sem pô-la nas dependências do efeito.
          setEstado({ tipo: "sessao" });
          return avisarTotalDeSolicitacoes(0);
        }
        if (!r.ok) throw new Error();
        const { solicitacoes, total } = (await r.json()) as { solicitacoes: Solicitacao[]; total: number };
        if (!ativo) return;
        if (concluidas.current !== pedidaEm) return setTentativa((t) => t + 1);
        setEstado({ tipo: "pronto", solicitacoes, total });
      } catch {
        if (ativo) setEstado({ tipo: "erro" });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  /** A sessão acabou: a lista dá lugar ao aviso, e a bolinha do sino some com ela. */
  function sessaoVencida() {
    setEstado({ tipo: "sessao" });
    avisarTotalDeSolicitacoes(0);
  }

  function marcarOcupado(username: string, ocupado: boolean) {
    setOcupados((atuais) => {
      const novos = new Set(atuais);
      if (ocupado) novos.add(username);
      else novos.delete(username);
      return novos;
    });
  }

  async function resolver(username: string, acao: Acao) {
    marcarOcupado(username, true);
    try {
      const r = await fetch(`/api/social/solicitacoes/${encodeURIComponent(username)}`, {
        method: acao === "aprovar" ? "POST" : "DELETE",
      });
      if (r.status === 401) return sessaoVencida();
      if (r.status === 404) {
        // A tela está velha: quem sabe a lista e o total é o servidor.
        focarTitulo.current = true;
        const { codigo } = ((await r.json().catch(() => null)) ?? {}) as { codigo?: string };
        setTentativa((t) => t + 1);
        setAviso(
          codigo === "sem_pendente"
            ? `A solicitação de @${username} já tinha sido resolvida. A lista foi atualizada.`
            : "A lista de solicitações foi atualizada.",
        );
        return;
      }
      if (!r.ok) throw new Error();
      concluidas.current++;

      focarTitulo.current = true;
      // Funcional, e só se a pessoa ainda está na lista: resolver várias em
      // sequência, ou depois de um recarregamento, não desconta duas vezes.
      setEstado((atual) =>
        atual.tipo === "pronto" && atual.solicitacoes.some((s) => s.username === username)
          ? {
              tipo: "pronto",
              solicitacoes: atual.solicitacoes.filter((s) => s.username !== username),
              total: Math.max(0, atual.total - 1),
            }
          : atual,
      );
      setAviso(acao === "aprovar" ? `@${username} agora segue você.` : `A solicitação de @${username} foi recusada.`);
    } catch {
      toast({
        title: "Erro",
        description: acao === "aprovar" ? "Não foi possível aprovar agora. Tente de novo." : "Não foi possível recusar agora. Tente de novo.",
        variant: "destructive",
      });
    } finally {
      marcarOcupado(username, false);
    }
  }

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-semibold tracking-tight text-foreground">Notificações</h1>
      <Card>
        <CardContent className="space-y-3">
          {estado.tipo === "carregando" ? (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Carregando notificações...
            </p>
          ) : estado.tipo === "sessao" ? (
            <SessaoVencida />
          ) : estado.tipo === "erro" ? (
            <div role="alert" className="space-y-2 text-sm text-destructive">
              <p>Não foi possível carregar as notificações.</p>
              <Button variant="outline" size="sm" onClick={() => setTentativa((t) => t + 1)}>
                Tentar de novo
              </Button>
            </div>
          ) : (
            <section aria-labelledby={idTitulo} className="space-y-2">
              <p role="status" className="sr-only">
                {aviso}
              </p>
              <h2 id={idTitulo} ref={titulo} tabIndex={-1} className="rounded-sm font-semibold text-foreground">
                Solicitações para seguir ({estado.total})
              </h2>

              {estado.solicitacoes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma solicitação pendente.</p>
              ) : (
                <ul aria-label="Solicitações para seguir" className="space-y-1">
                  {estado.solicitacoes.map((s) => (
                    // No celular, os botões vão para baixo do nome: lado a lado, espremeriam o
                    // nome e o @ até sumirem.
                    <li key={s.username} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                      <div className="min-w-0 sm:flex-1">
                        <Pessoa pessoa={s} />
                      </div>
                      <div className="flex gap-2 pl-15 sm:pl-0">
                        <Button
                          size="sm"
                          className="bg-primary hover:bg-primary/90"
                          aria-label={`Aprovar @${s.username}`}
                          disabled={ocupados.has(s.username)}
                          onClick={() => resolver(s.username, "aprovar")}
                        >
                          Aprovar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          aria-label={`Recusar @${s.username}`}
                          disabled={ocupados.has(s.username)}
                          onClick={() => resolver(s.username, "recusar")}
                        >
                          Recusar
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SessaoVencida() {
  return (
    <div role="alert" className="space-y-2 text-sm text-destructive">
      <p>Sua sessão expirou.</p>
      <Button asChild variant="outline" size="sm">
        <Link href="/auth/login">Entrar de novo</Link>
      </Button>
    </div>
  );
}

function Pessoa({ pessoa }: { pessoa: Solicitacao }) {
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
