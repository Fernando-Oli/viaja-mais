"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BotaoCriarPost } from "@/components/social/criar-post";
import { PerfilAbas } from "@/components/social/perfil-abas";
import { PerfilCabecalho, type PerfilDoCabecalho } from "@/components/social/perfil-cabecalho";

/**
 * O próprio perfil (domínio Social, S06-M-perfil-instagram): o "Perfil" do
 * menu, no modelo do Instagram. Cabeçalho com foto, nome, @username,
 * visibilidade, contadores (publicações, seguidores e seguindo, os dois
 * últimos abrindo as listas) e bio; "Editar perfil" e "Criar"; e as abas
 * Publicações e Marcações. Cabeçalho e abas são os mesmos do /u/<username>,
 * o endereço que os outros abrem.
 *
 * Lê por duas rotas que já existem, sem cliente Supabase nesta tela:
 * GET /api/social/perfil diz o username da sessão, e GET
 * /api/social/perfis/<username> devolve o perfil com contadores e foto
 * assinada, como os outros o veem. Quem ainda não tem username vai direto ao
 * formulário (/dashboard/perfil/editar): a rede social exige um.
 *
 * @RF02.1 visualizar o próprio perfil · @RF09.6 listas de seguidores e seguindo
 * @RF09.14 aba Marcações · @RF09.16 aba Publicações
 */

type Estado =
  | { tipo: "carregando" }
  | { tipo: "sessao" }
  | { tipo: "erro" }
  | { tipo: "pronto"; perfil: PerfilDoCabecalho };

class SessaoVencida extends Error {}

async function lerJson<T>(endereco: string): Promise<T> {
  const resposta = await fetch(endereco);
  if (resposta.status === 401) throw new SessaoVencida();
  if (!resposta.ok) throw new Error();
  return (await resposta.json()) as T;
}

export default function PerfilPage() {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const { perfil: proprio } = await lerJson<{ perfil: { username: string | null } }>("/api/social/perfil");
        if (!ativo) return;
        if (!proprio.username) {
          // Sem username não há perfil na rede: escolhê-lo é o primeiro passo.
          router.replace("/dashboard/perfil/editar");
          return;
        }
        const { perfil } = await lerJson<{ perfil: PerfilDoCabecalho }>(
          `/api/social/perfis/${encodeURIComponent(proprio.username)}`,
        );
        if (ativo) setEstado({ tipo: "pronto", perfil });
      } catch (erro) {
        if (ativo) setEstado({ tipo: erro instanceof SessaoVencida ? "sessao" : "erro" });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [router]);

  if (estado.tipo === "carregando") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Carregando...
      </p>
    );
  }

  if (estado.tipo === "erro") {
    return (
      <p role="alert" className="text-sm text-destructive">
        Não foi possível carregar seu perfil. Recarregue a página para tentar de novo.
      </p>
    );
  }

  if (estado.tipo === "sessao") {
    return (
      <div role="alert" className="space-y-2 text-sm text-destructive">
        <p>Sua sessão expirou.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/auth/login">Entrar de novo</Link>
        </Button>
      </div>
    );
  }

  const { perfil } = estado;
  return (
    <div className="space-y-6">
      <PerfilCabecalho
        perfil={perfil}
        acoes={
          <>
            <Button asChild variant="outline" className="h-11 rounded-xl">
              <Link href="/dashboard/perfil/editar">
                <Pencil className="mr-2 h-4 w-4" aria-hidden />
                Editar perfil
              </Link>
            </Button>
            <BotaoCriarPost />
          </>
        }
      />
      <PerfilAbas username={perfil.username} proprio />
    </div>
  );
}
