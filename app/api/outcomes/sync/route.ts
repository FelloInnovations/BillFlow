import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getLlmTrafficCount,
  getLlmBreakdown,
  getDemosBookedMtd,
  getDemosHeldMtd,
  getClosedWonMtd,
  getArrClosedMtd,
} from "@/lib/hubspot-outcomes";
import { OutcomeSyncResult } from "@/types";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function upsertMetric(
  supabase: ReturnType<typeof serviceClient>,
  projectId: string,
  dateStr: string,
  key: string,
  value: number,
) {
  const { error } = await supabase.from("project_outcome_metrics").upsert(
    { project_id: projectId, metric_key: key, value, date: dateStr, source: "hubspot" },
    { onConflict: "project_id,metric_key,date" },
  );
  if (error) throw new Error(error.message);
}

export async function GET(req: NextRequest) {
  const secret   = process.env.OUTCOMES_SYNC_SECRET;
  const provided = req.headers.get("x-sync-secret") ?? req.nextUrl.searchParams.get("secret");

  if (!secret || provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // yesterday in UTC
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = yesterday.toISOString().substring(0, 10);

  const supabase = serviceClient();
  const result: OutcomeSyncResult = { date: dateStr, upserted: [], errors: [] };

  // ── LLM total ────────────────────────────────────────────────────────────
  try {
    const { total } = await getLlmTrafficCount(dateStr);
    await upsertMetric(supabase, "arthur", dateStr, "llm_traffic_daily", total);
    result.upserted.push({ metric_key: "llm_traffic_daily", value: total });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[outcomes/sync] llm_traffic_daily:", msg);
    result.errors.push({ metric_key: "llm_traffic_daily", error: msg });
  }

  // ── LLM breakdown (4 metrics from one API call) ───────────────────────────
  try {
    const breakdown = await getLlmBreakdown(dateStr);
    const entries: [string, number][] = [
      ["llm_chatgpt_daily",    breakdown.chatgpt],
      ["llm_perplexity_daily", breakdown.perplexity],
      ["llm_claude_daily",     breakdown.claude],
      ["llm_other_daily",      breakdown.other],
    ];
    for (const [key, value] of entries) {
      await upsertMetric(supabase, "arthur", dateStr, key, value);
      result.upserted.push({ metric_key: key, value });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[outcomes/sync] llm_breakdown:", msg);
    for (const key of ["llm_chatgpt_daily", "llm_perplexity_daily", "llm_claude_daily", "llm_other_daily"]) {
      result.errors.push({ metric_key: key, error: msg });
    }
  }

  // ── MTD metrics (each independent) ───────────────────────────────────────
  const mtdMetrics: { key: string; fn: () => Promise<{ count: number } | { total: number }> }[] = [
    { key: "demos_booked_mtd", fn: () => getDemosBookedMtd(dateStr) },
    { key: "demos_held_mtd",   fn: () => getDemosHeldMtd(dateStr) },
    { key: "closed_won_mtd",   fn: () => getClosedWonMtd(dateStr) },
    { key: "arr_closed_mtd",   fn: () => getArrClosedMtd(dateStr) },
  ];

  for (const { key, fn } of mtdMetrics) {
    try {
      const res = await fn();
      const value = "count" in res ? res.count : res.total;
      await upsertMetric(supabase, "arthur", dateStr, key, value);
      result.upserted.push({ metric_key: key, value });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[outcomes/sync] ${key}:`, msg);
      result.errors.push({ metric_key: key, error: msg });
    }
  }

  return NextResponse.json(result);
}
