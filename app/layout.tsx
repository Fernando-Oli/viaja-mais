import type React from "react"
import type { Metadata } from "next"
import { Poppins } from "next/font/google"
import "./globals.css"
import { AuthProvider } from "@/context/auth-context"
import { Toaster } from "@/components/ui/toaster"

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
})

export const metadata: Metadata = {
  title: "Viaja +",
  description: "Centralize todo o planejamento da sua viagem em um só lugar",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className={`${poppins.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
        {/* Sem isto, toda chamada a toast() no app é um no-op silencioso. */}
        <Toaster />
      </body>
    </html>
  )
}
