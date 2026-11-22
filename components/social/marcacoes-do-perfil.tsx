"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AtSign, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import ConfirmModal from "@/components/ui/confirm-modal";
import { useToast } from "@/hooks/use-toast";
import { MarcacaoCartao, type Marcacao } from "./marcacoes-cartao";

/**
 * A aba "Marcações" do perfil /u/<username> (S06-M-publicar-viagem, RF09.14):
 * os posts em que a pessoa foi marcada, do mais recente ao mais antigo.
 *
 * - Lê por GET /api/social/perfis/<username>/marcacoes quando a aba abre. Nada
 *   de cliente Supabase nesta tela: quem decide o que cada um vê é a rota (403
 *   vira "Esta conta é privada"; ser marcado não abre o post).
 * - Na própria aba, cada cartão tem "Remover marcação": pede confirmação
 *   (`ConfirmModal`), apaga por DELETE /api/social/marcacoes/<postId>, tira o
 *   cartão da lista e avisa por `toast()`. Um 404 diz que a marca já não
 *   existia (removida em outra aba, ou o post foi apagado): o cartão sai do
 *   mesmo jeito. O autor não é avisado.
 * - Estados: carregando, vazio, erro (com "Tentar de novo"), sessão vencida e
 *   conta privada.
 * - Cada cartão de post visível leva ao detalhe do post, /feed/<post_id>.
 *
 * @RF09.14 aba Marcações e remover a própria marca
 */

type Estado =
  | { tipo: "carregando" }
  | { tipo: "pronto"; marcacoes: Marcacao[]; proprio: boolean }
  | { tipo: "privado" }
  | { tipo: "nao-encontrado" }
  | { tipo: "sessao" }
  | { tipo: "erro" };

function vazio(username: string, proprio: boolean) {
  return proprio
    ? "Quando alguém marcar você numa publicação, ela aparece aqui."
    : `@${username} ainda não foi marcado em nenhuma publicação que você pode ver.`;
}

export function MarcacoesDoPerfil({ username: daUrl }: { username: string }) {
  const username = daUrl.toLowerCase();
  const endereco = `/api/social/perfis/${encodeURIComponent(username)}/marcacoes`;
  const { toast } = useToast();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [alvo, setAlvo] = useState<Marcacao | null>(null);
  const [ocupados, setOcupados] = useState<ReadonlySet<string>>(() => new Set());
  const [aviso, setAviso] = useState("");
  const titulo = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch(endereco);
        if (!ativo) return;
        if (r.status === 401) return setEstado({ tipo: "sessao" });
        if (r.status === 403) return setEstado({ tipo: "privado" });
        // 400 é nome fora do formato: nenhum perfil pode tê-lo, então é o mesmo que não existir.
        if (r.status === 404 || r.status === 400) return setEstado({ tipo: "nao-encontrado" });
        if (!r.ok) throw new Error();
        const { marcacoes, proprio } = (await r.json()) as { marcacoes: Marcacao[]; proprio: boolean };
        if (ativo) setEstado({ tipo: "pronto", marcacoes, proprio });
      } catch {
        if (ativo) setEstado({ tipo: "erro" });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [endereco, tentativa]);

  function marcarOcupado(postId: string, ocupado: boolean) {
    setOcupados((antes) => {
      const depois = new Set(antes);
      if (ocupado) depois.add(postId);
      else depois.delete(postId);
      return depois;
    });
  }

  function tirarDaLista(postId: string) {
    setEstado((antes) =>
      antes.tipo === "pronto" ? { ...antes, marcacoes: antes.marcacoes.filter((m) => m.post_id !== postId) } : antes,
    );
    // O botão some com o cartão: o foco vai ao título da aba, para não cair no body.
    titulo.current?.focus();
  }

  async function remover(marcacao: Marcacao) {
    const { post_id: postId, autor } = marcacao;
    marcarOcupado(postId, true);
    setAviso("");
    try {
      const r = await fetch(`/api/social/marcacoes/${encodeURIComponent(postId)}`, { method: "DELETE" });
      if (r.status === 401) return setEstado({ tipo: "sessao" });
      if (r.status === 404) {
        tirarDaLista(postId);
        setAviso("Essa marcação já tinha sido removida.");
        toast({ title: "Marcação já removida", description: "Essa marcação não existia mais." });
        return;
      }
      if (!r.ok) throw new Error();
      tirarDaLista(postId);
      setAviso(`Sua marcação na publicação de @${autor.username} foi removida.`);
      toast({ title: "Marcação removida", description: `Você não aparece mais na publicação de @${autor.username}.` });
    } catch (erro) {
      toast({
        title: "Erro",
        description:
          erro instanceof TypeError
            ? "Não foi possível falar com o servidor. Verifique a conexão e tente de novo."
            : "Não foi possível remover a marcação agora. Tente de novo.",
        variant: "destructive",
      });
    } finally {
      marcarOcupado(postId, false);
    }
  }

  const proprio = estado.tipo === "pronto" && estado.proprio;

  return (
    <section aria-labelledby="titulo-marcacoes" className="space-y-4">
      <h2 id="titulo-marcacoes" ref={titulo} tabIndex={-1} className="sr-only">
        {proprio ? "Publicações em que você foi marcado" : `Publicações em que @${username} foi marcado`}
      </h2>
      <p role="status" className="sr-only">
        {aviso}
      </p>

      {estado.tipo === "carregando" ? (
        <div role="status" aria-label="Carregando marcações" className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="space-y-3 rounded-2xl border border-border bg-card p-4 md:p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 rounded-full" />
                <div className="space-y-2">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
              <Skeleton className="h-56 w-full rounded-2xl md:h-72" />
            </div>
          ))}
        </div>
      ) : estado.tipo === "sessao" ? (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>Sua sessão expirou.</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/auth/login">Entrar de novo</Link>
          </Button>
        </div>
      ) : estado.tipo === "erro" ? (
        <div role="alert" className="space-y-2 rounded-2xl border border-border bg-card p-4 text-sm text-destructive">
          <p>Não foi possível carregar as marcações.</p>
          <Button variant="outline" size="sm" onClick={() => setTentativa((t) => t + 1)}>
            Tentar de novo
          </Button>
        </div>
      ) : estado.tipo === "privado" ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-10 text-center">
          <Lock className="h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="font-semibold text-foreground">Esta conta é privada</p>
          <p className="max-w-sm text-sm text-muted-foreground">Só quem segue @{username} vê as marcações dessa conta.</p>
        </div>
      ) : estado.tipo === "nao-encontrado" ? (
        <p className="text-sm text-muted-foreground">Nenhum perfil usa esse nome de usuário.</p>
      ) : estado.marcacoes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-10 text-center">
          <AtSign className="h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="font-semibold text-foreground">Nenhuma marcação ainda</p>
          <p className="max-w-sm text-sm text-muted-foreground">{vazio(username, estado.proprio)}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {estado.marcacoes.map((m) => (
            <li key={m.post_id}>
              <MarcacaoCartao
                marcacao={m}
                proprio={estado.proprio}
                ocupado={ocupados.has(m.post_id)}
                aoRemover={setAlvo}
              />
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={alvo !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setAlvo(null);
        }}
        title="Remover sua marcação?"
        description={`Você deixa de aparecer na publicação de @${alvo?.autor.username ?? ""}. A publicação continua no perfil de quem publicou.`}
        confirmText="Remover"
        variant="destructive"
        onConfirm={() => {
          if (alvo) void remover(alvo);
        }}
      />
    </section>
  );
}
