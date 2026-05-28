import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const periodParam = searchParams.get("period") ?? "3m";
  const months = periodParam === "12m" ? 12 : periodParam === "6m" ? 6 : 3;

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  const { data } = await supabase
    .from("api_invocation_logs")
    .select("key_name, invoked_at, cost_usd")
    .gte("invoked_at", `${cutoffStr}T00:00:00Z`)
    .order("invoked_at", { ascending: true });

  const dayMap = new Map<string, Record<string, number>>();
  const keySet = new Set<string>();

  for (const row of data ?? []) {
    const date = (row.invoked_at as string).substring(0, 10);
    const key  = row.key_name as string;
    keySet.add(key);
    if (!dayMap.has(date)) dayMap.set(date, {});
    const entry = dayMap.get(date)!;
    entry[key] = (entry[key] ?? 0) + (Number(row.cost_usd) || 0);
  }

  const keyNames = [...keySet];

  // Fill zeros so every date has every key (required for stacked bar chart)
  const days = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => {
      const entry: Record<string, number | string> = { date };
      for (const k of keyNames) entry[k] = vals[k] ?? 0;
      return entry;
    });

  return NextResponse.json({ days, key_names: keyNames });
}
