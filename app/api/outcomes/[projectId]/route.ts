import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { MonthlyOutcomeBreakdown, MonthlyOutcomeMetrics, OutcomeMetricConfig, OutcomeMetricRow, OutcomeMtdSummary } from "@/types";

const DAILY_KEYS = new Set([
  "llm_traffic_daily",
  "llm_chatgpt_daily",
  "llm_perplexity_daily",
  "llm_claude_daily",
  "llm_other_daily",
]);

function buildMonthlyBreakdown(
  allRows: { metric_key: string; date: string; value: number }[],
  currentMonth: string,
): MonthlyOutcomeBreakdown[] {
  const byMonth: Record<string, Record<string, { date: string; value: number }[]>> = {};
  for (const row of allRows) {
    const month = row.date.substring(0, 7);
    if (!byMonth[month]) byMonth[month] = {};
    if (!byMonth[month][row.metric_key]) byMonth[month][row.metric_key] = [];
    byMonth[month][row.metric_key].push({ date: row.date, value: Number(row.value) });
  }
  if (!byMonth[currentMonth]) byMonth[currentMonth] = {};

  return Object.entries(byMonth)
    .map(([month, keys]) => {
      const metrics: MonthlyOutcomeMetrics = {
        llm_traffic_daily: 0, llm_chatgpt_daily: 0, llm_perplexity_daily: 0,
        llm_claude_daily: 0, llm_other_daily: 0, demos_booked_mtd: 0,
        demos_held_mtd: 0, closed_won_mtd: 0, arr_closed_mtd: 0,
      };
      for (const [key, rows] of Object.entries(keys)) {
        if (!(key in metrics)) continue;
        const m = metrics as unknown as Record<string, number>;
        if (DAILY_KEYS.has(key)) {
          m[key] = rows.reduce((s, r) => s + r.value, 0);
        } else {
          m[key] = [...rows].sort((a, b) => b.date.localeCompare(a.date))[0]?.value ?? 0;
        }
      }
      const [y, mo] = month.split("-").map(Number);
      const monthLabel = new Date(Date.UTC(y, mo - 1, 1))
        .toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
      return { month, monthLabel, metrics };
    })
    .sort((a, b) => b.month.localeCompare(a.month));
}

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const supabase = serviceClient();

  const url = req.nextUrl;
  const now = new Date();
  const defaultTo   = now.toISOString().substring(0, 10);
  const defaultFrom = new Date(now.getTime() - 30 * 86_400_000).toISOString().substring(0, 10);
  const from = url.searchParams.get("from") ?? defaultFrom;
  const to   = url.searchParams.get("to")   ?? defaultTo;

  const [configRes, seriesRes, lastSyncRes, allRowsRes] = await Promise.all([
    supabase
      .from("project_outcome_config")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("project_outcome_metrics")
      .select("metric_key, date, value")
      .eq("project_id", projectId)
      .gte("date", from)
      .lte("date", to)
      .order("date"),
    supabase
      .from("project_outcome_metrics")
      .select("created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("project_outcome_metrics")
      .select("metric_key, date, value")
      .eq("project_id", projectId)
      .order("date"),
  ]);

  if (configRes.error) {
    return NextResponse.json({ error: configRes.error.message }, { status: 500 });
  }

  // MTD: always from start of current month to today regardless of range param
  const mtdStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const { data: mtdRows } = await supabase
    .from("project_outcome_metrics")
    .select("metric_key, date, value")
    .eq("project_id", projectId)
    .gte("date", mtdStart)
    .lte("date", defaultTo)
    .order("date");

  // Build MTD summary: sum daily keys, latest value for cumulative keys
  const mtd: OutcomeMtdSummary = {};
  if (mtdRows) {
    const byKey: Record<string, { date: string; value: number }[]> = {};
    for (const row of mtdRows) {
      if (!byKey[row.metric_key]) byKey[row.metric_key] = [];
      byKey[row.metric_key].push({ date: row.date, value: Number(row.value) });
    }
    for (const [key, rows] of Object.entries(byKey)) {
      if (DAILY_KEYS.has(key)) {
        mtd[key] = rows.reduce((s, r) => s + r.value, 0);
      } else {
        // latest value
        const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
        mtd[key] = sorted[0]?.value ?? 0;
      }
    }
  }

  const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const monthlyBreakdown = buildMonthlyBreakdown(allRowsRes.data ?? [], currentMonth);

  return NextResponse.json({
    config:           (configRes.data ?? []) as OutcomeMetricConfig[],
    series:           (seriesRes.data ?? []) as Pick<OutcomeMetricRow, "metric_key" | "date" | "value">[],
    mtd,
    lastSynced:       lastSyncRes.data?.[0]?.created_at ?? null,
    monthlyBreakdown,
  });
}
