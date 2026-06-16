export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  getAllTeamData,
  getTeamsEnrichedTotal,
  getTeamsEnrichedPeriod,
  getTeamsPushedToHubspot,
  getTeamDemosBooked,
  getTeamDemosHeld,
  getTeamClosedWon,
  getTeamArrClosed,
} from "@/lib/hubspot-enrichment-teams";
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
    source:      "hubspot-teams",
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

  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const dateStr = yesterday.toISOString().substring(0, 10);
  const [y, m] = dateStr.split("-");
  const monthStart = `${y}-${m}-01`;

  const supabase = serviceClient();
  const result: OutcomeSyncResult = { date: dateStr, upserted: [], errors: [] };

  let snap: Awaited<ReturnType<typeof getAllTeamData>>;
  let closedWonIds: string[];

  try {
    [snap, closedWonIds] = await Promise.all([getAllTeamData(), getClosedWonStageIds()]);
    console.error(`[sync-enrichment-teams] snap: companies=${snap.companyIds.length}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-enrichment-teams] bulk fetch failed:", msg);
    return NextResponse.json({ ...result, errors: [{ metric_key: "bulk_fetch", error: msg }] }, { status: 500 });
  }

  // ── teams_enriched_total / teams_pushed_hubspot_total ──────────────────────
  try {
    const { count: total } = await getTeamsEnrichedTotal();
    await upsertMetric(supabase, dateStr, "teams_enriched_total",      total, null);
    await upsertMetric(supabase, dateStr, "teams_pushed_hubspot_total", total, null);
    result.upserted.push(
      { metric_key: "teams_enriched_total",      value: total },
      { metric_key: "teams_pushed_hubspot_total", value: total },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push({ metric_key: "teams_enriched_total", error: msg });
  }

  // ── teams_enriched_period / teams_pushed_hubspot (MTD) ─────────────────────
  try {
    const { count, companyIds } = await getTeamsEnrichedPeriod(monthStart, dateStr);
    await upsertMetric(supabase, dateStr, "teams_enriched_period", count, companyIds);
    result.upserted.push({ metric_key: "teams_enriched_period", value: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push({ metric_key: "teams_enriched_period", error: msg });
  }

  try {
    const { count, companyIds } = await getTeamsPushedToHubspot(monthStart, dateStr);
    await upsertMetric(supabase, dateStr, "teams_pushed_hubspot", count, companyIds);
    result.upserted.push({ metric_key: "teams_pushed_hubspot", value: count });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result.errors.push({ metric_key: "teams_pushed_hubspot", error: msg });
  }

  // ── team demos / deals ─────────────────────────────────────────────────────
  try {
    const metrics: [string, { count?: number; total?: number; companyIds?: string[]; arrPerCompany?: Record<string, number> }][] = [
      ["team_demos_booked_mtd", getTeamDemosBooked(snap, dateStr)],
      ["team_demos_held_mtd",   getTeamDemosHeld(snap, dateStr)],
      ["team_closed_won_mtd",   getTeamClosedWon(snap, dateStr, closedWonIds)],
      ["team_arr_closed_mtd",   getTeamArrClosed(snap, dateStr, closedWonIds)],
    ];

    for (const [key, res] of metrics) {
      const value = "count" in res ? (res.count ?? 0) : (res.total ?? 0);
      const ids   = "companyIds" in res ? res.companyIds : res.arrPerCompany;
      await upsertMetric(supabase, dateStr, key, value, ids);
      result.upserted.push({ metric_key: key, value });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-enrichment-teams] HubSpot metrics:", msg);
    for (const key of ["team_demos_booked_mtd", "team_demos_held_mtd", "team_closed_won_mtd", "team_arr_closed_mtd"]) {
      result.errors.push({ metric_key: key, error: msg });
    }
  }

  return NextResponse.json(result);
}
