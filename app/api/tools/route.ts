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
  ] = await Promise.all([
    supabase
      .from("agents_portfolio")
      .select("agents_projects, llms, services_used, openrouter_api_key"),
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

    // Parse services_used column (comma-separated)
    if (row.services_used) {
      for (const raw of (row.services_used as string).split(",")) {
        const svc = raw.trim();
        if (!svc || svc === "-") continue;
        const canonical = canonicalVendor(svc);
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

  // ── OR per-key spend: cumulative snapshots + live refresh ───────────────
  // Snapshots store CUMULATIVE all-time usage per key per month.
  // Total  = latest snapshot's usage_total for that key.
  // Trend  = deltas between consecutive monthly snapshots.
  // Live   = get-openrouter-usage returns key.usage (cumulative) for the
  //          current key; current-month delta = liveTotal - latestSnapshot.

  // Group and sort snapshots by key → sorted by month ascending
  const keySnaps = new Map<string, { month: string; cumulative: number }[]>();
  for (const snap of snapshots ?? []) {
    const k = snap.key_name as string;
    if (!keySnaps.has(k)) keySnaps.set(k, []);
    keySnaps.get(k)!.push({ month: snap.month as string, cumulative: Number(snap.usage_total) });
  }
  for (const snaps of keySnaps.values()) snaps.sort((a, b) => a.month.localeCompare(b.month));

  const orKeyTotals  = new Map<string, number>();
  const orKeyMonthly = new Map<string, Map<string, number>>();

  // Build totals and monthly deltas from snapshot history
  for (const [keyName, snaps] of keySnaps.entries()) {
    const toolKey = `OpenRouter:${keyName}`;
    // Total = most recent cumulative value
    orKeyTotals.set(toolKey, snaps[snaps.length - 1].cumulative);
    // Monthly trend = deltas between consecutive cumulative snapshots
    const monthMap = new Map<string, number>();
    for (let i = 0; i < snaps.length; i++) {
      const delta = i === 0 ? snaps[i].cumulative : snaps[i].cumulative - snaps[i - 1].cumulative;
      if (delta > 0) monthMap.set(yyyyMmToLabel(snaps[i].month), delta);
    }
    orKeyMonthly.set(toolKey, monthMap);
  }

  // Live refresh: call get-openrouter-usage (now uses key.usage, not activity API)
  // Updates the current total and adds a current-month delta entry if usage increased.
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

        // Update total with fresh data
        orKeyTotals.set(toolKey, liveTotal);

        // Current-month delta = liveTotal minus the latest stored cumulative
        const snaps = keySnaps.get(keyName) ?? [];
        const prevCumulative = snaps.length > 0 ? snaps[snaps.length - 1].cumulative : 0;
        const delta = Math.max(0, liveTotal - prevCumulative);
        if (delta > 0) {
          const monthMap = orKeyMonthly.get(toolKey) ?? new Map<string, number>();
          monthMap.set(yyyyMmToLabel(currentMonth), delta);
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
      totalSpend: total,
      monthlyTrend: sortedTrend(canonicalMonthly.get(canonical) ?? new Map()),
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
      totalSpend: orKeyTotals.get(toolKey) ?? 0,
      monthlyTrend: sortedTrend(orKeyMonthly.get(toolKey) ?? new Map()),
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

  tools.sort((a, b) => b.totalSpend - a.totalSpend);

  return NextResponse.json({ tools });
}
