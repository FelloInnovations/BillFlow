import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { canonicalVendor } from "@/lib/utils";
import { Tool } from "@/types";

function yyyyMmToLabel(yyyyMm: string): string {
  const [yr, mo] = yyyyMm.split("-");
  return new Date(parseInt(yr), parseInt(mo) - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function sortedTrend(map: Map<string, number>) {
  return [...map.entries()]
    .sort((a, b) => new Date("1 " + a[0]).getTime() - new Date("1 " + b[0]).getTime())
    .map(([month, total]) => ({ month, total }));
}

export async function GET() {
  const twelveMonthsAgo = new Date(
    new Date().getFullYear() - 1,
    new Date().getMonth(),
    1
  )
    .toISOString()
    .split("T")[0];

  const currentMonth = new Date().toISOString().substring(0, 7); // 'YYYY-MM'

  // All queries in parallel
  const [
    { data: portfolioRows },
    { data: allRows },
    { data: trendRows },
    { data: snapshots },
    { data: hiddenRows },
    { data: overrideRows },
    { data: projectOverrideRows },
  ] = await Promise.all([
    // Project↔tool links are established only via OpenRouter API key mappings (LLM spend)
    // or future explicit manual links. Shared infrastructure services (Supabase, Oxylabs,
    // ScraperAPI, etc.) are org-wide costs — never attributed to specific projects.
    // Any tool with type:"service" will always have projects:[].
    supabase
      .from("agents_portfolio")
      .select("agents_projects, llms, openrouter_api_key"),
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount")
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),
    supabase
      .from("financial_records")
      .select("vendor_name, invoice_date, total_amount")
      .gte("invoice_date", twelveMonthsAgo)
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),
    supabase
      .from("openrouter_usage_snapshots")
      .select("key_name, month, usage_total"),
    supabase.from("hidden_tools").select("tool_key"),
    supabase.from("tool_overrides").select("*"),
    supabase.from("tool_project_overrides").select("vendor_name, project_names, notes"),
  ]);

  const hiddenKeys = new Set((hiddenRows ?? []).map((r) => r.tool_key as string));

  // ── Build project → vendor mapping from agents_portfolio ────────────────
  // vendorToProjects: canonical vendor name → project names
  // keyToProjects:    OR key_name          → project names
  const vendorToProjects = new Map<string, string[]>();
  const keyToProjects    = new Map<string, string[]>();

  for (const row of portfolioRows ?? []) {
    const project: string = row.agents_projects ?? "";
    if (!project) continue;

    // Parse llms column (comma-separated, e.g. "OpenRouter gpt-4o-mini, OpenRouter Grok")
    if (row.llms) {
      for (const raw of (row.llms as string).split(",")) {
        const llm = raw.trim();
        if (!llm || llm === "-") continue;
        const canonical = llm.toLowerCase().startsWith("openrouter")
          ? "OpenRouter"
          : canonicalVendor(llm);
        const arr = vendorToProjects.get(canonical) ?? [];
        if (!arr.includes(project)) arr.push(project);
        vendorToProjects.set(canonical, arr);
      }
    }

    // OR named key(s) — comma-separated when a project uses multiple keys
    if (row.openrouter_api_key) {
      for (const key of (row.openrouter_api_key as string).split(",").map((k: string) => k.trim()).filter(Boolean)) {
        const arr = keyToProjects.get(key) ?? [];
        if (!arr.includes(project)) arr.push(project);
        keyToProjects.set(key, arr);
      }
    }
  }

  // ── Invoice-based canonical totals (all-time) ────────────────────────────
  const canonicalTotals  = new Map<string, number>();
  for (const r of allRows ?? []) {
    if (!r.vendor_name) continue;
    const canonical = canonicalVendor(r.vendor_name as string);
    canonicalTotals.set(canonical, (canonicalTotals.get(canonical) ?? 0) + Number(r.total_amount ?? 0));
  }

  // ── Invoice-based monthly trend (last 12 months) ─────────────────────────
  const canonicalMonthly = new Map<string, Map<string, number>>();
  for (const r of trendRows ?? []) {
    if (!r.vendor_name || !r.invoice_date) continue;
    const canonical = canonicalVendor(r.vendor_name as string);
    const label = new Date(r.invoice_date as string).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    const monthMap = canonicalMonthly.get(canonical) ?? new Map<string, number>();
    monthMap.set(label, (monthMap.get(label) ?? 0) + Number(r.total_amount ?? 0));
    canonicalMonthly.set(canonical, monthMap);
  }

  // ── OR per-key spend: monthly snapshots + live partial-month refresh ───────
  // usage_total is PER-MONTH spend (not cumulative).
  // All-time total = sum of all monthly rows per key.
  // Monthly trend  = each row's value directly.
  // Live refresh   = edge fn returns cumulative OR total; delta vs snapshot sum
  //                  captures partial current-month spend not yet snapshotted.

  // Group and sort snapshots by key → sorted by month ascending
  const keySnaps = new Map<string, { month: string; spend: number }[]>();
  for (const snap of snapshots ?? []) {
    const k = snap.key_name as string;
    if (!keySnaps.has(k)) keySnaps.set(k, []);
    keySnaps.get(k)!.push({ month: snap.month as string, spend: Number(snap.usage_total) });
  }
  for (const snaps of keySnaps.values()) snaps.sort((a, b) => a.month.localeCompare(b.month));

  const orKeyTotals  = new Map<string, number>();
  const orKeyMonthly = new Map<string, Map<string, number>>();

  // Build totals and monthly trend from snapshot history
  for (const [keyName, snaps] of keySnaps.entries()) {
    const toolKey = `OpenRouter:${keyName}`;
    // Total = sum of all per-month rows
    orKeyTotals.set(toolKey, snaps.reduce((s, snap) => s + snap.spend, 0));
    // Monthly trend = each month's per-month spend value
    const monthMap = new Map<string, number>();
    for (const snap of snaps) {
      if (snap.spend > 0) monthMap.set(yyyyMmToLabel(snap.month), snap.spend);
    }
    orKeyMonthly.set(toolKey, monthMap);
  }

  // Live refresh: edge fn returns cumulative OR total; use delta vs snapshot sum
  // to capture partial current-month spend not yet written to snapshots.
  await Promise.allSettled(
    [...keyToProjects.keys()].map(async (keyName) => {
      const toolKey = `OpenRouter:${keyName}`;
      try {
        const { data: orData, error: orErr } = await supabase.functions.invoke(
          `get-openrouter-usage?key_name=${encodeURIComponent(keyName)}`
        );
        if (orErr || !orData?.success) return;

        const liveTotal: number = orData.usage_total ?? 0;
        if (liveTotal <= 0) return;

        // Partial current-month spend = live cumulative minus snapshot sum
        const snapshotSum = orKeyTotals.get(toolKey) ?? 0;
        const delta = Math.max(0, liveTotal - snapshotSum);
        if (delta > 0) {
          orKeyTotals.set(toolKey, snapshotSum + delta);
          const monthMap = orKeyMonthly.get(toolKey) ?? new Map<string, number>();
          monthMap.set(yyyyMmToLabel(currentMonth),
            (monthMap.get(yyyyMmToLabel(currentMonth)) ?? 0) + delta
          );
          orKeyMonthly.set(toolKey, monthMap);
        }
      } catch {
        // graceful degradation — snapshot totals still available
      }
    })
  );

  // ── Determine LLM vs service type ────────────────────────────────────────
  // Any vendor referenced in the llms column (or OR per-key) is an LLM
  const llmCanonicals = new Set<string>(["OpenRouter"]);
  for (const row of portfolioRows ?? []) {
    if (!row.llms) continue;
    for (const raw of (row.llms as string).split(",")) {
      const llm = raw.trim();
      if (!llm || llm === "-") continue;
      llmCanonicals.add(
        llm.toLowerCase().startsWith("openrouter") ? "OpenRouter" : canonicalVendor(llm)
      );
    }
  }

  // ── Assemble final tool list ─────────────────────────────────────────────
  const tools: Tool[] = [];

  // 1. Invoice-based vendors (includes "OpenRouter" from mapped legacy LLM invoices)
  for (const [canonical, total] of canonicalTotals.entries()) {
    if (hiddenKeys.has(canonical)) continue;
    tools.push({
      name: canonical,
      displayLabel: canonical,
      type: llmCanonicals.has(canonical) ? "llm" : "service",
      projects: vendorToProjects.get(canonical) ?? [],
      autoProjects: [],
      manualProjects: [],
      hasManualOverride: false,
      totalSpend: total,
      monthlyTrend: sortedTrend(canonicalMonthly.get(canonical) ?? new Map()),
      spendSource: canonical === "OpenRouter" ? "wallet_topup" : "invoices",
    });
  }

  // 2. OR per-key tools (API usage — separate from invoice data, no double-counting)
  for (const [keyName, projectNames] of keyToProjects.entries()) {
    const toolKey = `OpenRouter:${keyName}`;
    if (hiddenKeys.has(toolKey)) continue;
    tools.push({
      name: toolKey,
      displayLabel: `OpenRouter — ${projectNames.join(", ")}`,
      rawKey: keyName,
      type: "llm",
      projects: projectNames,
      autoProjects: [],
      manualProjects: [],
      hasManualOverride: false,
      totalSpend: orKeyTotals.get(toolKey) ?? 0,
      monthlyTrend: sortedTrend(orKeyMonthly.get(toolKey) ?? new Map()),
      spendSource: "api_usage",
    });
  }

  const overrideMap = new Map((overrideRows ?? []).map((o) => [o.tool_key as string, o]));
  for (const tool of tools) {
    const ov = overrideMap.get(tool.name);
    if (!ov) continue;
    if (ov.display_label) tool.displayLabel = ov.display_label as string;
    if (ov.type === "llm" || ov.type === "service") tool.type = ov.type;
    if (ov.notes) tool.notes = ov.notes as string;
  }

  // Merge manual project attributions
  const projectOverrideMap = new Map(
    (projectOverrideRows ?? []).map(o => [o.vendor_name as string, o.project_names as string[]])
  );
  const allProjectNames = [...new Set(
    (portfolioRows ?? []).map(r => r.agents_projects as string).filter(Boolean)
  )].sort();

  for (const tool of tools) {
    const autoProjects = [...tool.projects];
    const manualProjects = projectOverrideMap.get(tool.name) ?? [];
    tool.autoProjects = autoProjects;
    tool.manualProjects = manualProjects;
    tool.hasManualOverride = manualProjects.length > 0;
    if (manualProjects.length > 0) {
      tool.projects = [...new Set([...autoProjects, ...manualProjects])];
    }
  }

  tools.sort((a, b) => b.totalSpend - a.totalSpend);

  return NextResponse.json({ tools, allProjectNames });
}
