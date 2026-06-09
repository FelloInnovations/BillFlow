export const dynamic = "force-dynamic";

import { createClient } from "@supabase/supabase-js";
import { OutcomesClient } from "@/components/outcomes/OutcomesClient";
import { OutcomeMetricConfig, OutcomeMtdSummary } from "@/types";

const DAILY_KEYS = new Set([
  "llm_traffic_daily",
  "llm_chatgpt_daily",
  "llm_perplexity_daily",
  "llm_claude_daily",
  "llm_other_daily",
]);

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function getInitialData() {
  const supabase = serviceClient();
  const now = new Date();
  const mtdStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const today    = now.toISOString().substring(0, 10);
  const from30   = new Date(now.getTime() - 30 * 86_400_000).toISOString().substring(0, 10);

  const [configRes, seriesRes, mtdRowsRes, lastSyncRes] = await Promise.all([
    supabase
      .from("project_outcome_config")
      .select("*")
      .eq("project_id", "arthur")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("project_outcome_metrics")
      .select("metric_key, date, value")
      .eq("project_id", "arthur")
      .gte("date", from30)
      .lte("date", today)
      .order("date"),
    supabase
      .from("project_outcome_metrics")
      .select("metric_key, date, value")
      .eq("project_id", "arthur")
      .gte("date", mtdStart)
      .lte("date", today)
      .order("date"),
    supabase
      .from("project_outcome_metrics")
      .select("created_at")
      .eq("project_id", "arthur")
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const mtd: OutcomeMtdSummary = {};
  if (mtdRowsRes.data) {
    const byKey: Record<string, { date: string; value: number }[]> = {};
    for (const row of mtdRowsRes.data) {
      if (!byKey[row.metric_key]) byKey[row.metric_key] = [];
      byKey[row.metric_key].push({ date: row.date, value: Number(row.value) });
    }
    for (const [key, rows] of Object.entries(byKey)) {
      if (DAILY_KEYS.has(key)) {
        mtd[key] = rows.reduce((s, r) => s + r.value, 0);
      } else {
        const sorted = [...rows].sort((a, b) => b.date.localeCompare(a.date));
        mtd[key] = sorted[0]?.value ?? 0;
      }
    }
  }

  return {
    config:      (configRes.data ?? []) as OutcomeMetricConfig[],
    series:      seriesRes.data ?? [],
    mtd,
    lastSynced:  lastSyncRes.data?.[0]?.created_at ?? null,
  };
}

export default async function ArthurOutcomesPage() {
  let data;
  try {
    data = await getInitialData();
  } catch {
    data = { config: [], series: [], mtd: {}, lastSynced: null };
  }

  return (
    <OutcomesClient
      projectId="arthur"
      initialConfig={data.config}
      initialMtd={data.mtd}
      initialSeries={data.series}
      initialLastSynced={data.lastSynced}
    />
  );
}
