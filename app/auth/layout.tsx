import type React from "react"
import Link from "next/link"
import { Logo } from "@/components/brand/logo"

/**
 * Casca das telas de conta (entrar, criar conta, recuperar senha).
 * Desktop: painel Floresta com a assinatura, a frase e o grafismo à esquerda;
 * formulário à direita, sobre Marfim. Celular: cabeçalho Floresta só com a
 * assinatura, e o formulário logo abaixo. O grafismo nunca fica atrás do
 * formulário (regra do manual).
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-2">
      <aside className="hidden flex-col bg-primary text-primary-foreground lg:flex">
        <div className="px-12 pt-10">
          <Link href="/" className="inline-flex rounded-md">
            <Logo variante="marfim" className="w-40 min-w-40" />
          </Link>
        </div>
        <div className="flex flex-1 flex-col justify-center gap-4 px-12">
          <p className="max-w-lg text-5xl font-semibold leading-[1.05] tracking-tight">Sua próxima viagem começa aqui.</p>
          <p className="max-w-md text-lg">Roteiro, reservas e despesas do grupo no mesmo lugar.</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- arte estática da marca */}
        <img src="/brand/avori-grafismo-floresta.svg" alt="" className="block w-full" />
      </aside>
      <div className="flex min-h-screen flex-col">
        <header className="rounded-b-[32px] bg-primary px-6 pb-6 pt-7 lg:hidden">
          <Link href="/" className="inline-flex rounded-md">
            <Logo variante="marfim" />
          </Link>
        </header>
        <main className="flex flex-1 items-center justify-center p-6 md:p-12">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  )
}
