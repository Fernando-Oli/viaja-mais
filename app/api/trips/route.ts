import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: trips, error } = await supabase
      .from("trips")
      .select(
        `
        *,
        trip_members!inner(user_id, role)
      `
      )
      .eq("trip_members.user_id", user.id)
      .order("start_date", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ trips });
  } catch (_error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      data: { user },
    } = await supabase.auth.getUser();


    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create trip
      const { data, error } = await supabase
        .from("trips")
        .insert([
          {
            user_id: user.id,
            title: body.title,
            destination: body.destination,
            start_date: body.start_date,
            end_date: body.end_date,
            description: body.description || null,
            budget: body.budget ? Number.parseFloat(body.budget) : null,
            currency: body.currency,
            status: body.status,
          },
        ])
        .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const tripId = data?.[0]?.id;

    if (!tripId) {
      return NextResponse.json(
        { error: "Trip could not be created" },
        { status: 500 }
      );
    }

    // Registra o criador como membro dono. Sem isto a viagem some da própria
    // lista: o GET acima faz `trip_members!inner` e filtra por participação, então
    // uma viagem sem linha em trip_members nunca volta para ninguém.
    const { error: memberError } = await supabase.from("trip_members").insert({
      trip_id: tripId,
      user_id: user.id,
      role: "owner",
    });

    if (memberError) {
      const { error: rollbackError } = await supabase
        .from("trips")
        .delete()
        .eq("id", tripId);

      if (rollbackError) {
        return NextResponse.json({ error: rollbackError.message }, { status: 500 });
      }

      return NextResponse.json({ error: memberError.message }, { status: 400 });
    }

    return NextResponse.json({ data });
  } catch (_error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
