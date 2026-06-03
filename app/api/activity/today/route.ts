import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const currentMonth = new Date().toISOString().substring(0, 7);

  const { data } = await supabase
    .from("openrouter_usage_snapshots")
    .select("key_name, usage_today")
    .eq("month", currentMonth);

  const today: Record<string, number> = {};
  for (const row of data ?? []) {
    today[row.key_name as string] = Number(row.usage_today ?? 0);
  }

  return NextResponse.json({ today });
}
