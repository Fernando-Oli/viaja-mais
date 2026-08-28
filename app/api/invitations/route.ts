import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { env } from "@/lib/env"

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: invitations, error } = await supabase
      .from("trip_invitations")
      .select("*")
      .eq("invitee_email", user.email)
      .eq("status", "pending")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }


    const invitationsWithTrips = await Promise.all(
      (invitations || []).map(async (invitation) => {
        const { data: trip } = await supabase
          .from("trips")
          .select("id, title, destination, start_date, end_date")
          .eq("id", invitation.trip_id)
          .single()

        return {
          ...invitation,
          trip,
        }
      }),
    )

    return NextResponse.json({ invitations: invitationsWithTrips })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}




export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { email, tripId, inviterId } = body

    if (!email || !tripId || !inviterId) {
      return NextResponse.json(
        { error: "Missing email, tripId or inviterId" },
        { status: 400 }
      )
    }

    // 🔥 CLIENTE ADMIN (SERVICE ROLE)
    const supabaseAdmin = await createClient();

    //
    // 1️⃣ ENVIAR EMAIL DE CONVITE (ADMIN)
    //
    const { error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          invited_to_trip: tripId,
          inviter: inviterId,
        },
        redirectTo: `${env.NEXT_PUBLIC_APP_URL}/dashboard`,
      }
    )

    if (inviteError) {
      console.warn("Invite email failed, continuing anyway:", inviteError.message)
      // Não vamos parar — ele pode ainda não existir como usuário
    }

    //
    // 3️⃣ CRIAR O REGISTRO NA TABELA trip_invitations
    //
    const { error: insertError } = await supabaseAdmin
      .from("trip_invitations")
      .insert({
        trip_id: tripId,
        inviter_id: inviterId,
        invitee_email: email,
        status: "pending",
      })

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 400 }
      )
    }

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: any) {
    console.error("Invite API error:", error)
    return NextResponse.json(
      { error: error.message ?? "Internal server error" },
      { status: 500 }
    )
  }
}

