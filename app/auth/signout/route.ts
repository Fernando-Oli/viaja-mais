import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { env } from "@/lib/env"

export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  // Antes lia NEXT_PUBLIC_SITE_URL, que nunca esteve declarada em lugar nenhum
  // e caía num localhost fixo — em produção, logout mandava o usuário para fora.
  return NextResponse.redirect(new URL("/", env.NEXT_PUBLIC_APP_URL))
}
