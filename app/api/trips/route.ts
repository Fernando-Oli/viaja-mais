import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: trips, error } = await supabase
      .from("trips")
      .select(`
        *,
        trip_members!inner(user_id, role)
      `)
      .eq("trip_members.user_id", user.id)
      .order("start_date", { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ trips })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Create trip
    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .insert({
        ...body,
        user_id: user.id,
      })
      .select()
      .single()

    if (tripError) {
      return NextResponse.json({ error: tripError.message }, { status: 400 })
    }

    // Add creator as member
    const { error: memberError } = await supabase.from("trip_members").insert({
      trip_id: trip.id,
      user_id: user.id,
      role: "owner",
    })

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 400 })
    }

    return NextResponse.json({ trip })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
