import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase
    .from("api_invocation_logs")
    .select("invoked_at, cost_usd")
    .not("cost_usd", "is", null)
    .order("invoked_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byDate: Record<string, number> = {};
  for (const row of data ?? []) {
    const date = (row.invoked_at as string).substring(0, 10);
    byDate[date] = (byDate[date] ?? 0) + Number(row.cost_usd ?? 0);
  }

  const daily = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }));

  return NextResponse.json(daily);
}
