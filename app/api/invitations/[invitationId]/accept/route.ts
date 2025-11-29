import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request, { params }: { params: { invitationId: string } }) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get invitation
    const { data: invitation, error: invitationError } = await supabase
      .from("trip_invitations")
      .select("*")
      .eq("id", params.invitationId)
      .eq("invitee_email", user.email)
      .single()

    if (invitationError) {
      return NextResponse.json({ error: invitationError.message }, { status: 400 })
    }

    // Add user as member
    const { error: memberError } = await supabase.from("trip_members").insert({
      trip_id: invitation.trip_id,
      user_id: user.id,
      role: "member",
    })

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 })
    }

    // Update invitation status
    const { error: updateError } = await supabase
      .from("trip_invitations")
      .update({ status: "accepted" })
      .eq("id", params.invitationId)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
