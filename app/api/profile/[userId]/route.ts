import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const resolvedParams = await params;

    const { userId } = resolvedParams;

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!userId || userId === "undefined" || !uuidRegex.test(userId)) {
      console.error("[v0] Profile route - Invalid userId:", userId);
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, created_at, updated_at")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("[v0] Profile fetch error:", error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    console.error("[v0] Profile route error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;

  try {
    const supabase = await createClient();
    const body = await request.json();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || user.id !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Mass-assignment: `body` vem do cliente e vai inteiro para o UPDATE, o que
    // permite reescrever colunas que não deveriam ser editáveis.
    // TODO(S02/T1): validar com zod e extrair campo a campo — ver CLAUDE.md.
    const { data: profile, error } = await supabase
      .from("profiles")
      .update(body)
      .eq("id", userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ profile });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
