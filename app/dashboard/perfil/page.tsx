"use client";

import type React from "react";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe, ImagePlus, Loader2, Lock, Pencil, Trash2, UserRound } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { LIMITE_BIO, LIMITE_NOME, USERNAME_MAX, USERNAME_MIN } from "@/lib/schemas/perfil-limites";
import type { Recorte } from "@/lib/social/enquadramento";
import { EnquadrarFoto } from "./enquadrar-foto";
import { lerImagem, recortarFoto, TIPOS_ACEITOS } from "./recortar-foto";

/**
 * Página do próprio perfil (domínio Social), aberta pelo menu do usuário.
 *
 * No topo, o cartão mostra como as outras pessoas veem o perfil, com o lápis de
 * trocar a foto na bolinha do avatar; embaixo, o formulário que o edita. Lê e
 * grava por /api/social/perfil e /api/social/perfil/foto: nada de cliente
 * Supabase nesta tela. Conta e senha continuam em Configurações.
 *
 * @RF02.1 visualizar o próprio perfil · @RF02.2 nome e foto · @RF02.5 username
 * @RF02.6 bio · @RF02.7 público/privado
 */

type PerfilEditavel = {
  full_name: string | null;
  avatar_url: string | null;
  username: string | null;
  bio: string | null;
  is_public: boolean;
};

type RespostaDeErro = {
  error?: string;
  detalhes?: { formErrors?: string[]; fieldErrors?: Record<string, string[]> };
};

type Alteracoes = Partial<{
  full_name: string;
  username: string;
  bio: string;
  is_public: boolean;
}>;

const ROTULOS: Record<string, string> = {
  full_name: "Nome",
  username: "Nome de usuário",
  bio: "Bio",
  is_public: "Visibilidade",
};

/** A rota devolve o detalhe do zod por campo; mostra o primeiro, com o nome do campo. */
function mensagemDeErro(corpo: RespostaDeErro): string {
  const [campo] = Object.entries(corpo.detalhes?.fieldErrors ?? {});
  if (campo) return `${ROTULOS[campo[0]] ?? campo[0]}: ${campo[1][0]}`;
  return corpo.detalhes?.formErrors?.[0] ?? corpo.error ?? "Erro ao atualizar perfil";
}

/**
 * Só o que mudou vai para o servidor. Assim um campo antigo fora do padrão — um
 * nome acima do limite atual, por exemplo — não impede salvar a bio, e duas abas
 * abertas não desfazem uma o que a outra salvou nos campos não tocados. A foto
 * não passa por aqui: tem rota própria.
 * O username é comparado já normalizado: `Bruno` e `bruno` são o mesmo nome.
 */
function alteracoes(atual: PerfilEditavel, formulario: FormData, publico: boolean): Alteracoes {
  const texto = (campo: string) => String(formulario.get(campo) ?? "").trim();
  const mudou: Alteracoes = {};

  const fullName = texto("full_name");
  if (fullName !== (atual.full_name ?? "")) mudou.full_name = fullName;
  const bio = texto("bio");
  if (bio !== (atual.bio ?? "")) mudou.bio = bio;
  const username = texto("username").toLowerCase();
  if (username !== (atual.username ?? "")) mudou.username = username;
  if (publico !== atual.is_public) mudou.is_public = publico;

  return mudou;
}

