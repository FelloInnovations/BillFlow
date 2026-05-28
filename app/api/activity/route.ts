import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const [projectsRes, snapshotsRes, modelRowsRes] = await Promise.all([
    supabase
      .from("agents_portfolio")
      .select("agents_projects, openrouter_api_key, status")
      .not("openrouter_api_key", "is", null)
      .neq("openrouter_api_key", ""),
    supabase
      .from("openrouter_usage_snapshots")
      .select("key_name, month, usage_total")
      .order("month", { ascending: true }),
    supabase
      .from("api_invocation_logs")
      .select("key_name, model")
      .not("model", "is", null),
  ]);

  const projects  = projectsRes.data  ?? [];
  const snapshots = snapshotsRes.data ?? [];

  // Per-key model usage from logs
  const modelsByKey: Record<string, string[]> = {};
  for (const row of modelRowsRes.data ?? []) {
    const k = (row.key_name as string).toLowerCase();
    if (!modelsByKey[k]) modelsByKey[k] = [];
    const m = row.model as string;
    if (!modelsByKey[k].includes(m)) modelsByKey[k].push(m);
  }

  // Fetch live cumulative usage from OR provisioning key
  const provKey = process.env.OPENROUTER_PROVISIONING_KEY;
  let liveKeys: Array<{ name?: string; hash?: string; usage?: number }> = [];
  if (provKey) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/keys", {
        headers: { Authorization: `Bearer ${provKey}` },
        cache: "no-store",
      });
      if (res.ok) liveKeys = (await res.json()).data ?? [];
    } catch {}
  }

  // Build lookup maps
  const keyToProject: Record<string, { name: string; status: string | null }> = {};
  for (const p of projects) {
    if (p.openrouter_api_key) {
      keyToProject[p.openrouter_api_key.toLowerCase()] = {
        name: p.agents_projects,
        status: p.status,
      };
    }
  }

  const snapshotsByKey: Record<string, { month: string; usage_total: number }[]> = {};
  for (const snap of snapshots) {
    const k = snap.key_name.toLowerCase();
    if (!snapshotsByKey[k]) snapshotsByKey[k] = [];
    snapshotsByKey[k].push({ month: snap.month, usage_total: Number(snap.usage_total) });
  }

  const currentMonth = new Date().toISOString().substring(0, 7);
  const allMonthsSet = new Set<string>();

  const allKeyNamesLower = new Set([
    ...Object.keys(keyToProject),
    ...Object.keys(snapshotsByKey),
  ]);

  const keys = [...allKeyNamesLower].map((keyLower) => {
    const projectInfo = keyToProject[keyLower];
    const rawKeyName  = projects.find(p => p.openrouter_api_key?.toLowerCase() === keyLower)
      ?.openrouter_api_key ?? keyLower;
    const liveEntry  = liveKeys.find(k => k.name?.toLowerCase() === keyLower);
    const liveTotal  = liveEntry?.usage ?? 0;

    const keySnaps = (snapshotsByKey[keyLower] ?? [])
      .sort((a, b) => a.month.localeCompare(b.month));
    const monthly: { month: string; spend: number }[] = [];

    for (let i = 0; i < keySnaps.length; i++) {
      const prev  = i > 0 ? keySnaps[i - 1].usage_total : 0;
      const spend = Math.max(0, keySnaps[i].usage_total - prev);
      monthly.push({ month: keySnaps[i].month, spend });
      allMonthsSet.add(keySnaps[i].month);
    }

    const lastSnap = keySnaps[keySnaps.length - 1];
    if (!lastSnap || lastSnap.month !== currentMonth) {
      const prevTotal      = lastSnap?.usage_total ?? 0;
      const currentSpend   = Math.max(0, liveTotal - prevTotal);
      monthly.push({ month: currentMonth, spend: currentSpend });
      allMonthsSet.add(currentMonth);
    }

    const spends          = monthly.map(m => m.spend);
    const total           = spends.reduce((a, b) => a + b, 0);
    const completedSpends = monthly.filter(m => m.month < currentMonth).map(m => m.spend);

    return {
      key_name:            rawKeyName,
      project_name:        projectInfo?.name ?? rawKeyName,
      project_status:      projectInfo?.status ?? null,
      monthly,
      total,
      min: completedSpends.length ? Math.min(...completedSpends) : 0,
      max: completedSpends.length ? Math.max(...completedSpends) : 0,
      avg: completedSpends.length
        ? completedSpends.reduce((a, b) => a + b, 0) / completedSpends.length : 0,
      current_month_spend: monthly.find(m => m.month === currentMonth)?.spend ?? 0,
      models: modelsByKey[keyLower] ?? [],
    };
  });

  const months = [...allMonthsSet].sort();

  const all_projects = projects.map(p => ({
    project_name: p.agents_projects,
    key_name:     p.openrouter_api_key,
    status:       p.status,
  }));

  return NextResponse.json({ keys, months, all_projects });
}
