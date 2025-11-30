"use client"

import type React from "react"

import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { Plane, ArrowLeft } from "lucide-react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [hasToken, setHasToken] = useState(true)
  const [checkingToken, setCheckingToken] = useState(false)
  const router = useRouter()
  const { toast } = useToast()

  useEffect(() => {
    // Verifica se há um token de recuperação válido na URL
    setCheckingToken(false)
  }, [])

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    const supabase = createClient()
    setIsLoading(true)
    setError(null)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) throw error

      toast({
        title: "Email enviado!",
        description: "Verifique sua caixa de entrada para redefinir sua senha.",
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

    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres")
      return
    }

    const supabase = createClient()
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: password,
      })

      if (error) throw error

      toast({
        title: "Senha redefinida!",
        description: "Sua senha foi alterada com sucesso.",
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

  if (checkingToken) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-sky-50 via-white to-amber-50">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#319f43] border-t-transparent mx-auto" />
          <p className="mt-4 text-slate-600">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-sky-50 via-white to-amber-50 p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4  w-auto rounded-2xl flex items-center justify-center gap-2 ">
            <Plane className="h-10 w-10 text-white bg-viaja-green rounded-sm" /> 
            <h1 className="text-3xl font-bold text-navy">Viaja+</h1>
          </div>
          <p className="mt-2 text-slate-600">{hasToken ? "Redefinir sua senha" : "Recuperar senha"}</p>
        </div>

        <Card>
          {hasToken ? (
            <>
              <CardHeader>
                <CardTitle className="text-2xl">Nova senha</CardTitle>
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
                        minLength={6}
                        placeholder="Mínimo 6 caracteres"
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
                        minLength={6}
                        placeholder="Digite a senha novamente"
                      />
                    </div>
                    {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
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
                <CardTitle className="text-2xl">Esqueceu sua senha?</CardTitle>
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
                    {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}
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
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="h-4 w-4" />
            Voltar para login
          </Link>
        </div>
      </div>
    </div>
  )
}
