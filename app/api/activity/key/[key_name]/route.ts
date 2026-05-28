import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key_name: string }> }
) {
  const { key_name } = await params;
  const keyName = decodeURIComponent(key_name);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().substring(0, 10);

  const { data } = await supabase
    .from("api_invocation_logs")
    .select("invoked_at, cost_usd, model, prompt_tokens, completion_tokens")
    .eq("key_name", keyName)
    .gte("invoked_at", `${cutoffStr}T00:00:00Z`)
    .order("invoked_at", { ascending: true });

  const rows = data ?? [];

  // Daily spend (last 30 days)
  const dailyMap = new Map<string, number>();
  for (const r of rows) {
    const date = (r.invoked_at as string).substring(0, 10);
    dailyMap.set(date, (dailyMap.get(date) ?? 0) + (Number(r.cost_usd) || 0));
  }
  const daily = [...dailyMap.entries()].sort().map(([date, cost]) => ({ date, cost }));

  // Model breakdown aggregated
  const modelMap = new Map<string, {
    requests: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_cost: number;
  }>();
  for (const r of rows) {
    const m = (r.model as string | null) ?? "(unknown)";
    const e = modelMap.get(m) ?? { requests: 0, prompt_tokens: 0, completion_tokens: 0, total_cost: 0 };
    e.requests++;
    e.prompt_tokens     += (r.prompt_tokens as number | null)     ?? 0;
    e.completion_tokens += (r.completion_tokens as number | null) ?? 0;
    e.total_cost        += Number(r.cost_usd) || 0;
    modelMap.set(m, e);
  }
  const models = [...modelMap.entries()]
    .map(([model, s]) => ({
      model,
      requests:           s.requests,
      prompt_tokens:      s.prompt_tokens,
      completion_tokens:  s.completion_tokens,
      total_cost:         s.total_cost,
      avg_cost:           s.requests > 0 ? s.total_cost / s.requests : 0,
    }))
    .sort((a, b) => b.total_cost - a.total_cost);

  return NextResponse.json({ daily, models });
}
