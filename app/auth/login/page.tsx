"use client"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Plane } from "lucide-react"

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const router = useRouter();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.push("/dashboard");
      router.refresh();
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Erro ao fazer login");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    setIsResetting(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) throw error;

      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
      });
      setShowForgotPassword(false);
      setResetEmail("");
    } catch (error: unknown) {
      toast({
        title: "Erro",
        description:
          error instanceof Error
            ? error.message
            : "Erro ao enviar email de recuperação",
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-linear-to-br from-sky-50 via-white to-amber-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-viaja-green rounded-xl flex items-center justify-center relative">
                <Plane className="h-5 w-5 text-white" />
              </div>
              <span className="text-2xl font-bold text-viaja-navy">Viaja+</span>
            </div>
          </div>
          <p className="mt-2 text-viaja-navy">Bem-vindo de volta!</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl text-viaja-green">Entrar</CardTitle>
            <CardDescription className="text-viaja-navy">
              Digite seu email e senha para acessar sua conta
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin}>
              <div className="flex flex-col gap-6 text-viaja-navy">
                <div className="grid gap-2">
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
                
                <div className="grid gap-2">
                  <Label htmlFor="password">Senha</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <div className="flex items-center justify-end">
                    
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-sm text-navy hover:text-navy/40 cursor-pointer hover:underline"
                    >
                      Esqueceu a senha?
                    </button>
                  </div>
                </div>
                    
                {error && (
                  <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">
                    {error}
                  </div>
                )}
                <Button
                  type="submit"
                  className="w-full bg-viaja-orange hover:bg-viaja-orange/90"
                  disabled={isLoading}
                >
                  {isLoading ? "Entrando..." : "Entrar"}
                </Button>
              </div>
              <div className="mt-4 text-center text-sm">
                Não tem uma conta?{" "}
                <Link
                  href="/auth/sign-up"
                  className="font-medium text-viaja-green hover:text-viaja-green/80 underline-offset-4 hover:underline"
                >
                  Criar conta
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
      <Dialog open={showForgotPassword} onOpenChange={setShowForgotPassword}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Esqueceu sua senha?</DialogTitle>
            <DialogDescription>Digite seu email e enviaremos um link para redefinir sua senha.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="seu@email.com"
                  required
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowForgotPassword(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isResetting}>
                {isResetting ? "Enviando..." : "Enviar link"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
