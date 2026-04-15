import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DB } from "@/lib/db";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { token } = await req.json();
    const normalizedToken = typeof token === "string" ? token.trim() : "";

    if (!normalizedToken) {
      return NextResponse.json({ error: "Missing token" }, { status: 400 });
    }

    const { data: existingRow, error: lookupError } = await supabase
      .from(DB.sessionStudents)
      .select("id, confirmation_status")
      .eq("confirmation_token", normalizedToken)
      .maybeSingle();

    if (lookupError) {
      return NextResponse.json({ error: lookupError.message }, { status: 500 });
    }

    if (!existingRow) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    if (existingRow.confirmation_status === "confirmed") {
      return NextResponse.json({ success: true, alreadyConfirmed: true });
    }

    const { data, error } = await supabase
      .from(DB.sessionStudents)
      .update({
        confirmation_status: "confirmed",
      })
      .eq("id", existingRow.id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ error: "Invalid or expired token" }, { status: 400 });
    }

    // Best effort only; confirmation flow should succeed even if analytics insert fails.
    await supabase.from(DB.events).insert({
      event_name: 'confirmation_updated',
      properties: { status: 'confirmed', source: 'confirm_link' },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}