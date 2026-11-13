import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  const { invitationId } = await params
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { error } = await supabase
      .from("trip_invitations")
      .update({ status: "declined" })
      .eq("id", invitationId)
      .eq("invitee_email", user.email)

    // Mensagem genérica: a do Postgres revela coluna e constraint (RNF02.11).
    if (error) {
      return NextResponse.json({ error: "Não foi possível recusar o convite" }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
