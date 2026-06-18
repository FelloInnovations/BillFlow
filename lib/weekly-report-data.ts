import { createClient } from "@supabase/supabase-js";
import type { WeeklyReportData, WeeklyReportSpendRow, WeeklyReportAlertRow } from "@/types";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Week = Monday 00:00 UTC through Friday 23:59 UTC (not Sun — email sends on Friday)
export function getWeekBounds(offsetWeeks = 0): { from: Date; to: Date } {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat
  const daysFromMonday = (day + 6) % 7; // Mon=0, Tue=1, … Sun=6
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - daysFromMonday - offsetWeeks * 7);
  monday.setUTCHours(0, 0, 0, 0);
  const friday = new Date(monday);
  friday.setUTCDate(monday.getUTCDate() + 4);
  friday.setUTCHours(23, 59, 59, 999);
  return { from: monday, to: friday };
}

function toDateStr(d: Date): string {
  return d.toISOString().substring(0, 10);
}

function buildWeekLabel(from: Date, to: Date): string {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const startStr = `${months[from.getUTCMonth()]} ${from.getUTCDate()}`;
  const endStr   = `${months[to.getUTCMonth()]} ${to.getUTCDate()}, ${to.getUTCFullYear()}`;
  return `${startStr} – ${endStr}`;
}

// Snapshot metrics store cumulative MTD totals each day.
// Weekly value = latest snapshot in this week – latest snapshot BEFORE this week.
const ARTHUR_SNAPSHOT_KEYS = [
  "demos_booked_mtd", "demos_held_mtd", "closed_won_mtd", "arr_closed_mtd",
] as const;
const ENRICH_SNAPSHOT_KEYS = [
  "demos_booked_mtd", "demos_held_mtd", "closed_won_mtd", "arr_closed_mtd",
  "team_demos_booked_mtd", "team_demos_held_mtd", "team_closed_won_mtd", "team_arr_closed_mtd",
] as const;
// Daily count metrics — SUM within the week window (not deltas)
const ENRICH_DAILY_KEYS = ["agents_pushed_hubspot", "teams_pushed_hubspot"] as const;

// Latest value per metric_key within [from, to] (inclusive).
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
    const result: Record<string, number> = {};
    for (const r of data) {
      if (!(r.metric_key in result)) result[r.metric_key] = r.value;
    }
    return result;
  } catch {
    return {};
  }
}

// Latest value per metric_key strictly BEFORE beforeDate (90-day lookback).
// This is the pre-week baseline for delta computation.
async function getSnapshotBaseline(
  supabase: ReturnType<typeof serviceClient>,
  projectId: string,
  beforeDate: string,
  metricKeys: readonly string[],
): Promise<Record<string, number>> {
  try {
    const lookback = new Date(beforeDate);
    lookback.setUTCDate(lookback.getUTCDate() - 90);
    const { data, error } = await supabase
      .from("project_outcome_metrics")
      .select("metric_key, value, date")
      .eq("project_id", projectId)
      .in("metric_key", [...metricKeys])
      .lt("date", beforeDate)
      .gte("date", toDateStr(lookback))
      .order("date", { ascending: false });
    if (error || !data) return {};
    const result: Record<string, number> = {};
    for (const r of data) {
      if (!(r.metric_key in result)) result[r.metric_key] = r.value;
    }
    return result;
  } catch {
    return {};
  }
}

// Weekly delta = latest this week – latest before this week (floor 0).
function snapshotDelta(
  thisWeek: Record<string, number>,
  baseline: Record<string, number>,
  key: string,
): number {
  return Math.max(0, (thisWeek[key] ?? 0) - (baseline[key] ?? 0));
}

// SUM of daily-count rows within [from, to].
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
    for (const r of data) result[r.metric_key] = (result[r.metric_key] ?? 0) + r.value;
    return result;
  } catch {
    return {};
  }
}

async function getOrSpendForWeek(
  supabase: ReturnType<typeof serviceClient>,
  from: string,
  to: string,
): Promise<{ total: number; rows: { key_name: string; project_name: string; total: number }[] }> {
  try {
    const { data, error } = await supabase
      .from("api_invocation_logs")
      .select("key_name, project_name, cost_usd")
      .gte("invoked_at", `${from}T00:00:00.000Z`)
      .lte("invoked_at", `${to}T23:59:59.999Z`)
      .neq("source", "live_today");
    if (error || !data) return { total: 0, rows: [] };
    const byKey = new Map<string, { project_name: string; total: number }>();
    let total = 0;
    for (const r of data) {
      const cost = r.cost_usd ?? 0;
      total += cost;
      const existing = byKey.get(r.key_name ?? "");
      if (existing) existing.total += cost;
      else byKey.set(r.key_name ?? "", { project_name: r.project_name ?? r.key_name ?? "", total: cost });
    }
    return {
      total,
      rows: [...byKey.entries()].map(([key_name, v]) => ({ key_name, project_name: v.project_name, total: v.total })),
    };
  } catch {
    return { total: 0, rows: [] };
  }
}

