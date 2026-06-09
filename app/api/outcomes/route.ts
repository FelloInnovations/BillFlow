export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { OutcomeMtdSummary, ProjectOutcomeSummary } from "@/types";

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

export async function GET() {
  const supabase = serviceClient();
  const now = new Date();
  const today = now.toISOString().substring(0, 10);
  const mtdStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;

  const { data: configRows, error: configErr } = await supabase
    .from("project_outcome_config")
    .select("project_id")
    .eq("is_active", true);

  if (configErr) {
    return NextResponse.json({ error: configErr.message }, { status: 500 });
  }

  const projectIds = [
    ...new Set((configRows ?? []).map((r: { project_id: string }) => r.project_id)),
  ];

  if (projectIds.length === 0) {
    return NextResponse.json([] as ProjectOutcomeSummary[]);
  }

  const [{ data: mtdRows }, { data: syncRows }] = await Promise.all([
    supabase
      .from("project_outcome_metrics")
      .select("project_id, metric_key, date, value")
      .in("project_id", projectIds)
      .gte("date", mtdStart)
      .lte("date", today)
      .order("date"),
    supabase
      .from("project_outcome_metrics")
      .select("project_id, created_at")
      .in("project_id", projectIds)
      .order("created_at", { ascending: false }),
  ]);

  const mtdByProject: Record<string, OutcomeMtdSummary> = {};
  const lastSyncedByProject: Record<string, string> = {};

  for (const row of mtdRows ?? []) {
    if (!mtdByProject[row.project_id]) mtdByProject[row.project_id] = {};
    const bucket = mtdByProject[row.project_id];
    if (DAILY_KEYS.has(row.metric_key)) {
      bucket[row.metric_key] = (bucket[row.metric_key] ?? 0) + Number(row.value);
    } else {
      // rows ordered by date asc — last write wins, giving latest value
      bucket[row.metric_key] = Number(row.value);
    }
  }

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
      projectId: pid,
      projectName: data?.[0]?.agents_projects ?? null,
      projectStatus: data?.[0]?.status ?? null,
      mtd: mtdByProject[pid] ?? {},
      lastSynced: lastSyncedByProject[pid] ?? null,
    });
  }

  return NextResponse.json(results);
}
