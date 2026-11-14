"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import ConfirmModal from "@/components/ui/confirm-modal";
import { Loader2, Lock, Search, UserRound, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { BUSCA_MAX, BUSCA_MIN, normalizarTermo, TERMO_PERMITIDO } from "@/lib/social/busca";

/**
 * A tela de pesquisa da aba Rede social (/pesquisar, S05-M-pesquisa): o campo
 * no topo e, abaixo dele, os recentes (campo vazio) ou as pessoas encontradas
 * (com termo), como no Instagram.
 *
 * - Busca por GET /api/social/perfis?busca=; o histórico por
 *   /api/social/pesquisas. Nada de cliente Supabase nesta tela.
 * - O termo vai para o endereço (?q=) ao abrir um perfil, por
 *   `history.replaceState`: voltar devolve a pesquisa como estava. Não a cada
 *   tecla: o Next atualiza o `useSearchParams` numa transição, depois da tecla,
 *   e o campo que o acompanhasse voltaria um instante ao valor anterior (cursor
 *   no fim, composição do teclado embaralhada). O campo só acompanha o ?q=
 *   quando ele muda por fora: Pesquisar no menu, voltar e avançar do navegador.
 * - Abrir uma pessoa (dos resultados ou dos recentes) a registra no histórico,
 *   sem esperar: o perfil abre na hora, e uma falha só deixa de registrar.
 * - O X tira uma entrada na hora; "Limpar tudo" pede confirmação.
 *
 * @RF09.10 buscar pessoas · @RF09.12 histórico de pesquisa
 */

type Pessoa = {
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_public: boolean;
};

type Resultado =
  | { tipo: "pessoas"; pessoas: Pessoa[] }
  | { tipo: "invalido" }
  | { tipo: "sessao" }
  | { tipo: "erro" };

type EstadoRecentes =
  | { tipo: "carregando" }
  | { tipo: "pronto"; pessoas: Pessoa[] }
  | { tipo: "sessao" }
  | { tipo: "erro" };

/** Espera a pessoa parar de digitar antes de buscar. */
const ESPERA_MS = 300;

/** Registra no histórico quem foi aberto, sem segurar a navegação. */
function registrarNoHistorico(username: string) {
  void fetch("/api/social/pesquisas", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username }),
    // O pedido continua mesmo com a página trocando para o perfil.
    keepalive: true,
  }).catch(() => {});
}

export function Pesquisa() {
  const id = useId();
  const parametros = useSearchParams();
  const q = parametros.get("q") ?? "";
  const [termo, setTermo] = useState(q);
  // O ?q= que o campo já acompanha. Digitar não muda o endereço, então ele só
  // muda por fora (Pesquisar no menu, voltar e avançar): aí o campo vai junto,
  // ainda nesta renderização.
  const [qAcompanhado, setQAcompanhado] = useState(q);
  if (q !== qAcompanhado) {
    setQAcompanhado(q);
    setTermo(q);
  }
  const busca = useBusca(termo);

  /** Antes de abrir um perfil: o termo no endereço, para o voltar devolvê-lo. */
  function guardarTermo() {
    window.history.replaceState(null, "", termo ? `/pesquisar?q=${encodeURIComponent(termo)}` : "/pesquisar");
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-foreground">Pesquisar</h1>
      <Card>
        <CardContent className="space-y-4">
          <div className="relative">
            <label htmlFor={id} className="sr-only">
              Buscar pessoas
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id={id}
              type="search"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Nome ou @usuário"
              maxLength={BUSCA_MAX}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              className="pl-9"
            />
          </div>

          {busca.normalizado === "" ? <Recentes aoAbrir={guardarTermo} /> : <Resultados busca={busca} aoAbrir={guardarTermo} />}
        </CardContent>
      </Card>
    </div>
  );
}

