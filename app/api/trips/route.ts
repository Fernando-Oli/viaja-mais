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

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "Trip could not be created" },
        { status: 500 }
      );
    }

    // @RF03.1 criar viagem. O trigger `on_trip_created` (supabase/migrations/)
    // já insere o criador em trip_members como owner, na mesma transação do
    // insert acima — inserir
    // de novo aqui colide com a constraint única trip_members_trip_id_user_id_key.
    return NextResponse.json({ data });
  } catch (_error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
