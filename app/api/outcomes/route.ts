export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OutcomeMtdSummary, ProjectOutcomeSummary } from "@/types";

// Keys that are summed across all rows in a date range
const DAILY_KEYS = new Set([
  "llm_traffic_daily",
  "llm_chatgpt_daily",
  "llm_perplexity_daily",
  "llm_claude_daily",
  "llm_other_daily",
]);

// Keys where the portfolio-level value = latest snapshot (not sum across months)
const LATEST_KEYS = new Set([
  "agents_enriched_total",
]);

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

function scopeToDateRange(scope: string): { from: string; to: string } {
  const now = new Date();
  const today = now.toISOString().substring(0, 10);
  if (scope === "this_month") {
    const from = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
    return { from, to: today };
  }
  if (scope === "last_month") {
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const last  = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    return { from: first.toISOString().substring(0, 10), to: last.toISOString().substring(0, 10) };
  }
  if (scope === "last_3m") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)).toISOString().substring(0, 10);
    return { from, to: today };
  }
  if (scope === "last_12m") {
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1)).toISOString().substring(0, 10);
    return { from, to: today };
  }
  if (scope === "all_time") {
    return { from: "2000-01-01", to: today };
  }
  // default: last_6m
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1)).toISOString().substring(0, 10);
  return { from, to: today };
}

export async function GET(req: NextRequest) {
  const scope = req.nextUrl.searchParams.get("scope") ?? "all_time";
  const { from, to } = scopeToDateRange(scope);

  const supabase = serviceClient();

  const { data: configRows, error: configErr } = await supabase
    .from("project_outcome_config")
    .select("project_id")
    .eq("is_active", true);

  if (configErr) return NextResponse.json({ error: configErr.message }, { status: 500 });

  const projectIds = [
    ...new Set((configRows ?? []).map((r: { project_id: string }) => r.project_id)),
  ];
  if (projectIds.length === 0) return NextResponse.json({ projects: [], portfolioTotals: null });

  const [{ data: metricRows }, { data: syncRows }] = await Promise.all([
    supabase
      .from("project_outcome_metrics")
      .select("project_id, metric_key, date, value")
      .in("project_id", projectIds)
      .gte("date", from)
      .lte("date", to)
      .order("date"),   // ASC so last write wins for MTD snapshots
    supabase
      .from("project_outcome_metrics")
      .select("project_id, created_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false }),
  ]);

  // Aggregate per project
  const dailySums:     Record<string, Record<string, number>> = {};
  const latestByMonth: Record<string, Record<string, Record<string, number>>> = {};
  const latestGlobal:  Record<string, Record<string, { date: string; value: number }>> = {};

  for (const row of metricRows ?? []) {
    const pid   = row.project_id as string;
    const month = (row.date as string).substring(0, 7);
    const key   = row.metric_key as string;
    const val   = Number(row.value ?? 0);

    if (DAILY_KEYS.has(key)) {
      if (!dailySums[pid]) dailySums[pid] = {};
      dailySums[pid][key] = (dailySums[pid][key] ?? 0) + val;
    } else if (LATEST_KEYS.has(key)) {
      if (!latestGlobal[pid]) latestGlobal[pid] = {};
      if (!latestGlobal[pid][key] || row.date > latestGlobal[pid][key].date) {
        latestGlobal[pid][key] = { date: row.date, value: val };
      }
    } else {
      // MTD: rows ordered ASC → later dates overwrite earlier = latest snapshot per month
      if (!latestByMonth[pid]) latestByMonth[pid] = {};
      if (!latestByMonth[pid][month]) latestByMonth[pid][month] = {};
      latestByMonth[pid][month][key] = val;
    }
  }

  // Sum MTD snapshots across months
  const mtdSums: Record<string, Record<string, number>> = {};
  for (const [pid, months] of Object.entries(latestByMonth)) {
    if (!mtdSums[pid]) mtdSums[pid] = {};
    for (const monthData of Object.values(months)) {
      for (const [key, val] of Object.entries(monthData)) {
        mtdSums[pid][key] = (mtdSums[pid][key] ?? 0) + val;
      }
    }
  }

  // Build aggregated summary per project
  const aggregated: Record<string, OutcomeMtdSummary> = {};
  for (const pid of projectIds) {
    const latestVals: Record<string, number> = {};
    for (const [key, { value }] of Object.entries(latestGlobal[pid] ?? {})) {
      latestVals[key] = value;
    }
    aggregated[pid] = {
      ...(dailySums[pid] ?? {}),
      ...(mtdSums[pid] ?? {}),
      ...latestVals,
    };
  }

  const lastSyncedByProject: Record<string, string> = {};
  for (const row of syncRows ?? []) {
    if (!lastSyncedByProject[row.project_id]) {
      lastSyncedByProject[row.project_id] = row.created_at;
    }
  }

  const results: ProjectOutcomeSummary[] = [];
  for (const pid of projectIds) {
    const { data } = await supabase
      .from("agents_portfolio")
      .select("agents_projects, status")
      .ilike("agents_projects", `%${pid}%`)
      .limit(1);

    results.push({
      projectId:     pid,
      projectName:   data?.[0]?.agents_projects ?? null,
      projectStatus: data?.[0]?.status ?? null,
      mtd:           aggregated[pid] ?? {},
      lastSynced:    lastSyncedByProject[pid] ?? null,
    });
  }

  return NextResponse.json({ projects: results });
}
