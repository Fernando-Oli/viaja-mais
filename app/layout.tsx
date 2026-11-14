import type React from "react"
import type { Metadata } from "next"
import { Instrument_Sans } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/context/auth-context"
import { Toaster } from "@/components/ui/toaster"

// Auto-hospedada pelo next/font: nenhum pedido sai para o Google, então a CSP não muda.
const instrumentSans = Instrument_Sans({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument-sans",
})

export const metadata: Metadata = {
  title: "Avori",
  description: "Roteiro, reservas e despesas do grupo no mesmo lugar.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={`${instrumentSans.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
        {/* Sem isto, toda chamada a toast() no app é um no-op silencioso. */}
        <Toaster />
      </body>
    </html>
  )
}