/** A busca em si: espera a pessoa parar de digitar e descarta resposta atrasada. */
function useBusca(termo: string) {
  // A resposta guarda o termo a que responde: uma resposta atrasada de um termo
  // antigo nunca aparece no lugar da do termo atual.
  const [resposta, setResposta] = useState<{ termo: string; resultado: Resultado } | null>(null);
  const [tentativa, setTentativa] = useState(0);

  // As mesmas regras da rota (lib/social/busca.ts), para não buscar o que ela recusaria.
  const normalizado = normalizarTermo(termo);
  const curto = normalizado.length < BUSCA_MIN;
  const longo = normalizado.length > BUSCA_MAX;
  const permitido = TERMO_PERMITIDO.test(normalizado);
  const deveBuscar = !curto && !longo && permitido;

  useEffect(() => {
    if (!deveBuscar) return;
    const controle = new AbortController();
    const espera = setTimeout(async () => {
      try {
        const r = await fetch(`/api/social/perfis?busca=${encodeURIComponent(normalizado)}`, {
          signal: controle.signal,
        });
        let resultado: Resultado = { tipo: "erro" };
        if (r.status === 400) resultado = { tipo: "invalido" };
        else if (r.status === 401) resultado = { tipo: "sessao" };
        else if (r.ok) resultado = { tipo: "pessoas", pessoas: ((await r.json()) as { pessoas: Pessoa[] }).pessoas };
        setResposta({ termo: normalizado, resultado });
      } catch {
        // Cancelada porque a pessoa continuou digitando: não é erro.
        if (!controle.signal.aborted) setResposta({ termo: normalizado, resultado: { tipo: "erro" } });
      }
    }, ESPERA_MS);
    return () => {
      clearTimeout(espera);
      controle.abort();
    };
  }, [normalizado, deveBuscar, tentativa]);

  const atual = deveBuscar && resposta?.termo === normalizado ? resposta.resultado : null;

  function tentarDeNovo() {
    setResposta(null);
    setTentativa((t) => t + 1);
  }

  return { normalizado, curto, longo, permitido, atual, tentarDeNovo };
}

