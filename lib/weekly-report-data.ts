import { createClient } from "@supabase/supabase-js";
import type { WeeklyReportData, WeeklyReportSpendRow, WeeklyReportAlertRow } from "@/types";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export function getWeekBounds(offsetWeeks = 0): { start: string; end: string } {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + mondayOffset - offsetWeeks * 7);
  monday.setUTCHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  return {
    start: monday.toISOString().substring(0, 10),
    end:   sunday.toISOString().substring(0, 10),
  };
}

function weekLabel(start: string, end: string): string {
  const [, ms, ds] = start.split("-");
  const [ye, me, de] = end.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const startStr = `${months[parseInt(ms) - 1]} ${parseInt(ds)}`;
  const endStr   = `${months[parseInt(me) - 1]} ${parseInt(de)}, ${ye}`;
  return `${startStr} – ${endStr}`;
}

// Snapshot metrics accumulate as MTD totals each day.
// Weekly value = latest snapshot in this week - latest snapshot at end of last week.
const ARTHUR_SNAPSHOT_KEYS   = ["demos_booked_mtd", "demos_held_mtd", "closed_won_mtd", "arr_closed_mtd"] as const;
const ENRICH_SNAPSHOT_KEYS   = [
  "demos_booked_mtd", "demos_held_mtd", "closed_won_mtd", "arr_closed_mtd",
  "team_demos_booked_mtd", "team_demos_held_mtd", "team_closed_won_mtd", "team_arr_closed_mtd",
] as const;
// Daily count metrics are per-day totals — SUM within the week window.
const ENRICH_DAILY_KEYS      = ["agents_pushed_hubspot", "teams_pushed_hubspot"] as const;

// Returns the latest value per metric_key within a date window (for snapshot metrics).
async function getSnapshotLatest(
  supabase: ReturnType<typeof serviceClient>,
  projectId: string,
  from: string,
  to: string,
  metricKeys: readonly string[],
): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase
      .from("project_outcome_metrics")
      .select("metric_key, value, date")
      .eq("project_id", projectId)
      .in("metric_key", [...metricKeys])
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false });
    if (error || !data) return {};
    // Take the first (most recent) row per metric_key
    const result: Record<string, number> = {};
    for (const r of data) {
      if (!(r.metric_key in result)) result[r.metric_key] = r.value;
    }
    return result;
  } catch {
    return {};
  }
}

// Returns the SUM of daily rows within a date window (for per-day count metrics).
async function getDailySum(
  supabase: ReturnType<typeof serviceClient>,
  projectId: string,
  from: string,
  to: string,
  metricKeys: readonly string[],
): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase
      .from("project_outcome_metrics")
      .select("metric_key, value")
      .eq("project_id", projectId)
      .in("metric_key", [...metricKeys])
      .gte("date", from)
      .lte("date", to);
    if (error || !data) return {};
    const result: Record<string, number> = {};
    for (const r of data) {
      result[r.metric_key] = (result[r.metric_key] ?? 0) + r.value;
    }
    return result;
  } catch {
    return {};
  }
}

// Delta = this week's latest snapshot minus last week's latest snapshot (floor 0).
function getSnapshotDelta(
  thisWeekRows: Record<string, number>,
  lastWeekRows: Record<string, number>,
  metricKey: string,
): number {
  const thisVal = thisWeekRows[metricKey] ?? 0;
  const lastVal = lastWeekRows[metricKey] ?? 0;
  return Math.max(0, thisVal - lastVal);
}

async function getOrSpendForWeek(
  supabase: ReturnType<typeof serviceClient>,
  start: string,
  end: string,
): Promise<{ total: number; rows: { key_name: string; project_name: string; total: number }[] }> {
  try {
    const { data, error } = await supabase
      .from("api_invocation_logs")
      .select("key_name, project_name, cost_usd")
      .gte("invoked_at", `${start}T00:00:00.000Z`)
      .lte("invoked_at", `${end}T23:59:59.999Z`)
      .neq("source", "live_today");
    if (error || !data) return { total: 0, rows: [] };

    const byKey = new Map<string, { project_name: string; total: number }>();
    let total = 0;
    for (const r of data) {
      const cost = r.cost_usd ?? 0;
      total += cost;
      const existing = byKey.get(r.key_name ?? "");
      if (existing) {
        existing.total += cost;
      } else {
        byKey.set(r.key_name ?? "", { project_name: r.project_name ?? r.key_name ?? "", total: cost });
      }
    }
    return {
      total,
      rows: [...byKey.entries()].map(([key_name, v]) => ({
        key_name,
        project_name: v.project_name,
        total: v.total,
      })),
    };
  } catch {
    return { total: 0, rows: [] };
  }
}

