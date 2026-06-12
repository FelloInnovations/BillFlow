import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAgentsEnrichedTotal,
  getAgentsEnrichedPeriod,
  getAgentsPushedToHubspot,
  getAllEnrichedData,
  computeDemosBooked,
  computeDemosHeld,
  computeClosedWon,
  computeArrClosed,
} from "@/lib/hubspot-enrichment-outcomes";
import { getClosedWonStageIds } from "@/lib/hubspot-outcomes";
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
    project_id: "enrichment",
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
  const [y, m] = dateStr.split("-");
  const monthStart = `${y}-${m}-01`;

  const supabase = serviceClient();
  const result: OutcomeSyncResult = { date: dateStr, upserted: [], errors: [] };

  // ── agents_enriched_total (always all-time, Supabase) ──────────────────────
  try {
    const { count } = await getAgentsEnrichedTotal();
    await upsertMetric(supabase, dateStr, "agents_enriched_total", count, null);
    result.upserted.push({ metric_key: "agents_enriched_total", value: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-enrichment] agents_enriched_total:", msg);
    result.errors.push({ metric_key: "agents_enriched_total", error: msg });
  }

  // ── agents_enriched_period (MTD, Supabase) ─────────────────────────────────
  try {
    const { count } = await getAgentsEnrichedPeriod(monthStart, dateStr);
    await upsertMetric(supabase, dateStr, "agents_enriched_period", count, null);
    result.upserted.push({ metric_key: "agents_enriched_period", value: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-enrichment] agents_enriched_period:", msg);
    result.errors.push({ metric_key: "agents_enriched_period", error: msg });
  }

  // ── agents_pushed_hubspot (MTD, HubSpot) ───────────────────────────────────
  try {
    const { count, contactIds } = await getAgentsPushedToHubspot(dateStr);
    await upsertMetric(supabase, dateStr, "agents_pushed_hubspot", count, contactIds);
    result.upserted.push({ metric_key: "agents_pushed_hubspot", value: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-enrichment] agents_pushed_hubspot:", msg);
    result.errors.push({ metric_key: "agents_pushed_hubspot", error: msg });
  }

  // ── demos / deals — bulk HubSpot fetch ────────────────────────────────────
  try {
    const [snap, closedWonIds] = await Promise.all([
      getAllEnrichedData(),
      getClosedWonStageIds(),
    ]);

    const metrics: [string, { count?: number; total?: number; contactIds?: string[]; arrPerContact?: Record<string, number> }][] = [
      ["demos_booked_mtd", computeDemosBooked(snap, dateStr)],
      ["demos_held_mtd",   computeDemosHeld(snap, dateStr)],
      ["closed_won_mtd",   computeClosedWon(snap, dateStr, closedWonIds)],
      ["arr_closed_mtd",   computeArrClosed(snap, dateStr, closedWonIds)],
    ];

    for (const [key, res] of metrics) {
      const value = "count" in res ? (res.count ?? 0) : (res.total ?? 0);
      const ids   = "contactIds" in res ? res.contactIds : res.arrPerContact;
      await upsertMetric(supabase, dateStr, key, value, ids);
      result.upserted.push({ metric_key: key, value });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-enrichment] HubSpot metrics:", msg);
    for (const key of ["demos_booked_mtd", "demos_held_mtd", "closed_won_mtd", "arr_closed_mtd"]) {
      result.errors.push({ metric_key: key, error: msg });
    }
  }

  return NextResponse.json(result);
}
