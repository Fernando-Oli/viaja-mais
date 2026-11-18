"use client"

import type React from "react"

import { authCliente } from "@/lib/auth-cliente"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { DICA_SENHA, problemaDeSenha, TAMANHO_MINIMO_SENHA } from "@/lib/seguranca/senha"

const LINK_INVALIDO = "Este link expirou ou já foi usado. Peça um novo abaixo."

/**
 * Recuperação de senha, em dois modos: pedir o e-mail com o link e escolher a
 * senha nova.
 *
 * O link do e-mail passa pela API (`/api/auth/reset-password/:token`), que
 * confere o token e devolve para cá com `?token=` — ou com
 * `?error=INVALID_TOKEN` se ele expirou ou já foi usado.
 *
 * @RF01.7 redefinir por e-mail a senha esquecida
 */
export default function ResetPasswordPage() {
  // useSearchParams pede um Suspense em volta (o Next pré-renderiza a página).
  return (
    <Suspense fallback={<Carregando />}>
      <Recuperacao />
    </Suspense>
  )
}

function Carregando() {
  return (
    <div className="flex w-full items-center justify-center py-12">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
        <p className="mt-4 text-muted-foreground">Carregando...</p>
      </div>
    </div>
  )
}

function Recuperacao() {
  const params = useSearchParams()
  // Lidos uma vez, na montagem: o efeito abaixo limpa a URL logo em seguida.
  const [token, setToken] = useState<string | null>(() => params.get("token"))
  const [error, setError] = useState<string | null>(() =>
    !params.get("token") && params.get("error") === "INVALID_TOKEN" ? LINK_INVALIDO : null,
  )
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const hasToken = token !== null
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    // O token sai da barra de endereço assim que é lido: não fica no histórico
    // do navegador nem segue em cabeçalho Referer.
    const atual = new URLSearchParams(window.location.search)
    if (atual.has("token") || atual.has("error")) window.history.replaceState(null, "", window.location.pathname)
  }, [])

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await authCliente.requestPasswordReset({
        email,
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      if (error) {
        throw new Error(
          error.status === 429 ? "Muitos pedidos. Aguarde um minuto e tente de novo." : "Erro ao enviar email de recuperação",
        )
      }

      // A mesma mensagem com e sem conta: a tela não diz quais e-mails existem.
      toast({
        title: "Pedido recebido",
        description: "Se houver uma conta com este e-mail, o link para redefinir a senha chega em instantes.",
      })
      setEmail("")
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Erro ao enviar email de recuperação")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError("As senhas não coincidem")
      return
    }

    const problema = problemaDeSenha(password)
    if (problema) {
      setError(problema)
      return
    }

    setIsLoading(true)

    try {
      const { error } = await authCliente.resetPassword({ newPassword: password, token: token! })
      if (error) {
        if (error.code === "INVALID_TOKEN") {
          setToken(null)
          throw new Error(LINK_INVALIDO)
        }
        throw new Error(error.code === "SENHA_FRACA" && error.message ? error.message : "Erro ao redefinir senha")
      }

      // A troca encerra todas as sessões abertas: entra de novo com a senha nova.
      toast({
        title: "Senha redefinida!",
        description: "Entre com a senha nova.",
      })

      setTimeout(() => {
        router.push("/auth/login")
      }, 1500)
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "Erro ao redefinir senha")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full">
        <p className="mb-3 text-sm font-medium text-muted-foreground">{hasToken ? "Redefinir sua senha" : "Recuperar senha"}</p>
        <Card className="rounded-3xl">
          {hasToken ? (
            <>
              <CardHeader>
                <CardTitle className="text-3xl tracking-tight">Nova senha</CardTitle>
                <CardDescription>Digite sua nova senha abaixo</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleResetPassword}>
                  <div className="flex flex-col gap-6">
                    <div className="grid gap-2">
                      <Label htmlFor="password">Nova senha</Label>
                      <Input
                        id="password"
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        minLength={TAMANHO_MINIMO_SENHA}
                        placeholder={DICA_SENHA}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="confirm-password">Confirmar senha</Label>
                      <Input
                        id="confirm-password"
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        minLength={TAMANHO_MINIMO_SENHA}
                        placeholder="Digite a senha novamente"
                      />
                    </div>
                    {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? "Redefinindo..." : "Redefinir senha"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-3xl tracking-tight">Esqueceu sua senha?</CardTitle>
                <CardDescription>Digite seu email e enviaremos um link para redefinir sua senha</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRequestReset}>
                  <div className="flex flex-col gap-6">
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
                    {error && <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
                    <Button type="submit" className="w-full" disabled={isLoading}>
                      {isLoading ? "Enviando..." : "Enviar link de recuperação"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </>
          )}
        </Card>

        <div className="mt-4 text-center">
          <Link
            href="/auth/login"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para login
          </Link>
        </div>
    </div>
  )
}