function Resultados({ busca, aoAbrir }: { busca: ReturnType<typeof useBusca>; aoAbrir: () => void }) {
  const { normalizado, curto, longo, permitido, atual, tentarDeNovo } = busca;

  // Leitor de tela: só o resumo do que foi achado, numa região só.
  let anuncio = "";
  if (atual?.tipo === "pessoas") {
    const n = atual.pessoas.length;
    anuncio = n === 0 ? "Ninguém encontrado" : n === 1 ? "1 pessoa encontrada" : `${n} pessoas encontradas`;
  }

  return (
    <div className="space-y-3">
      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>

      {curto ? (
        <p className="text-sm text-muted-foreground">Digite pelo menos {BUSCA_MIN} caracteres do nome ou do @usuário.</p>
      ) : longo ? (
        <p className="text-sm text-muted-foreground">Use até {BUSCA_MAX} caracteres.</p>
      ) : !permitido ? (
        <p className="text-sm text-muted-foreground">Use letras, números, espaço e . _ - &apos;</p>
      ) : !atual ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Buscando...
        </p>
      ) : atual.tipo === "invalido" ? (
        <p className="text-sm text-muted-foreground">Não dá para buscar por esse termo.</p>
      ) : atual.tipo === "sessao" ? (
        <SessaoVencida />
      ) : atual.tipo === "erro" ? (
        <div role="alert" className="space-y-2 text-sm text-destructive">
          <p>Não foi possível buscar agora.</p>
          <Button variant="outline" size="sm" onClick={tentarDeNovo}>
            Tentar de novo
          </Button>
        </div>
      ) : atual.pessoas.length === 0 ? (
        <p className="break-words text-sm text-muted-foreground">Ninguém encontrado para “{normalizado}”.</p>
      ) : (
        <ul aria-label="Pessoas encontradas" className="space-y-1">
          {atual.pessoas.map((pessoa) => (
            <li key={pessoa.username}>
              <ItemPessoa pessoa={pessoa} aoAbrir={aoAbrir} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Recentes({ aoAbrir }: { aoAbrir: () => void }) {
  const { toast } = useToast();
  const idTitulo = useId();
  const [estado, setEstado] = useState<EstadoRecentes>({ tipo: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [confirmarLimpeza, setConfirmarLimpeza] = useState(false);
  const [aviso, setAviso] = useState("");
  const titulo = useRef<HTMLHeadingElement>(null);
  const focarTitulo = useRef(false);

  // O X e o "Limpar tudo" tiram da tela o botão que tinha o foco: ele vai para o
  // título da lista, e a região de status anuncia o que saiu.
  useEffect(() => {
    if (!focarTitulo.current) return;
    focarTitulo.current = false;
    titulo.current?.focus();
  }, [estado]);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const r = await fetch("/api/social/pesquisas");
        if (r.status === 401) {
          if (ativo) setEstado({ tipo: "sessao" });
          return;
        }
        if (!r.ok) throw new Error();
        const { recentes } = (await r.json()) as { recentes: Pessoa[] };
        if (ativo) setEstado({ tipo: "pronto", pessoas: recentes });
      } catch {
        if (ativo) setEstado({ tipo: "erro" });
      }
    })();
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  /** DELETE no histórico; devolve se deu certo. A sessão vencida troca a lista pelo aviso. */
  async function apagar(url: string, falha: string) {
    try {
      const r = await fetch(url, { method: "DELETE" });
      if (r.status === 401) {
        setEstado({ tipo: "sessao" });
        return false;
      }
      if (!r.ok) throw new Error();
      return true;
    } catch {
      toast({ title: "Erro", description: falha, variant: "destructive" });
      return false;
    }
  }

  async function tirar(username: string) {
    if (!(await apagar(`/api/social/pesquisas/${encodeURIComponent(username)}`, "Não foi possível remover agora. Tente de novo.")))
      return;
    focarTitulo.current = true;
    setEstado((atual) =>
      atual.tipo === "pronto" ? { tipo: "pronto", pessoas: atual.pessoas.filter((p) => p.username !== username) } : atual,
    );
    setAviso(`@${username} saiu dos recentes.`);
  }

  async function limparTudo() {
    if (!(await apagar("/api/social/pesquisas", "Não foi possível limpar agora. Tente de novo."))) return;
    focarTitulo.current = true;
    setEstado({ tipo: "pronto", pessoas: [] });
    setAviso("As pesquisas recentes foram apagadas.");
  }

  if (estado.tipo === "carregando") {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Carregando pesquisas recentes...
      </p>
    );
  }
  if (estado.tipo === "sessao") return <SessaoVencida />;
  if (estado.tipo === "erro") {
    return (
      <div role="alert" className="space-y-2 text-sm text-destructive">
        <p>Não foi possível carregar as pesquisas recentes.</p>
        <Button variant="outline" size="sm" onClick={() => setTentativa((t) => t + 1)}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  return (
    <section aria-labelledby={idTitulo} className="space-y-2">
      <p role="status" className="sr-only">
        {aviso}
      </p>
      <div className="flex items-center justify-between">
        <h2 id={idTitulo} ref={titulo} tabIndex={-1} className="rounded-sm font-semibold text-foreground">
          Recentes
        </h2>
        {estado.pessoas.length > 0 ? (
          <Button variant="link" size="sm" className="px-0 text-primary" onClick={() => setConfirmarLimpeza(true)}>
            Limpar tudo
          </Button>
        ) : null}
      </div>

      {estado.pessoas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma pesquisa recente.</p>
      ) : (
        <ul aria-label="Pesquisas recentes" className="space-y-1">
          {estado.pessoas.map((pessoa) => (
            <li key={pessoa.username} className="flex items-center gap-1">
              <div className="min-w-0 flex-1">
                <ItemPessoa pessoa={pessoa} aoAbrir={aoAbrir} />
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Remover @${pessoa.username} dos recentes`}
                onClick={() => tirar(pessoa.username)}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmModal
        open={confirmarLimpeza}
        onOpenChange={setConfirmarLimpeza}
        title="Limpar as pesquisas recentes?"
        description="Todo o seu histórico de pesquisa será apagado, em todos os aparelhos. Não dá para desfazer."
        confirmText="Limpar tudo"
        variant="destructive"
        onConfirm={limparTudo}
      />
    </section>
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

function ItemPessoa({ pessoa, aoAbrir }: { pessoa: Pessoa; aoAbrir: () => void }) {
  const nome = pessoa.full_name || pessoa.username;
  return (
    <Link
      href={`/u/${pessoa.username}`}
      onClick={() => {
        aoAbrir();
        registrarNoHistorico(pessoa.username);
      }}
      // O clique do meio abre em outra aba sem passar pelo onClick.
      onAuxClick={(e) => {
        if (e.button === 1) registrarNoHistorico(pessoa.username);
      }}
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
