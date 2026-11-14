"use client";

import { use, useEffect, useRef, useState, type Ref } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, Clock, Loader2, Lock, Map as IconeMapa, Pencil, UserPlus, UserRound, UserRoundX } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

/**
 * O perfil de outra pessoa (domínio Social): /u/<username>, dentro da aba Rede
 * social, aberto pelos resultados da busca.
 *
 * Lê por GET /api/social/perfis/[username] e segue ou deixa de seguir por
 * POST/DELETE /api/social/perfis/[username]/seguir: nada de cliente Supabase
 * nesta tela. As três rotas devolvem o perfil já atualizado, então o botão e os
 * contadores mudam sem outra requisição.
 *
 * O botão segue o vínculo: Seguir (público) ou Solicitar (privado); Seguindo e
 * Solicitado abrem um menu com a confirmação de desfazer (decisão do Micael,
 * para ninguém deixar de seguir com um clique sem querer); no próprio perfil,
 * Editar perfil. As viagens publicadas chegam na S06.
 *
 * Seguir ou desfazer troca o botão por outro elemento; o foco vai para o botão
 * novo (ou volta ao mesmo, se o pedido falhou), e o resultado é anunciado numa
 * região de status, para quem usa teclado ou leitor de tela não ficar perdido. Com a sessão vencida (401), a tela
 * oferece entrar de novo, como o painel de busca.
 *
 * Quem ainda não tem username vê, no lugar do Seguir/Solicitar, o aviso para
 * escolher um, com o link para o Perfil: sem ele, ninguém entra na rede.
 *
 * Os contadores levam às listas de seguidores e de seguindo (S05-M-listas)
 * quando a rede do perfil é visível a quem vê.
 *
 * @RF02.8 perfil de outro usuário · @RF09.1 @RF09.2 @RF09.5 seguir · @RF09.6 listas
 */

type Vinculo = "proprio" | "nenhum" | "solicitado" | "seguindo";

type PerfilVisto = {
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_public: boolean;
  vinculo: Vinculo;
  seguidores: number | null;
  seguindo: number | null;
  sem_username: boolean;
};

type Estado =
  | { tipo: "carregando" }
  | { tipo: "nao-encontrado" }
  | { tipo: "sessao" }
  | { tipo: "erro" }
  | { tipo: "pronto"; perfil: PerfilVisto };

/** O que a região de status anuncia depois de seguir ou desfazer. */
function avisoDoVinculo(antes: Vinculo, depois: Vinculo, username: string) {
  if (depois === "seguindo") return `Você está seguindo @${username}.`;
  if (depois === "solicitado") return `Solicitação enviada a @${username}.`;
  if (antes === "solicitado") return `Solicitação a @${username} cancelada.`;
  return `Você deixou de seguir @${username}.`;
}

const numero = new Intl.NumberFormat("pt-BR");

function contador(valor: number | null, singular: string, plural: string) {
  if (valor === null) return `— ${plural}`;
  return `${numero.format(valor)} ${valor === 1 ? singular : plural}`;
}

export default function PerfilDeOutraPessoaPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  const { toast } = useToast();
  const [estado, setEstado] = useState<Estado>({ tipo: "carregando" });
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState("");
  const botao = useRef<HTMLButtonElement>(null);
  const focarBotao = useRef(false);

  // Terminado o pedido, o foco vai para o botão: o novo, se deu certo, ou o
  // mesmo, já habilitado de novo, se falhou. Durante o pedido ele fica
  // desabilitado, e o navegador larga o foco no body.
  useEffect(() => {
    if (enviando || !focarBotao.current) return;
    focarBotao.current = false;
    botao.current?.focus();
  }, [estado, enviando]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch(`/api/social/perfis/${encodeURIComponent(username)}`);
        // 400 é nome fora do formato: nenhum perfil pode tê-lo, então é o mesmo que não existir.
        if (resposta.status === 404 || resposta.status === 400) {
          if (ativo) setEstado({ tipo: "nao-encontrado" });
          return;
        }
        if (resposta.status === 401) {
          if (ativo) setEstado({ tipo: "sessao" });
          return;
        }
        if (!resposta.ok) throw new Error();
        const { perfil } = (await resposta.json()) as { perfil: PerfilVisto };
        if (ativo) setEstado({ tipo: "pronto", perfil });
      } catch {
        if (ativo) setEstado({ tipo: "erro" });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [username]);

  async function alterarVinculo(antes: PerfilVisto, metodo: "POST" | "DELETE") {
    setEnviando(true);
    setAviso("");
    try {
      const resposta = await fetch(`/api/social/perfis/${encodeURIComponent(username)}/seguir`, { method: metodo });
      if (resposta.status === 401) {
        setEstado({ tipo: "sessao" });
        return;
      }
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(dados.error ?? "Não foi possível atualizar agora. Tente de novo.");
      const perfil = dados.perfil as PerfilVisto;
      setEstado({ tipo: "pronto", perfil });
      setAviso(avisoDoVinculo(antes.vinculo, perfil.vinculo, perfil.username));
    } catch (erro) {
      const mensagem =
        erro instanceof TypeError
          ? "Não foi possível falar com o servidor. Verifique a conexão e tente de novo."
          : erro instanceof Error
            ? erro.message
            : "Não foi possível atualizar agora. Tente de novo.";
      toast({ title: "Erro", description: mensagem, variant: "destructive" });
    } finally {
      focarBotao.current = true;
      setEnviando(false);
    }
  }

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
        Não foi possível carregar este perfil. Recarregue a página para tentar de novo.
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

  if (estado.tipo === "nao-encontrado") {
    return (
      <Card role="region" aria-label="Perfil não encontrado">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <UserRoundX className="h-10 w-10 text-muted-foreground" aria-hidden />
          <h1 className="text-xl font-semibold text-foreground">Perfil não encontrado</h1>
          <p className="text-sm text-muted-foreground">Confira o endereço: nenhum perfil usa esse nome de usuário.</p>
          <Button asChild variant="outline">
            <Link href="/feed">Voltar à Rede social</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { perfil } = estado;
  const nome = perfil.full_name || perfil.username;
  const podeVerViagens = perfil.vinculo === "proprio" || perfil.vinculo === "seguindo" || perfil.is_public;
  // Os mesmos três casos da função `pode_ver_rede` do banco: o dono, quem segue
  // com vínculo aceito, ou perfil público. Fora deles os contadores não viram
  // link; quem decide de verdade é a rota das listas (403).
  const podeVerRede = podeVerViagens;

  return (
    <div className="space-y-6">
      <Card role="region" aria-label={`Perfil de @${perfil.username}`}>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar className="h-28 w-28 shrink-0">
            {perfil.avatar_url ? <AvatarImage src={perfil.avatar_url} alt={`Foto de ${nome}`} /> : null}
            <AvatarFallback role="img" aria-label="Sem foto de perfil" className="bg-primary text-primary-foreground">
              <UserRound className="h-12 w-12" aria-hidden />
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="break-words text-3xl font-semibold tracking-tight text-foreground">{nome}</h1>
              {perfil.is_public ? null : (
                <Badge variant="outline" className="gap-1">
                  <Lock aria-hidden />
                  Perfil privado
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">@{perfil.username}</p>
            {perfil.bio ? <p className="whitespace-pre-line break-words text-foreground">{perfil.bio}</p> : null}
            <p className="flex gap-4 text-sm text-foreground">
              {podeVerRede ? (
                <>
                  <Link href={`/u/${perfil.username}/seguidores`} className="rounded-sm hover:underline">
                    {contador(perfil.seguidores, "seguidor", "seguidores")}
                  </Link>
                  <Link href={`/u/${perfil.username}/seguindo`} className="rounded-sm hover:underline">
                    {perfil.seguindo === null ? "—" : numero.format(perfil.seguindo)} seguindo
                  </Link>
                </>
              ) : (
                <>
                  <span>{contador(perfil.seguidores, "seguidor", "seguidores")}</span>
                  <span>{perfil.seguindo === null ? "—" : numero.format(perfil.seguindo)} seguindo</span>
                </>
              )}
            </p>
          </div>
          <div className="shrink-0">
            <BotaoDoVinculo
              perfil={perfil}
              enviando={enviando}
              botao={botao}
              aoAlterar={(metodo) => alterarVinculo(perfil, metodo)}
            />
          </div>
          <p role="status" className="sr-only">
            {aviso}
          </p>
        </CardContent>
      </Card>

      <Card role="region" aria-label="Viagens publicadas">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          {podeVerViagens ? (
            <>
              <IconeMapa className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="text-sm text-muted-foreground">Nenhuma viagem publicada ainda.</p>
            </>
          ) : (
            <>
              <Lock className="h-10 w-10 text-muted-foreground" aria-hidden />
              <p className="font-semibold text-foreground">Esta conta é privada</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                {perfil.vinculo === "solicitado"
                  ? `Sua solicitação está pendente. Quando @${perfil.username} aprovar, você verá as viagens publicadas.`
                  : `Solicite para seguir. Quando @${perfil.username} aprovar, você verá as viagens publicadas.`}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BotaoDoVinculo({
  perfil,
  enviando,
  botao,
  aoAlterar,
}: {
  perfil: PerfilVisto;
  enviando: boolean;
  botao: Ref<HTMLButtonElement>;
  aoAlterar: (metodo: "POST" | "DELETE") => void;
}) {
  const carregando = enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null;

  if (perfil.vinculo === "proprio") {
    return (
      <Button asChild variant="outline">
        <Link href="/dashboard/perfil">
          <Pencil className="mr-2 h-4 w-4" aria-hidden />
          Editar perfil
        </Link>
      </Button>
    );
  }

  // Sem username, ninguém entra na rede de ninguém (S05-M-listas, I1; decisão do
  // Micael, como no Instagram): no lugar do Seguir, o caminho para escolher um.
  // Deixar de seguir e cancelar, abaixo, continuam.
  if (perfil.vinculo === "nenhum" && perfil.sem_username) {
    return (
      <div className="max-w-xs space-y-2 text-sm text-muted-foreground">
        <p>Escolha um nome de usuário para seguir pessoas.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/dashboard/perfil">Escolher nome de usuário</Link>
        </Button>
      </div>
    );
  }

  if (perfil.vinculo === "nenhum") {
    return (
      <Button
        ref={botao}
        onClick={() => aoAlterar("POST")}
        disabled={enviando}
        className="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {carregando ?? <UserPlus className="mr-2 h-4 w-4" aria-hidden />}
        {perfil.is_public ? "Seguir" : "Solicitar"}
      </Button>
    );
  }

  const seguindo = perfil.vinculo === "seguindo";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button ref={botao} variant="outline" disabled={enviando}>
          {carregando ?? (seguindo ? <Check className="mr-2 h-4 w-4" aria-hidden /> : <Clock className="mr-2 h-4 w-4" aria-hidden />)}
          {seguindo ? "Seguindo" : "Solicitado"}
          <ChevronDown className="ml-2 h-4 w-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => aoAlterar("DELETE")} className="text-destructive focus:text-destructive">
          {seguindo ? "Deixar de seguir" : "Cancelar solicitação"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
