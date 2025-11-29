import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  console.log("[v0] Accept invitation route called")
  try {
    const { invitationId } = await params
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("[v0] Accepting invitation:", invitationId, "for user:", user.id, user.email)

    const { data: invitation, error: invitationError } = await supabase
      .from("trip_invitations")
      .select(`
        id,
        trip_id,
        inviter_id,
        invitee_email,
        status,
        trips!inner (
          id,
          title
        )
      `)
      .eq("id", invitationId)
      .eq("invitee_email", user.email)
      .eq("status", "pending")
      .single()

    if (invitationError || !invitation) {
      console.error("[v0] Invitation error:", invitationError)
      return NextResponse.json({ error: "Convite não encontrado ou já processado" }, { status: 404 })
    }

    console.log("[v0] Found invitation:", invitation)

    const { data: existingMember } = await supabase
      .from("trip_members")
      .select("id")
      .eq("trip_id", invitation.trip_id)
      .eq("user_id", user.id)
      .maybeSingle()

    if (!existingMember) {
      console.log("[v0] Adding user as member")
      const { error: memberError } = await supabase.from("trip_members").insert({
        trip_id: invitation.trip_id,
        user_id: user.id,
        role: "member",
      })

      if (memberError) {
        console.error("[v0] Member error:", memberError)
        return NextResponse.json({ error: "Erro ao adicionar membro" }, { status: 400 })
      }
      console.log("[v0] User added as member successfully")
    } else {
      console.log("[v0] User is already a member, skipping insert")
    }

    console.log("[v0] Updating invitation status")
    const { error: updateError } = await supabase
      .from("trip_invitations")
      .update({
        status: "accepted",
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitationId)
      .eq("invitee_email", user.email)

    if (updateError) {
      console.error("[v0] Update error:", updateError)
      return NextResponse.json({ error: updateError }, { status: 400 })
    }

    console.log("[v0] Invitation accepted successfully")

    return NextResponse.json({
      success: true,
      trip: invitation,
    })
  } catch (error) {
    console.error("[v0] Accept invitation error:", error)
    return NextResponse.json({ error: "Erro interno do servidor" }, { status: 500 })
  }
}
