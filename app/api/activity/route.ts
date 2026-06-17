import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getHiddenToolKeys, hiddenOrKeyNames } from "@/lib/hidden-tools";

export async function GET() {
  const todayUtc     = new Date().toISOString().substring(0, 10);
  const currentMonth = new Date().toISOString().substring(0, 7);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString().substring(0, 10);

  const [projectsRes, snapshotsRes, modelRowsRes, lastSyncRes, latestLogRes, hiddenKeys, dailyLogsRes, todaySnapshotsRes] = await Promise.all([
    supabase
      .from("agents_portfolio")
      .select("agents_projects, openrouter_api_key, status")
      .not("openrouter_api_key", "is", null)
      .neq("openrouter_api_key", ""),
    supabase
      .from("openrouter_usage_snapshots")
      .select("key_name, month, usage_total, account_name")
      .order("month", { ascending: true }),
    supabase
      .from("api_invocation_logs")
      .select("key_name, model, account_name")
      .not("model", "is", null),
    supabase
      .from("openrouter_usage_snapshots")
      .select("snapshot_at")
      .order("snapshot_at", { ascending: false })
      .limit(1),
    supabase
      .from("api_invocation_logs")
      .select("invoked_at")
      .order("invoked_at", { ascending: false })
      .limit(1),
    getHiddenToolKeys(),
    // Daily totals for the by-day chart (last 30 days, excluding live_today rows)
    supabase
      .from("api_invocation_logs")
      .select("invoked_at, cost_usd")
      .neq("source", "live_today")
      .gte("invoked_at", `${thirtyDaysAgo}T00:00:00Z`)
      .order("invoked_at"),
    // Today's live spend per key from the latest snapshot's usage_today field
    supabase
      .from("openrouter_usage_snapshots")
      .select("key_name, usage_today")
      .eq("month", currentMonth),
  ]);

  const projects   = projectsRes.data  ?? [];
  const snapshots  = snapshotsRes.data ?? [];
  const lastSyncAt = lastSyncRes.data?.[0]?.snapshot_at ?? null;
  const latestDate = latestLogRes.data?.[0]?.invoked_at
    ? (latestLogRes.data[0].invoked_at as string).substring(0, 10)
    : null;

  // Per-key today spend from usage_today snapshot (updated hourly — canonical source)
  const todayLiveByKey: Record<string, number> = {};
  for (const row of todaySnapshotsRes.data ?? []) {
    todayLiveByKey[row.key_name as string] = Number(row.usage_today ?? 0);
  }
  const todayLiveTotal = Object.values(todayLiveByKey).reduce((s, v) => s + v, 0);

  // Build by-day chart array from log rows, then replace/add today with live snapshot
  const byDayMap = new Map<string, number>();
  for (const row of dailyLogsRes.data ?? []) {
    const date = (row.invoked_at as string).substring(0, 10);
    byDayMap.set(date, (byDayMap.get(date) ?? 0) + (Number(row.cost_usd) || 0));
  }
  const byDayData: { date: string; total: number; isLive?: boolean }[] = [
    ...byDayMap.entries(),
  ]
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const todayEntryIndex = byDayData.findIndex((d) => d.date === todayUtc);
  if (todayEntryIndex >= 0) {
    byDayData[todayEntryIndex] = { date: todayUtc, total: todayLiveTotal, isLive: true };
  } else if (todayLiveTotal > 0) {
    byDayData.push({ date: todayUtc, total: todayLiveTotal, isLive: true });
  }

  // Per-key distinct models from logs
  const modelsByKey: Record<string, Set<string>> = {};
  for (const row of modelRowsRes.data ?? []) {
    const k = row.key_name as string;
    if (!modelsByKey[k]) modelsByKey[k] = new Set();
    modelsByKey[k].add(row.model as string);
  }

  // key → all projects mapping — handle comma-separated keys in openrouter_api_key
  const keyToProjects: Record<string, { name: string; status: string | null }[]> = {};
  for (const p of projects) {
    if (!p.openrouter_api_key) continue;
    for (const raw of p.openrouter_api_key.split(",")) {
      const k = raw.trim();
      if (!k) continue;
      if (!keyToProjects[k]) keyToProjects[k] = [];
      keyToProjects[k].push({ name: p.agents_projects, status: p.status });
    }
  }

  // Authorized key set from portfolio (defense in depth — DB should already be clean after migration 15)
  const allowedKeyNames = new Set(Object.keys(keyToProjects));
  // Keys hidden via hidden_tools (stored as "OpenRouter:keyname")
  const hiddenOrKeys = hiddenOrKeyNames(hiddenKeys);

  // Group snapshots by exact key_name — skip keys not in portfolio allowlist or hidden
  const snapshotsByKey: Record<string, { month: string; usage_total: number }[]> = {};
  const accountNameByKey: Record<string, string | null> = {};
  for (const snap of snapshots) {
    const k = snap.key_name as string;
    if (!allowedKeyNames.has(k)) continue;
    if (hiddenOrKeys.has(k)) continue;
    if (!snapshotsByKey[k]) snapshotsByKey[k] = [];
    snapshotsByKey[k].push({ month: snap.month as string, usage_total: Number(snap.usage_total) });
    // Take first non-null account_name seen for this key
    if (accountNameByKey[k] == null && snap.account_name != null) {
      accountNameByKey[k] = snap.account_name as string;
    }
  }

  const allMonthsSet = new Set<string>();

  // Only keys that have snapshot data — keys with no activity don't appear
  const keys = Object.entries(snapshotsByKey).map(([keyName, rawSnaps]) => {
    // Case-insensitive portfolio lookup (OR keys are exact-case, portfolio may differ)
    const projectInfos =
      keyToProjects[keyName] ??
      keyToProjects[
        Object.keys(keyToProjects).find(
          (k) => k.toLowerCase() === keyName.toLowerCase()
        ) ?? ""
      ] ?? [];
    const projectInfo = projectInfos[0] ?? null;
    const projectNames = projectInfos.map((p) => p.name).filter(Boolean) as string[];

    const keySnaps = rawSnaps.sort((a, b) => a.month.localeCompare(b.month));

    // For totals and chart: include all months including current
    const monthly = keySnaps.map((s) => {
      allMonthsSet.add(s.month);
      return { month: s.month, spend: s.usage_total };
    });

    // For trend only: use completed months (current month is partial)
    const completedSorted = monthly
      .filter((m) => m.month < currentMonth)
      .sort((a, b) => b.month.localeCompare(a.month));

    let trend: "up" | "down" | "stable" | null = null;
    if (completedSorted.length >= 2) {
      const curr = completedSorted[0].spend;
      const prev = completedSorted[1].spend;
      if (prev > 0) {
        if (curr > prev * 1.1) trend = "up";
        else if (curr < prev * 0.9) trend = "down";
        else trend = "stable";
      }
    }

    // Avg — only over completed months that had actual spend
    const activeCompleted = completedSorted.filter((m) => m.spend > 0);
    const completedTotal  = completedSorted.reduce((s, m) => s + m.spend, 0);
    const avg = activeCompleted.length > 0 ? completedTotal / activeCompleted.length : 0;

    const total = monthly.reduce((s, m) => s + m.spend, 0);
    const completedSpends = completedSorted.map((m) => m.spend).filter((s) => s > 0);

    return {
      key_name:            keyName,
      account_name:        accountNameByKey[keyName] ?? null,
      project_name:        projectInfo?.name ?? keyName,
      project_names:       projectNames.length > 0 ? projectNames : [projectInfo?.name ?? keyName],
      project_status:      projectInfo?.status ?? null,
      monthly,
      total,
      min:   completedSpends.length ? Math.min(...completedSpends) : 0,
      max:   completedSpends.length ? Math.max(...completedSpends) : 0,
      avg,
      trend,
      // Snapshots cover through yesterday; add usage_today for today's partial spend
      current_month_spend: (monthly.find((m) => m.month === currentMonth)?.spend ?? 0) + (todayLiveByKey[keyName] ?? 0),
      today_spend: todayLiveByKey[keyName] ?? 0,
      models: [...(modelsByKey[keyName] ?? new Set<string>())],
    };
  });

  const months = [...allMonthsSet].sort();

  const all_projects = projects
    .filter((p) => {
      if (!p.openrouter_api_key) return true;
      // Exclude projects whose every OR key is hidden
      const keys = (p.openrouter_api_key as string).split(",").map((k: string) => k.trim()).filter(Boolean);
      return !keys.every((k) => hiddenOrKeys.has(k));
    })
    .map((p) => ({
      project_name: p.agents_projects as string,
      key_name:     p.openrouter_api_key as string | null,
      status:       p.status as string | null,
    }));

  return NextResponse.json({ keys, months, all_projects, last_synced_at: lastSyncAt, latest_date: latestDate, byDay: byDayData });
}
