"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Loader2, Lock, PanelLeftClose, PanelLeftOpen, Search, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUSCA_MAX, BUSCA_MIN, normalizarTermo, TERMO_PERMITIDO } from "@/lib/social/busca";

/**
 * Painel "Pessoas" da aba Rede social: busca outras pessoas pelo nome ou pelo
 * @usuário, por GET /api/social/perfis, sem cliente Supabase na tela.
 *
 * No desktop é uma coluna à esquerda do feed, que recolhe e expande; no celular,
 * um botão que abre a mesma busca numa gaveta. Os resultados ainda não abrem
 * nada: viram links para o perfil da pessoa na S05-M-seguir, junto com a página.
 *
 * @RF09.10 buscar pessoas
 */

type PessoaEncontrada = {
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  is_public: boolean;
};

type Resultado =
  | { tipo: "pessoas"; pessoas: PessoaEncontrada[] }
  | { tipo: "invalido" }
  | { tipo: "sessao" }
  | { tipo: "erro" };

/** Espera a pessoa parar de digitar antes de buscar. */
const ESPERA_MS = 300;

export function PainelPessoas() {
  const [recolhido, setRecolhido] = useState(false);
  const idConteudo = useId();

  return (
    <>
      {/* Celular: um botão que abre a busca numa gaveta. */}
      <div className="md:hidden">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full justify-start gap-2">
              <Search className="h-4 w-4" aria-hidden />
              Buscar pessoas
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[85vw] max-w-sm">
            <SheetHeader>
              <SheetTitle>Pessoas</SheetTitle>
              <SheetDescription>Encontre outras pessoas pelo nome ou pelo @usuário.</SheetDescription>
            </SheetHeader>
            <div className="px-4 pb-4">
              <BuscaDePessoas />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: coluna à esquerda do feed. Um botão só recolhe e expande, e ele
          continua montado, então o foco do teclado fica nele. Recolhido, a busca só
          se esconde: o termo e os resultados continuam lá ao expandir. */}
      <aside
        aria-label="Pessoas"
        className={cn("hidden shrink-0 md:sticky md:top-8 md:block", !recolhido && "w-72")}
      >
        <Card className={recolhido ? "gap-0 p-1" : "gap-4 p-4"}>
          <div className="flex items-center justify-between">
            {recolhido ? null : <h2 className="font-semibold text-viaja-navy">Pessoas</h2>}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setRecolhido((r) => !r)}
              aria-expanded={!recolhido}
              aria-controls={idConteudo}
              aria-label={recolhido ? "Expandir a busca de pessoas" : "Recolher a busca de pessoas"}
            >
              {recolhido ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
            </Button>
          </div>
          <div id={idConteudo} hidden={recolhido}>
            <BuscaDePessoas />
          </div>
        </Card>
      </aside>
    </>
  );
}

function BuscaDePessoas() {
  const id = useId();
  const [termo, setTermo] = useState("");
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
        else if (r.ok) resultado = { tipo: "pessoas", pessoas: ((await r.json()) as { pessoas: PessoaEncontrada[] }).pessoas };
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

  // Leitor de tela: só o resumo do que foi achado, numa região só.
  let anuncio = "";
  if (atual?.tipo === "pessoas") {
    const n = atual.pessoas.length;
    anuncio = n === 0 ? "Ninguém encontrado" : n === 1 ? "1 pessoa encontrada" : `${n} pessoas encontradas`;
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <label htmlFor={id} className="sr-only">
          Buscar pessoas
        </label>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
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
          className="pl-9"
        />
      </div>

      <p className="sr-only" aria-live="polite">
        {anuncio}
      </p>

      {curto ? (
        <p className="text-sm text-gray-500">Digite pelo menos {BUSCA_MIN} caracteres do nome ou do @usuário.</p>
      ) : longo ? (
        <p className="text-sm text-gray-500">Use até {BUSCA_MAX} caracteres.</p>
      ) : !permitido ? (
        <p className="text-sm text-gray-500">Use letras, números, espaço e . _ - &apos;</p>
      ) : !atual ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Buscando...
        </p>
      ) : atual.tipo === "invalido" ? (
        <p className="text-sm text-gray-500">Não dá para buscar por esse termo.</p>
      ) : atual.tipo === "sessao" ? (
        <div role="alert" className="space-y-2 text-sm text-red-600">
          <p>Sua sessão expirou.</p>
          <Button asChild variant="outline" size="sm">
            <Link href="/auth/login">Entrar de novo</Link>
          </Button>
        </div>
      ) : atual.tipo === "erro" ? (
        <div role="alert" className="space-y-2 text-sm text-red-600">
          <p>Não foi possível buscar agora.</p>
          <Button variant="outline" size="sm" onClick={tentarDeNovo}>
            Tentar de novo
          </Button>
        </div>
      ) : atual.pessoas.length === 0 ? (
        <p className="text-sm text-gray-500 break-words">Ninguém encontrado para “{normalizado}”.</p>
      ) : (
        <ul aria-label="Pessoas encontradas" className="space-y-1">
          {atual.pessoas.map((pessoa) => (
            <ItemPessoa key={pessoa.username} pessoa={pessoa} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemPessoa({ pessoa }: { pessoa: PessoaEncontrada }) {
  const nome = pessoa.full_name || pessoa.username;
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-2">
      <Avatar className="h-10 w-10">
        {pessoa.avatar_url ? <AvatarImage src={pessoa.avatar_url} alt={`Foto de ${nome}`} /> : null}
        <AvatarFallback role="img" aria-label="Sem foto de perfil" className="bg-viaja-green text-white">
          <UserRound className="h-5 w-5" aria-hidden />
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-sm font-medium text-viaja-navy">
          <span className="truncate">{nome}</span>
          {pessoa.is_public ? null : (
            <span role="img" aria-label="Perfil privado" title="Perfil privado" className="shrink-0">
              <Lock className="h-3.5 w-3.5 text-gray-500" aria-hidden />
            </span>
          )}
        </p>
        <p className="truncate text-xs text-gray-500">@{pessoa.username}</p>
      </div>
    </li>
  );
}