function iniciais(nome: string | null): string {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

export default function PerfilPage() {
  const { refreshUser } = useAuth();
  const { toast } = useToast();

  const [perfil, setPerfil] = useState<PerfilEditavel | null>(null);
  const [erroAoCarregar, setErroAoCarregar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const seletorDeFoto = useRef<HTMLInputElement>(null);
  // Foto escolhida, à espera do enquadramento no modal.
  const [fotoEscolhida, setFotoEscolhida] = useState<{ imagem: ImageBitmap; url: string } | null>(null);
  const [publico, setPublico] = useState(true);
  // Remonta o formulário depois de salvar, para os campos mostrarem o que ficou
  // gravado (username em minúsculas, espaços aparados), e não o que foi digitado.
  const [versaoDoFormulario, setVersaoDoFormulario] = useState(0);

  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const resposta = await fetch("/api/social/perfil");
        if (!resposta.ok) throw new Error();
        const { perfil: carregado } = (await resposta.json()) as { perfil: PerfilEditavel };
        if (!ativo) return;
        setPerfil(carregado);
        setPublico(carregado.is_public);
      } catch {
        if (ativo) setErroAoCarregar(true);
      }
    })();
    return () => {
      ativo = false;
    };
  }, []);

  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!perfil) return;

    const corpo = alteracoes(perfil, new FormData(e.currentTarget), publico);

    // Username dá para trocar, não para apagar: o link /u/<nome> de quem já o
    // compartilhou deixaria de existir sem aviso.
    if (corpo.username === "" && perfil.username) {
      toast({
        title: "Erro",
        description: "Nome de usuário: não dá para deixar em branco. Escolha outro, se quiser trocar.",
        variant: "destructive",
      });
      return;
    }
    if (Object.keys(corpo).length === 0) {
      toast({ title: "Nada para salvar", description: "Nenhum campo foi alterado." });
      return;
    }

    setSalvando(true);
    try {
      const resposta = await fetch("/api/social/perfil", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(corpo),
      });
      // Um 502 do proxy chega como HTML: sem JSON, cai na mensagem genérica.
      const dados = await resposta.json().catch(() => ({}));
      if (!resposta.ok) throw new Error(mensagemDeErro(dados));

      setPerfil(dados.perfil);
      setPublico(dados.perfil.is_public);
      setVersaoDoFormulario((v) => v + 1);
      toast({ title: "Perfil atualizado", description: "Suas informações foram atualizadas com sucesso." });
      // Nome e avatar também aparecem no menu lateral, que lê do contexto.
      await refreshUser();
    } catch (erro) {
      toast({
        title: "Erro",
        description: erro instanceof Error ? erro.message : "Erro ao atualizar perfil",
        variant: "destructive",
      });
    } finally {
      setSalvando(false);
    }
  }

  /** Depois de trocar ou remover a foto: cartão e menu lateral mostram a nova. */
  /** "Failed to fetch" não diz nada a quem usa: falha de rede ganha mensagem própria. */
  function mensagemDaFoto(erro: unknown, padrao: string) {
    if (erro instanceof TypeError) return "Não foi possível falar com o servidor. Verifique a conexão e tente de novo.";
    return erro instanceof Error ? erro.message : padrao;
  }

  async function aplicarFoto(resposta: Response, sucesso: string) {
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.error ?? "Não foi possível atualizar a foto");
    setPerfil(dados.perfil);
    toast({ title: sucesso });
    await refreshUser();
  }

  /** Escolher o arquivo só abre o modal de enquadramento; nada é enviado ainda. */
  async function escolherFoto(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    // Limpa o seletor: escolher o mesmo arquivo de novo precisa abrir o modal.
    e.target.value = "";
    if (!arquivo) return;

    // Sem pré-checagem pelo tipo declarado: alguns celulares mandam o tipo vazio,
    // e o navegador sabe ler formatos (HEIC no Safari) que o recorte converte. Quem
    // decide é a leitura da imagem; quem garante, a rota.
    try {
      const imagem = await lerImagem(arquivo);
      setFotoEscolhida({ imagem, url: URL.createObjectURL(arquivo) });
    } catch {
      toast({
        title: "Erro",
        description: "Não foi possível ler essa imagem. Escolha uma imagem JPEG, PNG ou WebP.",
        variant: "destructive",
      });
    }
  }

  /** Fecha o modal e libera a memória da imagem e do endereço local dela. */
  function descartarFoto() {
    if (!fotoEscolhida) return;
    fotoEscolhida.imagem.close();
    URL.revokeObjectURL(fotoEscolhida.url);
    setFotoEscolhida(null);
  }

  /** "Aplicar" no modal: recorta o que está no círculo, em 512×512, e envia. */
  async function enviarFoto(recorte: Recorte) {
    if (!fotoEscolhida) return;
    setEnviandoFoto(true);
    try {
      const recortada = await recortarFoto(fotoEscolhida.imagem, recorte);
      const formulario = new FormData();
      formulario.append("foto", recortada, "foto");
      await aplicarFoto(await fetch("/api/social/perfil/foto", { method: "POST", body: formulario }), "Foto atualizada");
      descartarFoto();
    } catch (erro) {
      // O modal continua aberto, com o enquadramento, para tentar de novo.
      toast({ title: "Erro", description: mensagemDaFoto(erro, "Não foi possível atualizar a foto"), variant: "destructive" });
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function removerFoto() {
    setEnviandoFoto(true);
    try {
      await aplicarFoto(await fetch("/api/social/perfil/foto", { method: "DELETE" }), "Foto removida");
    } catch (erro) {
      toast({ title: "Erro", description: mensagemDaFoto(erro, "Não foi possível remover a foto"), variant: "destructive" });
    } finally {
      setEnviandoFoto(false);
    }
  }

  return (
    <div className="space-y-6">
      <EnquadrarFoto foto={fotoEscolhida} enviando={enviandoFoto} onCancelar={descartarFoto} onAplicar={enviarFoto} />
      <div>
        <h1 className="text-3xl font-bold text-viaja-navy">Perfil</h1>
        <p className="mt-2 text-gray-600">Como as outras pessoas veem você no ViajaMais</p>
      </div>

      {erroAoCarregar ? (
        <p role="alert" className="text-sm text-red-600">
          Não foi possível carregar seu perfil. Recarregue a página para tentar de novo.
        </p>
      ) : !perfil ? (
        <p role="status" className="text-sm text-gray-500">
          Carregando...
        </p>
      ) : (
        <>
          <Card role="region" aria-label="Como os outros veem seu perfil">
            <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <div className="relative h-20 w-20 shrink-0">
                {/* A key recria o avatar quando a foto muda: o Avatar do Radix guarda
                    "imagem carregada" e, sem isso, ao remover a foto as iniciais não
                    voltavam — o círculo ficava vazio. */}
                <Avatar key={perfil.avatar_url ?? "sem-foto"} className="h-20 w-20" aria-busy={enviandoFoto}>
                  {perfil.avatar_url ? <AvatarImage src={perfil.avatar_url} alt="Foto de perfil" /> : null}
                  <AvatarFallback className="bg-viaja-green text-xl text-white">
                    {iniciais(perfil.full_name)}
                  </AvatarFallback>
                </Avatar>
                {enviandoFoto ? (
                  <div
                    role="status"
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40"
                  >
                    <Loader2 className="h-6 w-6 animate-spin text-white" aria-hidden />
                    <span className="sr-only">Enviando foto…</span>
                  </div>
                ) : null}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      aria-label="Alterar foto de perfil"
                      disabled={enviandoFoto || salvando}
                      className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full border-2 border-white bg-white shadow-md hover:bg-gray-50"
                    >
                      <Pencil className="h-4 w-4 text-viaja-navy" aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onSelect={() => seletorDeFoto.current?.click()}>
                      <ImagePlus className="mr-2 h-4 w-4" aria-hidden />
                      Enviar nova foto
                    </DropdownMenuItem>
                    {perfil.avatar_url ? (
                      <DropdownMenuItem onSelect={removerFoto} className="text-red-600 focus:text-red-600">
                        <Trash2 className="mr-2 h-4 w-4" aria-hidden />
                        Remover foto
                      </DropdownMenuItem>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
                <input
                  ref={seletorDeFoto}
                  type="file"
                  accept={TIPOS_ACEITOS.join(",")}
                  onChange={escolherFoto}
                  className="hidden"
                  aria-hidden
                  tabIndex={-1}
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xl font-semibold text-viaja-navy break-words">
                    {perfil.full_name || "Sem nome"}
                  </p>
                  <Badge variant="outline" className="gap-1">
                    {perfil.is_public ? <Globe aria-hidden /> : <Lock aria-hidden />}
                    {perfil.is_public ? "Público" : "Privado"}
                  </Badge>
                </div>
                <p className="text-sm text-gray-500">
                  {perfil.username ? `@${perfil.username}` : "Escolha um nome de usuário para ter sua página pública"}
                </p>
                {perfil.bio ? <p className="whitespace-pre-line break-words text-gray-700">{perfil.bio}</p> : null}
              </div>
            </CardContent>
          </Card>

          <form key={versaoDoFormulario} onSubmit={salvar} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UserRound className="h-5 w-5 text-viaja-orange" />
                    Dados do perfil
                  </CardTitle>
                  <CardDescription>Nome e o que aparece na sua página. A foto muda pelo lápis do avatar.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="full_name">Nome completo</Label>
                    <Input
                      id="full_name"
                      name="full_name"
                      defaultValue={perfil.full_name ?? ""}
                      placeholder="Seu nome completo"
                      required
                      maxLength={LIMITE_NOME}
                      disabled={salvando}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="username">Nome de usuário</Label>
                    <Input
                      id="username"
                      name="username"
                      defaultValue={perfil.username ?? ""}
                      placeholder="ex.: ana_viaja"
                      autoCapitalize="none"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={USERNAME_MAX}
                      aria-describedby="username-dica"
                      disabled={salvando}
                    />
                    <p id="username-dica" className="text-xs text-gray-500">
                      De {USERNAME_MIN} a {USERNAME_MAX} caracteres: letras, números e _. Fica salvo em minúsculas.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      name="bio"
                      defaultValue={perfil.bio ?? ""}
                      placeholder="Conte um pouco sobre como você gosta de viajar"
                      rows={4}
                      maxLength={LIMITE_BIO}
                      aria-describedby="bio-dica"
                      disabled={salvando}
                    />
                    <p id="bio-dica" className="text-xs text-gray-500">
                      Até {LIMITE_BIO} caracteres.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="h-fit">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Lock className="h-5 w-5 text-viaja-orange" />
                    Privacidade
                  </CardTitle>
                  <CardDescription>Quem pode seguir você</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                    <div className="space-y-1">
                      <Label htmlFor="is_public">Perfil público</Label>
                      <p id="is_public-descricao" className="text-xs text-gray-500">
                        {publico
                          ? "Quem quiser pode seguir você na hora."
                          : "Seguir você exige sua aprovação. Nome, foto, nome de usuário e bio continuam visíveis."}
                      </p>
                    </div>
                    <Switch
                      id="is_public"
                      checked={publico}
                      onCheckedChange={setPublico}
                      aria-describedby="is_public-descricao"
                      disabled={salvando}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end">
              {/* Travado durante o envio da foto: a resposta do PATCH chegaria com o
                  avatar_url de antes e desfaria a foto nova na tela. */}
              <Button type="submit" className="bg-viaja-orange hover:bg-viaja-orange/90" disabled={salvando || enviandoFoto}>
                {salvando ? "Salvando..." : "Salvar perfil"}
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
