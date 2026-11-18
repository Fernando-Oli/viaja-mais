"use client";

import type React from "react";

import { authCliente } from "@/lib/auth-cliente";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { problemaDeSenha } from "@/lib/seguranca/senha";

/**
 * Cadastro de nova conta.
 *
 * @RF01.1 o usuário se registra com e-mail e senha
 * @RF01.2 a confirmação por e-mail, quando habilitada, decide o destino
 */
export default function SignUpPage() {
  // useSearchParams pede um Suspense em volta (o Next pré-renderiza a página).
  return (
    <Suspense>
      <Cadastro />
    </Suspense>
  );
}

/**
 * O Better Auth responde em inglês. A política de senha já vem em português,
 * com a mesma frase da tela (o gancho de `api/auth/auth.ts`).
 */
function mensagemDoCadastro(erro: { status: number; code?: string; message?: string }): string {
  if (erro.status === 429) return "Muitas tentativas. Aguarde um minuto e tente de novo.";
  if (erro.code === "SENHA_FRACA" && erro.message) return erro.message;
  if (erro.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") return "Já existe uma conta com este e-mail. Entre ou recupere a senha.";
  if (erro.code === "INVALID_EMAIL") return "E-mail inválido";
  return "Não foi possível criar a conta. Tente de novo.";
}

function Cadastro() {
  // O e-mail do convite chega como `?email=` e vem preenchido: a conta precisa
  // ser criada com ele para o convite ser encontrado.
  const emailDoConvite = useSearchParams().get("email") ?? "";
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState(emailDoConvite);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("As senhas não coincidem");
      setIsLoading(false);
      return;
    }

    const problema = problemaDeSenha(password);
    if (problema) {
      setError(problema);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await authCliente.signUp.email({
        name: fullName.trim(),
        email,
        password,
      });
      if (error) throw new Error(mensagemDoCadastro(error));

      // Sem confirmação por e-mail (`requireEmailVerification: false` em
      // api/auth/auth.ts) a conta nasce com sessão e vai direto ao painel. Se a
      // confirmação for ligada, não há sessão e a pessoa vê o aviso.
      router.push(data?.token ? "/dashboard" : "/auth/sign-up-success");
      router.refresh();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Erro ao criar conta");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full">
        <Card className="rounded-3xl">
          <CardHeader>
            <CardTitle className="text-3xl tracking-tight">Criar conta</CardTitle>
            <CardDescription>
              Preencha os dados abaixo para criar sua conta
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignUp}>
              <div className="flex flex-col gap-6">
                <div className="grid gap-2">
                  <Label htmlFor="fullName" className="text-foreground">Nome completo</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="João Silva"
                    required
                    maxLength={120}
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="grid gap-2 text-foreground">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div className="grid gap-2 text-foreground">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="grid gap-2 text-foreground">
                  <Label htmlFor="confirmPassword">Confirmar senha</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                  />
                </div>
                {error && (
                  <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <Button type="submit" className="w-full bg-primary hover:bg-primary/90" disabled={isLoading}>
                  {isLoading ? "Criando conta..." : "Criar conta"}
                </Button>
              </div>
              <div className="mt-4 text-center text-sm">
                Já tem uma conta?{" "}
                <Link
                  href="/auth/login"
                  className="font-medium text-primary hover:text-primary/80 underline-offset-4 hover:underline"
                >
                  Entrar
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
    </div>
  );
}