async function getActiveAlerts(
  supabase: ReturnType<typeof serviceClient>,
): Promise<WeeklyReportAlertRow[]> {
  try {
    const { data, error } = await supabase
      .from("spend_alerts")
      .select("project_name, openrouter_key_name, limit_usd, current_spend, current_pct, status")
      .eq("is_active", true)
      .in("status", ["warning", "breached"]);
    if (error || !data) return [];
    return data.map((r) => ({
      projectName:  r.project_name,
      keyName:      r.openrouter_key_name,
      limitUsd:     r.limit_usd,
      currentSpend: r.current_spend,
      currentPct:   r.current_pct,
      status:       r.status as "warning" | "breached",
    }));
  } catch {
    return [];
  }
}

export async function getWeeklyReportData(): Promise<WeeklyReportData> {
  const supabase      = serviceClient();
  const thisWeek      = getWeekBounds(0);
  const lastWeek      = getWeekBounds(1);
  const weekBeforeLast = getWeekBounds(2); // baseline for last-week delta (Fix 4)

  console.log("[weekly-report-data] week:", thisWeek.start, "to", thisWeek.end);

  const [
    thisWeekSpend,
    lastWeekSpend,
    alerts,
    arthurThisWeekSnap,
    arthurLastWeekSnap,
    enrichThisWeekSnap,
    enrichLastWeekSnap,
    enrichWeekBeforeLastSnap,
    enrichDailyThisWeek,
  ] = await Promise.all([
    getOrSpendForWeek(supabase, thisWeek.start, thisWeek.end),
    getOrSpendForWeek(supabase, lastWeek.start, lastWeek.end),
    getActiveAlerts(supabase),
    getSnapshotLatest(supabase, "arthur",     thisWeek.start,       thisWeek.end,      ARTHUR_SNAPSHOT_KEYS),
    getSnapshotLatest(supabase, "arthur",     lastWeek.start,       lastWeek.end,      ARTHUR_SNAPSHOT_KEYS),
    getSnapshotLatest(supabase, "enrichment", thisWeek.start,       thisWeek.end,      ENRICH_SNAPSHOT_KEYS),
    getSnapshotLatest(supabase, "enrichment", lastWeek.start,       lastWeek.end,      ENRICH_SNAPSHOT_KEYS),
    getSnapshotLatest(supabase, "enrichment", weekBeforeLast.start, weekBeforeLast.end, ENRICH_SNAPSHOT_KEYS),
    getDailySum(supabase,       "enrichment", thisWeek.start,       thisWeek.end,      ENRICH_DAILY_KEYS),
  ]);

  // Arthur weekly deltas (snapshot: latest this week - latest last week)
  const arthurDemosBooked = getSnapshotDelta(arthurThisWeekSnap, arthurLastWeekSnap, "demos_booked_mtd");
  const arthurDemosHeld   = getSnapshotDelta(arthurThisWeekSnap, arthurLastWeekSnap, "demos_held_mtd");
  const arthurClosedWon   = getSnapshotDelta(arthurThisWeekSnap, arthurLastWeekSnap, "closed_won_mtd");
  const arthurArrClosed   = getSnapshotDelta(arthurThisWeekSnap, arthurLastWeekSnap, "arr_closed_mtd");

  // Enrichment contact weekly deltas
  const enrichContactDemosBooked = getSnapshotDelta(enrichThisWeekSnap, enrichLastWeekSnap, "demos_booked_mtd");
  const enrichContactDemosHeld   = getSnapshotDelta(enrichThisWeekSnap, enrichLastWeekSnap, "demos_held_mtd");
  const enrichContactClosedWon   = getSnapshotDelta(enrichThisWeekSnap, enrichLastWeekSnap, "closed_won_mtd");
  const enrichContactArrClosed   = getSnapshotDelta(enrichThisWeekSnap, enrichLastWeekSnap, "arr_closed_mtd");

  // Enrichment team weekly deltas
  const enrichTeamDemosBooked = getSnapshotDelta(enrichThisWeekSnap, enrichLastWeekSnap, "team_demos_booked_mtd");
  const enrichTeamDemosHeld   = getSnapshotDelta(enrichThisWeekSnap, enrichLastWeekSnap, "team_demos_held_mtd");
  const enrichTeamClosedWon   = getSnapshotDelta(enrichThisWeekSnap, enrichLastWeekSnap, "team_closed_won_mtd");
  const enrichTeamArrClosed   = getSnapshotDelta(enrichThisWeekSnap, enrichLastWeekSnap, "team_arr_closed_mtd");

  // Daily counts — SUM within week (already correct, no delta needed)
  const enrichContactPushed = enrichDailyThisWeek.agents_pushed_hubspot ?? 0;
  const enrichTeamPushed    = enrichDailyThisWeek.teams_pushed_hubspot  ?? 0;

  // Last-week deltas (using weekBeforeLast as baseline) — for correct comparison (Fix 4)
  const arthurLastWeekDemosBooked = getSnapshotDelta(arthurLastWeekSnap, {}, "demos_booked_mtd");
  const enrichLastWeekContactPushed = 0; // daily sum not fetched for last week — omitted from log
  const enrichLastWeekDemosBooked = getSnapshotDelta(enrichLastWeekSnap, enrichWeekBeforeLastSnap, "demos_booked_mtd");
  const enrichLastWeekTeamDemosBooked = getSnapshotDelta(enrichLastWeekSnap, enrichWeekBeforeLastSnap, "team_demos_booked_mtd");

  console.log("[weekly-report-data] arthur this week:", JSON.stringify({ arthurDemosBooked, arthurDemosHeld, arthurClosedWon, arthurArrClosed }));
  console.log("[weekly-report-data] arthur last week (delta):", JSON.stringify({ demos_booked: arthurLastWeekDemosBooked }));
  console.log("[weekly-report-data] enrichment contacts this week:", JSON.stringify({ pushed: enrichContactPushed, demosBooked: enrichContactDemosBooked, demosHeld: enrichContactDemosHeld, closedWon: enrichContactClosedWon, arrClosed: enrichContactArrClosed }));
  console.log("[weekly-report-data] enrichment teams this week:", JSON.stringify({ pushed: enrichTeamPushed, demosBooked: enrichTeamDemosBooked, demosHeld: enrichTeamDemosHeld, closedWon: enrichTeamClosedWon, arrClosed: enrichTeamArrClosed }));
  console.log("[weekly-report-data] last week enrichment deltas (for comparison):", JSON.stringify({ contactDemosBooked: enrichLastWeekDemosBooked, teamDemosBooked: enrichLastWeekTeamDemosBooked, contactPushed: enrichLastWeekContactPushed }));
  console.log("[weekly-report-data] total ARR this week:", arthurArrClosed + enrichContactArrClosed + enrichTeamArrClosed);
  console.log("[weekly-report-data] total spend this week:", thisWeekSpend.total);

  // Build spend rows — merge this week and last week by key_name
  const allKeys = new Set([
    ...thisWeekSpend.rows.map((r) => r.key_name),
    ...lastWeekSpend.rows.map((r) => r.key_name),
  ]);
  const spendRows: WeeklyReportSpendRow[] = [...allKeys].map((key_name) => {
    const tw = thisWeekSpend.rows.find((r) => r.key_name === key_name);
    const lw = lastWeekSpend.rows.find((r) => r.key_name === key_name);
    return {
      keyName:     key_name,
      projectName: tw?.project_name ?? lw?.project_name ?? key_name,
      thisWeek:    tw?.total ?? 0,
      lastWeek:    lw?.total ?? 0,
    };
  }).sort((a, b) => b.thisWeek - a.thisWeek);

  return {
    weekLabel:          weekLabel(thisWeek.start, thisWeek.end),
    weekStart:          thisWeek.start,
    weekEnd:            thisWeek.end,
    totalSpendThisWeek: thisWeekSpend.total,
    totalSpendLastWeek: lastWeekSpend.total,
    spendRows,
    activeAlerts:       alerts,

    arthurDemosBooked,
    arthurDemosHeld,
    arthurClosedWon,
    arthurArrClosed,

    enrichContactPushed,
    enrichContactDemosBooked,
    enrichContactDemosHeld,
    enrichContactClosedWon,
    enrichContactArrClosed,

    enrichTeamPushed,
    enrichTeamDemosBooked,
    enrichTeamDemosHeld,
    enrichTeamClosedWon,
    enrichTeamArrClosed,

    generatedAt: new Date().toISOString(),
  };
}
