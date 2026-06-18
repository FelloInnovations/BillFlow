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

function fmt(d: string): string {
  const [y, m, day] = d.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[parseInt(m) - 1]} ${parseInt(day)}, ${y}`;
}

function weekLabel(start: string, end: string): string {
  const [ys, ms, ds] = start.split("-");
  const [ye, me, de] = end.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const startStr = `${months[parseInt(ms) - 1]} ${parseInt(ds)}`;
  const endStr   = `${months[parseInt(me) - 1]} ${parseInt(de)}, ${ye}`;
  return `${startStr} – ${endStr}`;
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

async function getOutcomeMtd(
  supabase: ReturnType<typeof serviceClient>,
  projectId: string,
): Promise<Record<string, number>> {
  try {
    const now  = new Date();
    const yyyy = now.getUTCFullYear();
    const mm   = String(now.getUTCMonth() + 1).padStart(2, "0");
    const from = `${yyyy}-${mm}-01`;
    const to   = `${yyyy}-${mm}-${String(now.getUTCDate()).padStart(2, "0")}`;

    const { data, error } = await supabase
      .from("project_outcome_metrics")
      .select("metric_key, value")
      .eq("project_id", projectId)
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

export async function getWeeklyReportData(): Promise<WeeklyReportData> {
  const supabase  = serviceClient();
  const thisWeek  = getWeekBounds(0);
  const lastWeek  = getWeekBounds(1);

  const [thisWeekSpend, lastWeekSpend, alerts, arthurMtd, enrichMtd] = await Promise.all([
    getOrSpendForWeek(supabase, thisWeek.start, thisWeek.end),
    getOrSpendForWeek(supabase, lastWeek.start, lastWeek.end),
    getActiveAlerts(supabase),
    getOutcomeMtd(supabase, "arthur"),
    getOutcomeMtd(supabase, "enrichment"),
  ]);

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
    weekLabel:   weekLabel(thisWeek.start, thisWeek.end),
    weekStart:   thisWeek.start,
    weekEnd:     thisWeek.end,
    totalSpendThisWeek: thisWeekSpend.total,
    totalSpendLastWeek: lastWeekSpend.total,
    spendRows,
    activeAlerts: alerts,

    arthurDemosBooked: arthurMtd.demos_booked_mtd     ?? 0,
    arthurDemosHeld:   arthurMtd.demos_held_mtd       ?? 0,
    arthurClosedWon:   arthurMtd.closed_won_mtd        ?? 0,
    arthurArrClosed:   arthurMtd.arr_closed_mtd        ?? 0,

    enrichContactPushed:      enrichMtd.agents_pushed_hubspot  ?? 0,
    enrichContactDemosBooked: enrichMtd.demos_booked_mtd       ?? 0,
    enrichContactDemosHeld:   enrichMtd.demos_held_mtd         ?? 0,
    enrichContactClosedWon:   enrichMtd.closed_won_mtd         ?? 0,
    enrichContactArrClosed:   enrichMtd.arr_closed_mtd         ?? 0,

    enrichTeamPushed:      enrichMtd.teams_pushed_hubspot    ?? 0,
    enrichTeamDemosBooked: enrichMtd.team_demos_booked_mtd   ?? 0,
    enrichTeamDemosHeld:   enrichMtd.team_demos_held_mtd     ?? 0,
    enrichTeamClosedWon:   enrichMtd.team_closed_won_mtd     ?? 0,
    enrichTeamArrClosed:   enrichMtd.team_arr_closed_mtd     ?? 0,

    generatedAt: new Date().toISOString(),
  };
}
