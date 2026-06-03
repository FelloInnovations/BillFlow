import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getHiddenToolKeys, hiddenOrKeyNames } from "@/lib/hidden-tools";

export const dynamic = "force-dynamic";

export async function GET() {
  const currentMonth = new Date().toISOString().substring(0, 7);

  const [{ data: snapshots }, { data: portfolio }, hiddenKeys] = await Promise.all([
    supabase
      .from("openrouter_usage_snapshots")
      .select("key_name, usage_today, usage_total, snapshot_at")
      .eq("month", currentMonth),
    supabase
      .from("agents_portfolio")
      .select("agents_projects, openrouter_api_key, status")
      .not("openrouter_api_key", "is", null),
    getHiddenToolKeys(),
  ]);

  const hiddenOrKeys = hiddenOrKeyNames(hiddenKeys);

  // Build key → project map (handle comma-separated keys)
  const keyToProject: Record<string, { project: string; status: string }> = {};
  for (const p of portfolio ?? []) {
    const keys = (p.openrouter_api_key ?? "").split(",").map((k: string) => k.trim()).filter(Boolean);
    for (const k of keys) {
      if (!keyToProject[k]) keyToProject[k] = { project: p.agents_projects, status: p.status ?? "" };
    }
  }

  const rows = (snapshots ?? [])
    .filter(s => !hiddenOrKeys.has(s.key_name) && keyToProject[s.key_name])
    .map(s => ({
      key_name:     s.key_name,
      project_name: keyToProject[s.key_name].project,
      status:       keyToProject[s.key_name].status,
      today:        Number(s.usage_today ?? 0),
      month:        Number(s.usage_total ?? 0),
      last_synced:  s.snapshot_at,
    }))
    .sort((a, b) => b.today - a.today);

  const todayTotal = rows.reduce((s, r) => s + r.today, 0);
  const monthTotal = rows.reduce((s, r) => s + r.month, 0);
  const lastSynced = rows.reduce<string | null>(
    (latest, r) => !latest || (r.last_synced && r.last_synced > latest) ? r.last_synced : latest,
    null
  );

  return NextResponse.json({
    today_total:   todayTotal,
    month_total:   monthTotal,
    last_synced:   lastSynced,
    current_month: currentMonth,
    projects:      rows,
  });
}
