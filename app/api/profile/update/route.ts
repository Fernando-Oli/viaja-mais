import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

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
    const full_name = formData.get("full_name") as string
    const avatar_url = formData.get("avatar_url") as string

    // Validate inputs
    if (!full_name || full_name.trim().length === 0) {
      return NextResponse.json({ error: "Nome completo é obrigatório" }, { status: 400 })
    }

    // Update profile
    const { data: profile, error } = await supabase
      .from("profiles")
      .update({
        full_name: full_name.trim(),
        avatar_url: avatar_url?.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select()
      .single()

    if (error) {
      console.error("[v0] Profile update error:", error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ success: true, profile })
  } catch (error) {
    console.error("[v0] Profile update route error:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