async function getInvoiceTotal(
  supabase: ReturnType<typeof serviceClient>,
  from: string,
  to: string,
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("financial_records")
      .select("total_amount")
      .gte("invoice_date", from)
      .lte("invoice_date", to)
      .not("vendor_name", "ilike", "%makemytrip%");
    if (error || !data) return 0;
    return data.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
  } catch {
    return 0;
  }
}

// Returns map from openrouter_key_name → { limitUsd, warningPct, currentSpend }
// for ALL active alerts (any status) — used for per-key budget status in spend rows.
async function getAlertByKey(
  supabase: ReturnType<typeof serviceClient>,
): Promise<Map<string, { limitUsd: number; warningPct: number; mtdSpend: number }>> {
  const map = new Map<string, { limitUsd: number; warningPct: number; mtdSpend: number }>();
  try {
    const { data, error } = await supabase
      .from("spend_alerts")
      .select("openrouter_key_name, limit_usd, warning_pct, current_spend")
      .eq("is_active", true);
    if (error || !data) return map;
    for (const r of data) {
      map.set(r.openrouter_key_name, {
        limitUsd:  r.limit_usd     ?? 0,
        warningPct: r.warning_pct  ?? 80,
        mtdSpend:  r.current_spend ?? 0,
      });
    }
  } catch { /* fall through */ }
  return map;
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
  const supabase   = serviceClient();
  const thisWeek   = getWeekBounds(0);
  const lastWeek   = getWeekBounds(1);
  const thisFrom   = toDateStr(thisWeek.from);
  const thisTo     = toDateStr(thisWeek.to);
  const lastFrom   = toDateStr(lastWeek.from);
  const lastTo     = toDateStr(lastWeek.to);

  console.log("[weekly-report-data] week:", thisFrom, "to", thisTo);

  const [
    thisWeekSpend,
    lastWeekSpend,
    alerts,
    alertByKey,
    thisWeekInvoiceTotal,
    lastWeekInvoiceTotal,
    // Arthur: latest in window + baseline before window
    arthurThisSnap,
    arthurBaseline,
    // Enrichment: latest in window + baseline before window
    enrichThisSnap,
    enrichBaseline,
    // Daily counts
    enrichDailyThisWeek,
  ] = await Promise.all([
    getOrSpendForWeek(supabase, thisFrom, thisTo),
    getOrSpendForWeek(supabase, lastFrom, lastTo),
    getActiveAlerts(supabase),
    getAlertByKey(supabase),
    getInvoiceTotal(supabase, thisFrom, thisTo),
    getInvoiceTotal(supabase, lastFrom, lastTo),
    getSnapshotLatest(supabase, "arthur",     thisFrom, thisTo, ARTHUR_SNAPSHOT_KEYS),
    getSnapshotBaseline(supabase, "arthur",     thisFrom,        ARTHUR_SNAPSHOT_KEYS),
    getSnapshotLatest(supabase, "enrichment", thisFrom, thisTo, ENRICH_SNAPSHOT_KEYS),
    getSnapshotBaseline(supabase, "enrichment", thisFrom,        ENRICH_SNAPSHOT_KEYS),
    getDailySum(supabase,       "enrichment", thisFrom, thisTo, ENRICH_DAILY_KEYS),
  ]);

  // Arthur weekly deltas
  const arthurDemosBooked = snapshotDelta(arthurThisSnap, arthurBaseline, "demos_booked_mtd");
  const arthurDemosHeld   = snapshotDelta(arthurThisSnap, arthurBaseline, "demos_held_mtd");
  const arthurClosedWon   = snapshotDelta(arthurThisSnap, arthurBaseline, "closed_won_mtd");
  const arthurArrClosed   = snapshotDelta(arthurThisSnap, arthurBaseline, "arr_closed_mtd");

  // Enrichment contact weekly deltas
  const enrichContactDemosBooked = snapshotDelta(enrichThisSnap, enrichBaseline, "demos_booked_mtd");
  const enrichContactDemosHeld   = snapshotDelta(enrichThisSnap, enrichBaseline, "demos_held_mtd");
  const enrichContactClosedWon   = snapshotDelta(enrichThisSnap, enrichBaseline, "closed_won_mtd");
  const enrichContactArrClosed   = snapshotDelta(enrichThisSnap, enrichBaseline, "arr_closed_mtd");

  // Enrichment team weekly deltas
  const enrichTeamDemosBooked = snapshotDelta(enrichThisSnap, enrichBaseline, "team_demos_booked_mtd");
  const enrichTeamDemosHeld   = snapshotDelta(enrichThisSnap, enrichBaseline, "team_demos_held_mtd");
  const enrichTeamClosedWon   = snapshotDelta(enrichThisSnap, enrichBaseline, "team_closed_won_mtd");
  const enrichTeamArrClosed   = snapshotDelta(enrichThisSnap, enrichBaseline, "team_arr_closed_mtd");

  // Daily counts
  const enrichContactPushed = enrichDailyThisWeek.agents_pushed_hubspot ?? 0;
  const enrichTeamPushed    = enrichDailyThisWeek.teams_pushed_hubspot  ?? 0;

  // Section visibility flags (Fix 3)
  const arthurHasData              = arthurDemosBooked > 0 || arthurDemosHeld > 0 || arthurClosedWon > 0 || arthurArrClosed > 0;
  const enrichmentContactsHasData  = enrichContactDemosBooked > 0 || enrichContactDemosHeld > 0 || enrichContactClosedWon > 0 || enrichContactArrClosed > 0 || enrichContactPushed > 0;
  const enrichmentTeamsHasData     = enrichTeamDemosBooked > 0 || enrichTeamDemosHeld > 0 || enrichTeamClosedWon > 0 || enrichTeamArrClosed > 0 || enrichTeamPushed > 0;

  console.log("[weekly-report-data] arthur this week:", JSON.stringify({ arthurDemosBooked, arthurDemosHeld, arthurClosedWon, arthurArrClosed, arthurHasData }));
  console.log("[weekly-report-data] enrichment contacts this week:", JSON.stringify({ enrichContactPushed, enrichContactDemosBooked, enrichContactDemosHeld, enrichContactClosedWon, enrichContactArrClosed, enrichmentContactsHasData }));
  console.log("[weekly-report-data] enrichment teams this week:", JSON.stringify({ enrichTeamPushed, enrichTeamDemosBooked, enrichTeamDemosHeld, enrichTeamClosedWon, enrichTeamArrClosed, enrichmentTeamsHasData }));
  console.log("[weekly-report-data] total ARR this week:", arthurArrClosed + enrichContactArrClosed + enrichTeamArrClosed);
  console.log("[weekly-report-data] total OR spend this week:", thisWeekSpend.total, "invoices:", thisWeekInvoiceTotal);

  // Build spend rows — merge this week and last week by key_name; attach budget info
  const allKeys = new Set([
    ...thisWeekSpend.rows.map((r) => r.key_name),
    ...lastWeekSpend.rows.map((r) => r.key_name),
  ]);
  const spendRows: WeeklyReportSpendRow[] = [...allKeys].map((key_name) => {
    const tw    = thisWeekSpend.rows.find((r) => r.key_name === key_name);
    const lw    = lastWeekSpend.rows.find((r) => r.key_name === key_name);
    const alert = alertByKey.get(key_name);
    return {
      keyName:      key_name,
      projectName:  tw?.project_name ?? lw?.project_name ?? key_name,
      thisWeek:     tw?.total ?? 0,
      lastWeek:     lw?.total ?? 0,
      mtdSpend:     alert?.mtdSpend    ?? 0,
      monthlyLimit: alert?.limitUsd    ?? 0,
      warningPct:   alert?.warningPct  ?? 80,
    };
  }).sort((a, b) => b.thisWeek - a.thisWeek);

  return {
    weekLabel:   buildWeekLabel(thisWeek.from, thisWeek.to),
    weekStart:   thisFrom,
    weekEnd:     thisTo,
    totalSpendThisWeek: thisWeekSpend.total + thisWeekInvoiceTotal,
    totalSpendLastWeek: lastWeekSpend.total + lastWeekInvoiceTotal,
    spendRows,
    activeAlerts: alerts,
    thisWeekInvoiceTotal,
    lastWeekInvoiceTotal,
    arthurHasData,
    enrichmentContactsHasData,
    enrichmentTeamsHasData,

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
