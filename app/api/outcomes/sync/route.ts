import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getLlmTrafficCount,
  getLlmBreakdown,
  getAllAiReferralMtdMetrics,
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
  dateStr: string,
  key: string,
  value: number,
  contactIds?: string[] | Record<string, number> | null,
) {
  const row: Record<string, unknown> = {
    project_id: "arthur",
    metric_key:  key,
    value,
    date:        dateStr,
    source:      "hubspot",
  };
  if (contactIds !== undefined) row.contact_ids = contactIds ?? null;
  const { error } = await supabase
    .from("project_outcome_metrics")
    .upsert(row, { onConflict: "project_id,metric_key,date" });
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
    await upsertMetric(supabase, dateStr, "llm_traffic_daily", total);
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
      await upsertMetric(supabase, dateStr, key, value);
      result.upserted.push({ metric_key: key, value });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[outcomes/sync] llm_breakdown:", msg);
    for (const key of ["llm_chatgpt_daily", "llm_perplexity_daily", "llm_claude_daily", "llm_other_daily"]) {
      result.errors.push({ metric_key: key, error: msg });
    }
  }

  // ── MTD metrics — one bulk HubSpot fetch, returns all 4 with contact_ids ──
  try {
    const { demosBooked, demosHeld, closedWon, arrClosed } =
      await getAllAiReferralMtdMetrics(dateStr);

    await upsertMetric(supabase, dateStr, "demos_booked_mtd", demosBooked.count, demosBooked.contactIds);
    result.upserted.push({ metric_key: "demos_booked_mtd", value: demosBooked.count });

    await upsertMetric(supabase, dateStr, "demos_held_mtd", demosHeld.count, demosHeld.contactIds);
    result.upserted.push({ metric_key: "demos_held_mtd", value: demosHeld.count });

    await upsertMetric(supabase, dateStr, "closed_won_mtd", closedWon.count, closedWon.contactIds);
    result.upserted.push({ metric_key: "closed_won_mtd", value: closedWon.count });

    await upsertMetric(supabase, dateStr, "arr_closed_mtd", arrClosed.total, arrClosed.arrPerContact);
    result.upserted.push({ metric_key: "arr_closed_mtd", value: arrClosed.total });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[outcomes/sync] mtd_metrics:", msg);
    for (const key of ["demos_booked_mtd", "demos_held_mtd", "closed_won_mtd", "arr_closed_mtd"]) {
      result.errors.push({ metric_key: key, error: msg });
    }
  }

  return NextResponse.json(result);
}
