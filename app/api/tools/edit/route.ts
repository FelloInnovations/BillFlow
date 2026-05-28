import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function PATCH(req: NextRequest) {
  const { toolKey, displayLabel, type, notes } = await req.json();
  if (!toolKey) return NextResponse.json({ error: "toolKey required" }, { status: 400 });

  const row: Record<string, unknown> = { tool_key: toolKey, updated_at: new Date().toISOString() };
  if (displayLabel !== undefined) row.display_label = displayLabel;
  if (type !== undefined) row.type = type;
  if (notes !== undefined) row.notes = notes;

  const { error } = await supabase
    .from("tool_overrides")
    .upsert(row, { onConflict: "tool_key" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
