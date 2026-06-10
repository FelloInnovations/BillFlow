/**
 * GET /api/projects/expense-audit
 * Protected by x-sync-secret header.
 *
 * Diagnostic: compares how the Activity page vs Projects page compute
 * OpenRouter spend. The two pages must use the same source of truth.
 *
 * Activity page (correct):  sums ALL monthly rows in openrouter_usage_snapshots per key
 * Projects page (buggy):    takes only the LATEST monthly row per key
 *
 * root_cause: usage_total is MONTHLY spend per row, NOT cumulative.
 *   Taking the latest row = most recent month only; missing all prior months.
 *   Fix: sum all rows per key, same as Activity page.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  return createClient(
    process.env.SUPABASE_URL ?? "",
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

const TARGET_PROJECTS = new Set([
  "Octo",
  "30DC God Mode",
  "30DC App",
  "Zillow Scraper",
  "30DC Roleplay",
  "MAD (v2)",
  "Team Size Webhook",
  "YoungTeam Octo",
  "AI Resume Analyser",
  "Data Pilot",
]);

interface ProjectDiagnostic {
  project_name: string;
  linked_api_keys: string[];
  // Activity page logic: sum ALL monthly snapshot rows
  activity_page_spend: number;
  // Projects page (current buggy) logic: latest monthly row only
  projects_page_spend: number;
  delta: number;
  monthly_breakdown: { key: string; months: { month: string; usage_total: number }[] }[];
  reason: string;
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-sync-secret");
  if (secret !== process.env.OUTCOMES_SYNC_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = serviceClient();

  const [{ data: portfolioRows }, { data: snapshots }] = await Promise.all([
    supabase
      .from("agents_portfolio")
      .select("agents_projects, openrouter_api_key, status")
      .not("agents_projects", "is", null),
    supabase
      .from("openrouter_usage_snapshots")
      .select("key_name, month, usage_total")
      .order("month", { ascending: true }),
  ]);

  // Build project → keys map (lowercase for consistent matching)
  const projectToKeys = new Map<string, string[]>();
  const seenProjects = new Set<string>();
  for (const row of portfolioRows ?? []) {
    const name = ((row.agents_projects as string) ?? "").trim();
    if (!name || seenProjects.has(name.toLowerCase())) continue;
    seenProjects.add(name.toLowerCase());
    if (!row.openrouter_api_key) continue;
    const keys = (row.openrouter_api_key as string)
      .split(",").map((k: string) => k.trim()).filter(Boolean);
    projectToKeys.set(name, keys);
  }

  // Build key → all monthly rows (exact case from snapshots)
  const snapshotsByKey = new Map<string, { month: string; usage_total: number }[]>();
  for (const snap of snapshots ?? []) {
    const k = snap.key_name as string;
    const rows = snapshotsByKey.get(k) ?? [];
    rows.push({ month: snap.month as string, usage_total: Number(snap.usage_total ?? 0) });
    snapshotsByKey.set(k, rows);
  }

  // Also index by lowercase for case-insensitive lookup
  const snapshotsByKeyLower = new Map<string, { month: string; usage_total: number }[]>();
  for (const [k, rows] of snapshotsByKey) {
    const lk = k.toLowerCase();
    const existing = snapshotsByKeyLower.get(lk) ?? [];
    snapshotsByKeyLower.set(lk, [...existing, ...rows]);
  }

  const results: ProjectDiagnostic[] = [];

  // Match against all portfolio projects, not just TARGET_PROJECTS
  // (so we can confirm which ones have the issue)
  for (const [projectName, rawKeys] of projectToKeys) {
    // Check if this is one of our target projects (case-insensitive)
    const isTarget = [...TARGET_PROJECTS].some(
      (t) => t.toLowerCase() === projectName.toLowerCase()
    );
    if (!isTarget) continue;

    let activitySpend = 0;
    let projectsPageSpend = 0;
    const monthlyBreakdown: { key: string; months: { month: string; usage_total: number }[] }[] = [];

    for (const rawKey of rawKeys) {
      const rows = snapshotsByKeyLower.get(rawKey.toLowerCase()) ?? [];
      if (rows.length === 0) {
        monthlyBreakdown.push({ key: rawKey, months: [] });
        continue;
      }

      const sorted = [...rows].sort((a, b) => a.month.localeCompare(b.month));
      monthlyBreakdown.push({ key: rawKey, months: sorted });

      // Activity page logic: sum all monthly rows
      const sumAll = sorted.reduce((s, r) => s + r.usage_total, 0);
      activitySpend += sumAll;

      // Projects page (buggy) logic: latest row only
      const latestRow = sorted[sorted.length - 1];
      projectsPageSpend += latestRow.usage_total;
    }

    const delta = Math.round((activitySpend - projectsPageSpend) * 100) / 100;

    let reason: string;
    if (rawKeys.length === 0) {
      reason = "no_api_key_linked — project has no openrouter_api_key in agents_portfolio";
    } else if (activitySpend === 0 && projectsPageSpend === 0) {
      reason = "zero_snapshots — key linked but no rows in openrouter_usage_snapshots";
    } else if (delta === 0) {
      reason = "single_month_only — key has only one snapshot row so latest===sum; no discrepancy";
    } else {
      const monthCounts = monthlyBreakdown.map((b) => b.months.length);
      reason = `latest_snapshot_only_vs_sum_all_months — projects page reads only most recent month; activity page sums all ${Math.max(...monthCounts)} months; missing $${delta.toFixed(2)} of historical spend`;
    }

    results.push({
      project_name: projectName,
      linked_api_keys: rawKeys,
      activity_page_spend: Math.round(activitySpend * 100) / 100,
      projects_page_spend: Math.round(projectsPageSpend * 100) / 100,
      delta,
      monthly_breakdown: monthlyBreakdown,
      reason,
    });
  }

  results.sort((a, b) => b.delta - a.delta);

  // Org-wide totals to show magnitude
  const allKeysActivityTotal = [...snapshotsByKeyLower.values()]
    .reduce((s, rows) => s + rows.reduce((sr, r) => sr + r.usage_total, 0), 0);

  const allKeysLatestTotal = [...snapshotsByKeyLower.entries()]
    .reduce((s, [, rows]) => {
      if (rows.length === 0) return s;
      const sorted = [...rows].sort((a, b) => b.month.localeCompare(a.month));
      return s + sorted[0].usage_total;
    }, 0);

  return NextResponse.json({
    root_cause: "usage_total in openrouter_usage_snapshots is MONTHLY spend per row, not cumulative. Projects page takes latest row only — misses all prior months. Fix: sum all rows per key.",
    org_totals: {
      activity_page_or_total: Math.round(allKeysActivityTotal * 100) / 100,
      projects_page_or_total: Math.round(allKeysLatestTotal * 100) / 100,
      missing_from_projects_page: Math.round((allKeysActivityTotal - allKeysLatestTotal) * 100) / 100,
    },
    target_projects: results,
    projects_found: results.length,
    projects_not_found_in_portfolio: [...TARGET_PROJECTS].filter(
      (t) => !results.find((r) => r.project_name.toLowerCase() === t.toLowerCase())
    ),
  });
}
