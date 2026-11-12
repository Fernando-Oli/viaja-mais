import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { ErroHttp, respostaDeErro } from "@/lib/http"
import { exigirLimite, LIMITES } from "@/lib/seguranca/limite"

/**
 * Troca de senha. A senha atual é conferida com `signInWithPassword`, e isso
 * faz desta rota um oráculo: quem tem uma sessão roubada testaria senhas atuais
 * à vontade. O limite conta só as tentativas que chegam a essa conferência —
 * erro de digitação na confirmação não gasta tentativa.
 *
 * @RNF02.8 5 conferências de senha por 15 minutos, por usuário
 */

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const formData = await request.formData()
    const current_password = formData.get("current_password") as string
    const new_password = formData.get("new_password") as string
    const confirm_password = formData.get("confirm_password") as string

    // Validate inputs
    if (!current_password || !new_password || !confirm_password) {
      return NextResponse.json({ error: "Todos os campos são obrigatórios" }, { status: 400 })
    }

    if (new_password !== confirm_password) {
      return NextResponse.json({ error: "As senhas não coincidem" }, { status: 400 })
    }

    if (new_password.length < 6) {
      return NextResponse.json({ error: "A nova senha deve ter pelo menos 6 caracteres" }, { status: 400 })
    }

    await exigirLimite(supabase, LIMITES.trocarSenha)

    // Verify current password by trying to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email!,
      password: current_password,
    })

    if (signInError) {
      return NextResponse.json({ error: "Senha atual incorreta" }, { status: 400 })
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: new_password,
    })

    if (updateError) {
      console.error("[v0] Password update error:", updateError)
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, message: "Senha alterada com sucesso" })
  } catch (error) {
    if (error instanceof ErroHttp) return respostaDeErro(error)
    console.error("[v0] Change password route error:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
