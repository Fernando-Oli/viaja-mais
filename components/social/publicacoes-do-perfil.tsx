"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Camera, Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { PublicacoesGrade, type PublicacaoNaGrade } from "./publicacoes-grade";

/**
 * A aba "Publicações" do perfil /u/<username> (S06, modelo Instagram): a grade
 * única de posts da pessoa, do mais recente ao mais antigo, sem separar post de
 * viagem dos outros.
 *
 * - Lê por GET /api/social/perfis/<username>/posts, 12 por página. A rota
 *   devolve `proximo` (cursor opaco) enquanto houver mais; "Carregar mais"
 *   pede `?cursor=<proximo>` e junta ao fim. Nada de cliente Supabase nesta
 *   tela: quem decide o que cada um vê é a rota (403 vira "Esta conta é
 *   privada", como na aba Marcações).
 * - Depois do "Carregar mais", o foco vai ao primeiro post novo, para quem usa
 *   teclado ou leitor de tela continuar de onde parou (o botão some na última
 *   página).
 * - Estados: carregando, vazio (no próprio perfil, o convite a criar o primeiro
 *   post pelo botão "Criar" do cabeçalho), erro (com "Tentar de novo"), sessão
 *   vencida, conta privada e perfil inexistente. Falha no "Carregar mais"
 *   mantém o que já está na tela e avisa por `toast()`.
 *
 * @RF09.16 aba Publicações do perfil
 */

type Pagina = { posts: PublicacaoNaGrade[]; proximo: string | null };

type Estado =
  | { tipo: "carregando" }
  | { tipo: "pronto"; posts: PublicacaoNaGrade[]; proximo: string | null; primeiroNovo?: number }
  | { tipo: "privado" }
  | { tipo: "nao-encontrado" }
  | { tipo: "sessao" }
  | { tipo: "erro" };

export function PublicacoesDoPerfil({ username: daUrl, proprio }: { username: string; proprio: boolean }) {
  const username = daUrl.toLowerCase();
  const endereco = `/api/social/perfis/${encodeURIComponent(username)}/posts`;
  const { toast } = useToast();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [carregandoMais, setCarregandoMais] = useState(false);
  const primeiroNovo = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch(endereco);
        if (!ativo) return;
        if (r.status === 401) return setEstado({ tipo: "sessao" });
        if (r.status === 403) return setEstado({ tipo: "privado" });
        // 400 sem cursor é nome fora do formato: nenhum perfil pode tê-lo.
        if (r.status === 404 || r.status === 400) return setEstado({ tipo: "nao-encontrado" });
        if (!r.ok) throw new Error();
        const { posts, proximo } = (await r.json()) as Pagina;
        if (ativo) setEstado({ tipo: "pronto", posts, proximo });
      } catch {
        if (ativo) setEstado({ tipo: "erro" });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [endereco, tentativa]);

  // O foco vai ao primeiro post da página que acabou de chegar.
  useEffect(() => {
    if (estado.tipo === "pronto" && estado.primeiroNovo !== undefined) primeiroNovo.current?.focus();
  }, [estado]);

  async function carregarMais() {
    if (estado.tipo !== "pronto" || !estado.proximo) return;
    const cursor = estado.proximo;
    setCarregandoMais(true);
    try {
      const r = await fetch(`${endereco}?cursor=${encodeURIComponent(cursor)}`);
      if (r.status === 401) return setEstado({ tipo: "sessao" });
      // Entre uma página e outra a conta pode ter ficado privada (ou a sessão deixou de seguir).
      if (r.status === 403) return setEstado({ tipo: "privado" });
      if (!r.ok) throw new Error();
      const pagina = (await r.json()) as Pagina;
      setEstado((antes) => {
        if (antes.tipo !== "pronto") return antes;
        // Um post publicado entre as páginas pode empurrar outro para a página seguinte: não repete.
        const vistos = new Set(antes.posts.map((p) => p.id));
        const novos = pagina.posts.filter((p) => !vistos.has(p.id));
        return {
          tipo: "pronto",
          posts: [...antes.posts, ...novos],
          proximo: pagina.proximo,
          primeiroNovo: novos.length > 0 ? antes.posts.length : undefined,
        };
      });
    } catch (erro) {
      toast({
        title: "Erro",
        description:
          erro instanceof TypeError
            ? "Não foi possível falar com o servidor. Verifique a conexão e tente de novo."
            : "Não foi possível carregar mais publicações agora. Tente de novo.",
        variant: "destructive",
      });
    } finally {
      setCarregandoMais(false);
    }
  }

  return (
    <section aria-label="Publicações" aria-busy={estado.tipo === "carregando" || carregandoMais}>
      {estado.tipo === "carregando" ? (
        <div role="status" aria-label="Carregando publicações" className="grid grid-cols-3 gap-1 sm:gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-sm sm:rounded-md" />
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
          <p>Não foi possível carregar as publicações.</p>
          <Button variant="outline" size="sm" onClick={() => setTentativa((t) => t + 1)}>
            Tentar de novo
          </Button>
        </div>
      ) : estado.tipo === "privado" ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-10 text-center">
          <Lock className="h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="font-semibold text-foreground">Esta conta é privada</p>
          <p className="max-w-sm text-sm text-muted-foreground">Só quem segue @{username} vê as publicações dessa conta.</p>
        </div>
      ) : estado.tipo === "nao-encontrado" ? (
        <p className="text-sm text-muted-foreground">Nenhum perfil usa esse nome de usuário.</p>
      ) : estado.posts.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-4 py-10 text-center">
          <Camera className="h-10 w-10 text-muted-foreground" aria-hidden />
          <p className="font-semibold text-foreground">Nenhuma publicação ainda</p>
          {proprio ? (
            <p className="max-w-sm text-sm text-muted-foreground">
              Compartilhe a primeira: toque em <strong className="font-semibold text-foreground">Criar</strong>, no
              topo do perfil, escolha até 3 fotos e marque quem estava com você.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          <PublicacoesGrade publicacoes={estado.posts} primeiroNovo={estado.primeiroNovo} refPrimeiroNovo={primeiroNovo} />
          {estado.proximo ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                className="h-11 rounded-xl"
                disabled={carregandoMais}
                onClick={() => void carregarMais()}
              >
                {carregandoMais ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                Carregar mais
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
