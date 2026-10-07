"use client";

import type React from "react";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { User, Mail, Lock } from "lucide-react";
import { useAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { LIMITE_BIO, LIMITE_NOME, USERNAME_MAX, USERNAME_MIN } from "@/lib/schemas/perfil-limites";

/**
 * Edição do próprio perfil (domínio Social). Lê e grava por /api/social/perfil:
 * nada de cliente Supabase nesta tela.
 *
 * @RF02.2 nome e avatar · @RF02.5 username · @RF02.6 bio · @RF02.7 público/privado
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

const ROTULOS: Record<string, string> = {
  full_name: "Nome",
  avatar_url: "Avatar",
  username: "Nome de usuário",
  bio: "Bio",
  is_public: "Visibilidade",
};

type Alteracoes = Partial<{
  full_name: string;
  avatar_url: string;
  username: string;
  bio: string;
  is_public: boolean;
}>;

/** A rota devolve o detalhe do zod por campo; mostra o primeiro, com o nome do campo. */
function mensagemDeErro(corpo: RespostaDeErro): string {
  const [campo] = Object.entries(corpo.detalhes?.fieldErrors ?? {});
  if (campo) return `${ROTULOS[campo[0]] ?? campo[0]}: ${campo[1][0]}`;
  return corpo.detalhes?.formErrors?.[0] ?? corpo.error ?? "Erro ao atualizar perfil";
}

/**
 * Só o que mudou vai para o servidor. Assim um campo antigo fora do padrão — um
 * avatar http salvo pela rota anterior, por exemplo — não impede salvar a bio, e
 * duas abas abertas não desfazem uma o que a outra salvou nos campos não tocados.
 * O username é comparado já normalizado: `Bruno` e `bruno` são o mesmo nome.
 */
function alteracoes(atual: PerfilEditavel, formulario: FormData, publico: boolean): Alteracoes {
  const texto = (campo: string) => String(formulario.get(campo) ?? "").trim();
  const mudou: Alteracoes = {};

  const fullName = texto("full_name");
  if (fullName !== (atual.full_name ?? "")) mudou.full_name = fullName;
  const avatarUrl = texto("avatar_url");
  if (avatarUrl !== (atual.avatar_url ?? "")) mudou.avatar_url = avatarUrl;
  const bio = texto("bio");
  if (bio !== (atual.bio ?? "")) mudou.bio = bio;
  const username = texto("username").toLowerCase();
  if (username !== (atual.username ?? "")) mudou.username = username;
  if (publico !== atual.is_public) mudou.is_public = publico;

  return mudou;
}

export default function SettingsPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();

  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [perfil, setPerfil] = useState<PerfilEditavel | null>(null);
  const [erroAoCarregar, setErroAoCarregar] = useState(false);
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

  async function handleProfileUpdate(e: React.FormEvent<HTMLFormElement>) {
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

    setIsUpdatingProfile(true);
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
      toast({
        title: "Perfil atualizado",
        description: "Suas informações foram atualizadas com sucesso.",
      });
      // Nome e avatar também aparecem no cabeçalho, que lê do contexto.
      await refreshUser();
    } catch (erro) {
      toast({
        title: "Erro",
        description: erro instanceof Error ? erro.message : "Erro ao atualizar perfil",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingProfile(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsChangingPassword(true);

    try {
      // Guardado antes do primeiro await: depois dele o React já zerou o
      // `e.currentTarget`, e o reset do fim estourava mesmo com a senha trocada.
      const formulario = e.currentTarget;
      const formData = new FormData(formulario);
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao alterar senha");
      }

      toast({
        title: "Senha alterada",
        description: data.message || "Sua senha foi alterada com sucesso.",
      });

      formulario.reset();
    } catch (erro) {
      toast({
        title: "Erro",
        description: erro instanceof Error ? erro.message : "Erro ao alterar senha",
        variant: "destructive",
      });
    } finally {
      setIsChangingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-viaja-navy">Configurações</h1>
        <p className="mt-2 text-gray-600">
          Gerencie suas informações pessoais e preferências
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-viaja-orange" />
              Informações Pessoais
            </CardTitle>
            <CardDescription>Atualize seus dados pessoais</CardDescription>
          </CardHeader>
          <CardContent>
            {erroAoCarregar ? (
              <p role="alert" className="text-sm text-red-600">
                Não foi possível carregar seu perfil. Recarregue a página para tentar de novo.
              </p>
            ) : !perfil ? (
              <p role="status" className="text-sm text-gray-500">
                Carregando...
              </p>
            ) : (
              <form key={versaoDoFormulario} onSubmit={handleProfileUpdate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="full_name">Nome Completo</Label>
                  <Input
                    id="full_name"
                    name="full_name"
                    defaultValue={perfil.full_name ?? ""}
                    placeholder="Seu nome completo"
                    required
                    maxLength={LIMITE_NOME}
                    disabled={isUpdatingProfile}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="avatar_url">URL do Avatar</Label>
                  <Input
                    id="avatar_url"
                    name="avatar_url"
                    type="url"
                    defaultValue={perfil.avatar_url ?? ""}
                    placeholder="https://exemplo.com/avatar.jpg"
                    disabled={isUpdatingProfile}
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
                    disabled={isUpdatingProfile}
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
                    rows={3}
                    maxLength={LIMITE_BIO}
                    aria-describedby="bio-dica"
                    disabled={isUpdatingProfile}
                  />
                  <p id="bio-dica" className="text-xs text-gray-500">
                    Até {LIMITE_BIO} caracteres.
                  </p>
                </div>
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
                    disabled={isUpdatingProfile}
                  />
                </div>
                <Button
                  type="submit"
                  className="bg-viaja-orange hover:bg-viaja-orange/90"
                  disabled={isUpdatingProfile}
                >
                  {isUpdatingProfile ? "Salvando..." : "Salvar Alterações"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-viaja-orange" />
              Conta
            </CardTitle>
            <CardDescription>Informações da sua conta</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                value={user?.email || ""}
                disabled
                className="bg-gray-50"
              />
              <p className="text-xs text-gray-500">
                O email não pode ser alterado
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-viaja-orange" />
              Segurança
            </CardTitle>
            <CardDescription>Altere sua senha</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="current_password">Senha Atual</Label>
                <Input
                  id="current_password"
                  name="current_password"
                  type="password"
                  required
                  disabled={isChangingPassword}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new_password">Nova Senha</Label>
                <Input
                  id="new_password"
                  name="new_password"
                  type="password"
                  required
                  minLength={6}
                  disabled={isChangingPassword}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm_password">Confirmar Nova Senha</Label>
                <Input
                  id="confirm_password"
                  name="confirm_password"
                  type="password"
                  required
                  minLength={6}
                  disabled={isChangingPassword}
                />
              </div>
              <Button
                type="submit"
                className="bg-viaja-orange hover:bg-viaja-orange/90"
                disabled={isChangingPassword}
              >
                {isChangingPassword ? "Alterando..." : "Alterar Senha"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
