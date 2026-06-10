import OpenAI from "openai";
import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildForecast } from "@/lib/forecast";
import { getAllProjectsExpense, getUnallocatedSpend } from "@/lib/project-expense";

type FinancialRow = {
  vendor_name: string | null;
  total_amount: string | number | null;
  subtotal: string | number | null;
  tax_amount: string | number | null;
  payment_status: string | null;
  invoice_date: string | null;
  due_date: string | null;
  currency: string | null;
};

async function buildFullContext(): Promise<string> {
  const base = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  // ── 1. Direct query for ALL financial records — no date filter, no status filter ──
  const { data: records } = await supabase
    .from("financial_records")
    .select("vendor_name, total_amount, subtotal, tax_amount, payment_status, invoice_date, due_date, currency")
    .not("vendor_name", "ilike", "%makemytrip%")
    .order("invoice_date", { ascending: false });

  const rows: FinancialRow[] = records ?? [];

  const grandTotal = rows.reduce((sum, r) => sum + parseFloat(String(r.total_amount ?? 0)), 0);

  const today = new Date().toISOString().split("T")[0];
  const paidTotal    = rows.filter(r => r.payment_status === "paid").reduce((s, r) => s + parseFloat(String(r.total_amount ?? 0)), 0);
  const unpaidTotal  = rows.filter(r => r.payment_status !== "paid").reduce((s, r) => s + parseFloat(String(r.total_amount ?? 0)), 0);
  const unpaidCount  = rows.filter(r => r.payment_status !== "paid").length;
  const overdueCount = rows.filter(r => r.payment_status !== "paid" && r.due_date && r.due_date < today).length;

  // Vendor totals — all-time, from raw records
  const vendorMap = new Map<string, number>();
  for (const r of rows) {
    if (!r.vendor_name) continue;
    vendorMap.set(r.vendor_name, (vendorMap.get(r.vendor_name) ?? 0) + parseFloat(String(r.total_amount ?? 0)));
  }
  const vendorTotals = [...vendorMap.entries()].sort((a, b) => b[1] - a[1]);

  // Monthly trend — from raw records
  const monthMap = new Map<string, { paid: number; unpaid: number }>();
  for (const r of rows) {
    if (!r.invoice_date) continue;
    const key = new Date(r.invoice_date).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    const b = monthMap.get(key) ?? { paid: 0, unpaid: 0 };
    const amt = parseFloat(String(r.total_amount ?? 0));
    if (r.payment_status === "paid") b.paid += amt; else b.unpaid += amt;
    monthMap.set(key, b);
  }
  const monthlyTrend = [...monthMap.entries()]
    .sort((a, b) => new Date("1 " + a[0]).getTime() - new Date("1 " + b[0]).getTime());

  // ── 2. Fetch forecast + projects + tools + expense + outcomes in parallel ──
  const [forecastResult, sheetsRes, toolsRes, expenseMapResult, unallocatedResult, arthurOutcomesResult] = await Promise.allSettled([
    buildForecast(),
    fetch(`${base}/api/sheets`).then((r) => r.json()).catch(() => null),
    fetch(`${base}/api/tools`).then((r) => r.json()).catch(() => null),
    getAllProjectsExpense("all_time"),
    getUnallocatedSpend("all_time"),
    supabase
      .from("project_outcome_metrics")
      .select("metric_key, value, date, created_at")
      .eq("project_id", "arthur")
      .order("date", { ascending: false })
      .limit(200),
  ]);

  const forecast        = forecastResult.status        === "fulfilled" ? forecastResult.value              : null;
  const sheets          = sheetsRes.status             === "fulfilled" ? sheetsRes.value                   : null;
  const tools           = toolsRes.status              === "fulfilled" ? toolsRes.value                    : null;
  const expenseMap      = expenseMapResult.status      === "fulfilled" ? expenseMapResult.value             : null;
  const unallocated     = unallocatedResult.status     === "fulfilled" ? unallocatedResult.value            : null;
  const arthurOutcomes  = arthurOutcomesResult.status  === "fulfilled" ? arthurOutcomesResult.value.data ?? [] : [];

  // ── 3. Fetch OpenRouter snapshot, activity summary, guardrails, and hidden tools ──
  const [orSnapshotsRes, activityRes, guardrailsRes, hiddenToolsRes, invocationSummaryRes] = await Promise.allSettled([
    supabase
      .from("openrouter_usage_snapshots")
      .select("key_name, month, usage_total")
      .order("month", { ascending: false }),

    supabase
      .from("api_invocation_logs")
      .select("key_name, project_name, model, cost_usd, prompt_tokens, completion_tokens, invoked_at")
      .order("invoked_at", { ascending: false })
      .limit(500),

    supabase
      .from("project_guardrails")
      .select("project_name, openrouter_key_name, monthly_budget_usd, warning_threshold_pct, recommended_budget_usd"),

    supabase
      .from("hidden_tools")
      .select("vendor_name, tool_key"),

    // Aggregated invocation stats per project
    supabase
      .from("api_invocation_logs")
      .select("project_name, key_name, model, cost_usd, prompt_tokens, completion_tokens"),
  ]);

  const orSnapshots     = orSnapshotsRes.status     === "fulfilled" ? orSnapshotsRes.value.data     ?? [] : [];
  const activityLogs    = activityRes.status         === "fulfilled" ? activityRes.value.data         ?? [] : [];
  const guardrails      = guardrailsRes.status       === "fulfilled" ? guardrailsRes.value.data       ?? [] : [];
  const hiddenTools     = hiddenToolsRes.status      === "fulfilled" ? hiddenToolsRes.value.data      ?? [] : [];
  const invocationRows  = invocationSummaryRes.status === "fulfilled" ? invocationSummaryRes.value.data ?? [] : [];

  const hiddenSet = new Set<string>(
    [
      ...hiddenTools.map((r: { vendor_name: string | null; tool_key: string | null }) => r.vendor_name),
      ...hiddenTools.map((r: { vendor_name: string | null; tool_key: string | null }) => r.tool_key),
    ].filter((v): v is string => v != null)
  );

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const lines: string[] = [];

  // ── Spend overview ──────────────────────────────────────────────────────────────
  lines.push("=== SPEND OVERVIEW (all-time, all records) ===");
  lines.push(`Grand total (ALL records, ALL statuses): ${fmt(grandTotal)}`);
  lines.push(`Paid total: ${fmt(paidTotal)}`);
  lines.push(`Unpaid/pending total: ${fmt(unpaidTotal)} (${unpaidCount} invoices)`);
  lines.push(`Overdue invoices: ${overdueCount}`);
  lines.push(`Total invoice count: ${rows.length}`);

  // ── Vendor breakdown (hidden tools filtered) ────────────────────────────────────
  lines.push("\n=== VENDOR TOTALS (all-time, total_amount) ===");
  vendorTotals.filter(([v]) => !hiddenSet.has(v)).forEach(([vendor, total]) =>
    lines.push(`${vendor}: ${fmt(total)}`)
  );

  // ── Monthly trend ───────────────────────────────────────────────────────────────
  lines.push("\n=== MONTHLY TREND ===");
  monthlyTrend.forEach(([month, b]) =>
    lines.push(`${month}: ${fmt(b.paid + b.unpaid)} total (paid ${fmt(b.paid)}, unpaid ${fmt(b.unpaid)})`)
  );

  // ── Spend forecast ──────────────────────────────────────────────────────────────
  if (forecast) {
    lines.push(`\n=== SPEND FORECAST (next month projections based on 3-month average) ===`);
    lines.push(`Total projected spend next month (${forecast.nextMonthName}): ${fmt(forecast.totalForecast)}`);
    lines.push(`Vendors with recent activity: ${forecast.forecasts.length}`);
    lines.push(`Inactive vendors (no invoices last 3 months): ${forecast.inactiveVendors.length}`);
    forecast.forecasts.forEach((f) => {
      const months = f.last3Months.map((m) => `${m.month}: ${fmt(m.amount)}`).join(", ");
      lines.push(`${f.vendor}: ${fmt(f.forecastedAmount)} projected (${months}) — trend: ${f.trend}`);
    });
  }

  // ── Projects ────────────────────────────────────────────────────────────────────
  if (sheets?.projects?.length) {
    lines.push("\n=== PROJECTS ===");
    sheets.projects.forEach((p: { name: string; status?: string; description?: string; llms?: { provider: string; model: string }[]; services?: string[]; totalSpend?: number }) => {
      const llmNames = p.llms?.map((l: { provider: string; model: string }) => `${l.provider}/${l.model}`).join(", ") || "none";
      const svcNames = p.services?.join(", ") || "none";
      const spend    = p.totalSpend != null ? fmt(p.totalSpend) : "unknown";
      const status   = p.status ?? "active";
      lines.push(`${p.name} [${status}] — LLMs: ${llmNames} | Services: ${svcNames} | Spend: ${spend}`);
      if (p.description) lines.push(`  ↳ ${p.description}`);
    });
  }

  // ── Tools / vendor detail (hidden tools filtered) ────────────────────────────────
  if (tools?.tools?.length) {
    lines.push("\n=== TOOLS & SERVICES ===");
    tools.tools
      .filter((t: { name: string }) => !hiddenSet.has(t.name))
      .forEach((t: { name: string; displayLabel?: string; type: string; projects: string[]; totalSpend: number; monthlyTrend?: { month: string; total: number }[] }) => {
        const label = t.displayLabel ?? t.name;
        const proj = t.projects?.join(", ") || "none";
        const recent = t.monthlyTrend?.slice(-3).map((m: { month: string; total: number }) => `${m.month}: ${fmt(m.total)}`).join(", ") || "";
        lines.push(`${label} (${t.type}) — total: ${fmt(t.totalSpend)} | projects: ${proj}${recent ? ` | recent: ${recent}` : ""}`);
      });
  }

  // ── OpenRouter per-key spend (from API snapshots — primary LLM cost source) ──────
  if (orSnapshots.length > 0) {
    lines.push("\n=== OPENROUTER PER-KEY API SPEND (metered, from API snapshots) ===");
    lines.push("This is the primary source for LLM costs. Each key maps to one or more projects.");

    const keyTotals = new Map<string, { total: number; months: Record<string, number> }>();
    for (const snap of orSnapshots) {
      const k = snap.key_name as string;
      if (!keyTotals.has(k)) keyTotals.set(k, { total: 0, months: {} });
      const entry = keyTotals.get(k)!;
      const usage = Number(snap.usage_total ?? 0);
      entry.total += usage;
      entry.months[snap.month as string] = (entry.months[snap.month as string] ?? 0) + usage;
    }
    const sortedKeys = [...keyTotals.entries()].sort((a, b) => b[1].total - a[1].total);
    for (const [keyName, data] of sortedKeys) {
      const recentMonths = Object.entries(data.months)
        .sort((a, b) => b[0].localeCompare(a[0]))
        .slice(0, 3)
        .map(([m, v]) => `${m}: ${fmt(v)}`)
        .join(", ");
      lines.push(`Key "${keyName}": ${fmt(data.total)} total | recent: ${recentMonths}`);
    }

    const totalORSpend = sortedKeys.reduce((s, [, d]) => s + d.total, 0);
    lines.push(`Total OpenRouter API spend (all keys): ${fmt(totalORSpend)}`);
  }

  // ── Per-project API cost summary (from invocation logs) ─────────────────────────
  if (invocationRows.length > 0) {
    lines.push("\n=== PER-PROJECT API COSTS (from invocation logs) ===");

    const projectStats = new Map<string, { cost: number; tokens: number; requests: number; models: Set<string> }>();
    for (const row of invocationRows) {
      const pName = (row.project_name as string) ?? "unknown";
      if (!projectStats.has(pName)) projectStats.set(pName, { cost: 0, tokens: 0, requests: 0, models: new Set() });
      const entry = projectStats.get(pName)!;
      entry.cost += Number(row.cost_usd ?? 0);
      entry.tokens += Number(row.prompt_tokens ?? 0) + Number(row.completion_tokens ?? 0);
      entry.requests += 1;
      if (row.model) entry.models.add(row.model as string);
    }

    const sortedProjects = [...projectStats.entries()].sort((a, b) => b[1].cost - a[1].cost);
    for (const [name, stats] of sortedProjects) {
      lines.push(`${name}: ${fmt(stats.cost)} | ${stats.tokens.toLocaleString()} tokens | ${stats.requests} requests | models: ${[...stats.models].join(", ")}`);
    }
  }

  // ── Budget guardrails ────────────────────────────────────────────────────────────
  lines.push("\n=== BUDGET GUARDRAILS ===");
  if (guardrails.length > 0) {
    for (const g of guardrails) {
      lines.push(`${g.project_name}: budget ${fmt(Number(g.monthly_budget_usd))}/month | warn at ${g.warning_threshold_pct}% | recommended: ${g.recommended_budget_usd ? fmt(Number(g.recommended_budget_usd)) : "not set"}`);
    }
  } else {
    lines.push("No budget guardrails have been set yet.");
  }

  // ── Shared infrastructure note (now allocated to projects — see PROJECT EXPENSE SUMMARY) ──
  lines.push("\n=== SHARED INFRASTRUCTURE (now proportionally allocated to projects) ===");
  lines.push("Railway, Supabase, Vercel, Cloudflare, AWS, GCP invoices are distributed to each project");
  lines.push("proportionally based on that project's share of total direct (OR + tools) spend.");
  lines.push("These figures are estimates — see PROJECT EXPENSE SUMMARY for each project's allocated_infra value.");
  lines.push("All other invoice vendors (Oxylabs, Apify, ElevenLabs, etc.) remain in UNALLOCATED SPEND.");

  // ── Project expense summary ───────────────────────────────────────────────────────
  if (expenseMap && expenseMap.size > 0) {
    // Build name → status lookup from sheets data (best available source)
    const statusByName = new Map<string, string>();
    if (sheets?.projects) {
      for (const p of sheets.projects as { name: string; status?: string }[]) {
        if (p.name && p.status) statusByName.set(p.name, p.status);
      }
    }

    const sortedExpense = [...expenseMap.entries()]
      .filter(([, e]) => e.direct > 0)
      .sort((a, b) => b[1].total - a[1].total);

    const attributedTotal = sortedExpense.reduce((s, [, e]) => s + e.total, 0);
    const infraPool = sortedExpense[0]?.[1].infraTotalPool ?? 0;
    const totalDirect = sortedExpense.reduce((s, [, e]) => s + e.direct, 0);

    lines.push("\n=== PROJECT EXPENSE SUMMARY (volume-attributed, all-time) ===");
    lines.push(`Methodology: OR spend on shared keys split by invocation volume (equal-split fallback). Shared infrastructure (${fmt(infraPool)}) allocated proportionally — each project's share = (project direct / ${fmt(totalDirect)} total direct) × infra pool.`);
    lines.push(`Global totals: attributed ${fmt(attributedTotal)} | unallocated ${unallocated ? fmt(unallocated.total) : "?"} | grand total ${unallocated ? fmt(attributedTotal + unallocated.total) : "?"}`);
    lines.push("---");

    for (const [name, e] of sortedExpense) {
      const status = statusByName.get(name) ?? "";
      const statusStr = status ? ` [${status}]` : "";
      const methodLabel = e.orAllocationMethod === "dedicated" ? "metered"
        : e.orAllocationMethod === "volume" ? "volume-split"
        : e.orAllocationMethod === "equal" ? "equal-split"
        : "no OR key";
      lines.push(`${name}${statusStr}: total=${fmt(e.total)} | direct=${fmt(e.direct)} | infra est.=${fmt(e.allocatedInfra)} (${e.infraSharePercent}% of pool) | OR method=${methodLabel}`);
    }
  }

  if (unallocated) {
    lines.push("\n=== UNALLOCATED SPEND (costs not attributed to any project) ===");
    lines.push(`Total unallocated: ${fmt(unallocated.total)}`);
    lines.push(`  Shared infrastructure distributed to projects: ${fmt(unallocated.sharedInfraAllocated)} (proportional to direct spend — NOT in this bucket)`);
    if (unallocated.sharedTooling > 0) lines.push(`  Shared tooling (HubSpot, Slack, etc.): ${fmt(unallocated.sharedTooling)}`);
    lines.push(`  Invoice vendors with no project link: ${fmt(unallocated.invoicesUnallocated)}`);
    if (unallocated.unlinkedOrKeys > 0) lines.push(`  OR keys not linked to any project: ${fmt(unallocated.unlinkedOrKeys)}`);
    if (unallocated.topUnallocatedInvoiceVendors.length > 0) {
      lines.push("  Top unallocated invoice vendors:");
      for (const v of unallocated.topUnallocatedInvoiceVendors) lines.push(`    ${v.vendor}: ${fmt(v.amount)}`);
    }
    lines.push("NOTE: Shared infrastructure IS allocated to projects (proportional to their direct OR spend). Only tooling and misc invoices remain unallocated until Phase 2.");
  }

  // ── Arthur outcomes (AI referral pipeline for Fello) ─────────────────────────────
  if (arthurOutcomes.length > 0) {
    type ARow = { metric_key: string; value: number; date: string; created_at?: string };
    const rows_ = arthurOutcomes as ARow[];

    // Sync freshness: latest created_at across all rows
    const latestCreatedAt = rows_
      .map((r) => r.created_at ?? "")
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;
    const syncAgo = latestCreatedAt ? (() => {
      const diffMs = Date.now() - new Date(latestCreatedAt).getTime();
      const mins = Math.floor(diffMs / 60_000);
      if (mins < 1)  return "just now";
      if (mins < 60) return `${mins}m ago`;
      const hrs = Math.floor(mins / 60);
      if (hrs < 24)  return `${hrs}h ago`;
      return `${Math.floor(hrs / 24)}d ago`;
    })() : "unknown";

    // Daily metrics: sum per month
    const dailyKeys = ["llm_traffic_daily", "llm_chatgpt_daily", "llm_perplexity_daily", "llm_claude_daily", "llm_other_daily"];
    const dailyByMonth = new Map<string, Record<string, number>>();
    // MTD snapshot metrics: keep latest row per metric per month (rows ordered date desc)
    const mtdByMonth = new Map<string, Record<string, number>>();

    for (const row of rows_) {
      const month = row.date.substring(0, 7);
      if (dailyKeys.includes(row.metric_key)) {
        const d = dailyByMonth.get(month) ?? {};
        d[row.metric_key] = (d[row.metric_key] ?? 0) + row.value;
        dailyByMonth.set(month, d);
      } else {
        const m = mtdByMonth.get(month) ?? {};
        if (!(row.metric_key in m)) m[row.metric_key] = row.value; // keep latest (first seen, ordered desc)
        mtdByMonth.set(month, m);
      }
    }

    const allMonths = [...new Set([...dailyByMonth.keys(), ...mtdByMonth.keys()])].sort().reverse();
    const last6Months = allMonths.slice(0, 6);

    lines.push("\n=== ARTHUR OUTCOMES (AI-referral pipeline for Fello) ===");
    lines.push(`Data synced: ${syncAgo} | source: HubSpot CRM`);
    lines.push("Arthur attracts inbound leads via ChatGPT, Perplexity, Claude mentions. LLM traffic = new contacts with AI-platform attribution.");
    lines.push("Metrics: llm_traffic=total daily contacts | chatgpt/perplexity/claude/other=per-platform | demos_booked/held=monthly | closed_won=deals | arr_closed=deal value");

    // Per-month detail (last 6 months)
    lines.push("--- Last 6 months (per-month) ---");
    for (const month of last6Months) {
      const d = dailyByMonth.get(month) ?? {};
      const m = mtdByMonth.get(month) ?? {};
      const traffic    = d["llm_traffic_daily"]    ?? 0;
      const chatgpt    = d["llm_chatgpt_daily"]    ?? 0;
      const perplexity = d["llm_perplexity_daily"] ?? 0;
      const claude     = d["llm_claude_daily"]     ?? 0;
      const other      = d["llm_other_daily"]      ?? 0;
      lines.push(
        `${month}: traffic=${traffic} (ChatGPT=${chatgpt} Perplexity=${perplexity} Claude=${claude} Other=${other})` +
        ` | demos booked=${m["demos_booked_mtd"] ?? 0} held=${m["demos_held_mtd"] ?? 0}` +
        ` | closed-won=${m["closed_won_mtd"] ?? 0} | ARR=${fmt(m["arr_closed_mtd"] ?? 0)}`
      );
    }

    // 6-month aggregate totals
    const sum6 = (key: string, daily: boolean) => last6Months.reduce((s, mo) => {
      const src = daily ? dailyByMonth.get(mo) : mtdByMonth.get(mo);
      return s + (src?.[key] ?? 0);
    }, 0);
    lines.push("--- Last 6 months aggregate ---");
    lines.push(`Total traffic: ${sum6("llm_traffic_daily", true)} contacts (ChatGPT=${sum6("llm_chatgpt_daily", true)} Perplexity=${sum6("llm_perplexity_daily", true)} Claude=${sum6("llm_claude_daily", true)} Other=${sum6("llm_other_daily", true)})`);
    lines.push(`Total demos booked: ${sum6("demos_booked_mtd", false)} | held: ${sum6("demos_held_mtd", false)}`);
    lines.push(`Total closed-won: ${sum6("closed_won_mtd", false)} | ARR closed: ${fmt(sum6("arr_closed_mtd", false))}`);

    // Month-over-month: last completed vs prior month
    if (last6Months.length >= 2) {
      const [curr, prev] = last6Months;
      const dC = dailyByMonth.get(curr) ?? {};
      const dP = dailyByMonth.get(prev) ?? {};
      const mC = mtdByMonth.get(curr) ?? {};
      const mP = mtdByMonth.get(prev) ?? {};
      const trafficC = dC["llm_traffic_daily"] ?? 0;
      const trafficP = dP["llm_traffic_daily"] ?? 0;
      const tDelta = trafficP > 0 ? ` (${trafficC >= trafficP ? "+" : ""}${Math.round(((trafficC - trafficP) / trafficP) * 100)}% MoM)` : "";
      const arrC = mC["arr_closed_mtd"] ?? 0;
      const arrP = mP["arr_closed_mtd"] ?? 0;
      const arrDelta = arrP > 0 ? ` (${arrC >= arrP ? "+" : ""}${Math.round(((arrC - arrP) / arrP) * 100)}% MoM)` : "";
      lines.push(`--- Month-over-month: ${curr} vs ${prev} ---`);
      lines.push(`Traffic: ${trafficC} vs ${trafficP}${tDelta}`);
      lines.push(`Demos booked: ${mC["demos_booked_mtd"] ?? 0} vs ${mP["demos_booked_mtd"] ?? 0}`);
      lines.push(`Closed-won: ${mC["closed_won_mtd"] ?? 0} vs ${mP["closed_won_mtd"] ?? 0}`);
      lines.push(`ARR: ${fmt(arrC)} vs ${fmt(arrP)}${arrDelta}`);
    }
  }

  // ── Project ROI ───────────────────────────────────────────────────────────────────
  if (arthurOutcomes.length > 0 && expenseMap) {
    type ARow = { metric_key: string; value: number; date: string; created_at?: string };
    const arthurExpense = expenseMap.get("Arthur for Fello");

    // Last 6 months ARR from outcomes (sum arr_closed_mtd)
    const mtdByMonth2 = new Map<string, Record<string, number>>();
    for (const row of arthurOutcomes as ARow[]) {
      if (!["llm_traffic_daily","llm_chatgpt_daily","llm_perplexity_daily","llm_claude_daily","llm_other_daily"].includes(row.metric_key)) {
        const month = row.date.substring(0, 7);
        const m = mtdByMonth2.get(month) ?? {};
        if (!(row.metric_key in m)) m[row.metric_key] = row.value;
        mtdByMonth2.set(month, m);
      }
    }
    const last6 = [...mtdByMonth2.keys()].sort().reverse().slice(0, 6);
    const arrLast6 = last6.reduce((s, mo) => s + (mtdByMonth2.get(mo)?.["arr_closed_mtd"] ?? 0), 0);

    if (arthurExpense && arthurExpense.direct > 0) {
      const directSpend = arthurExpense.direct;
      const roi = arrLast6 > 0 ? Math.round(arrLast6 / directSpend) : 0;
      lines.push("\n=== PROJECT ROI ===");
      lines.push("Arthur for Fello:");
      lines.push(`  Expense (all-time direct OR): ${fmt(directSpend)}`);
      lines.push(`  ARR Closed (last 6 months): ${fmt(arrLast6)}`);
      lines.push(`  ROI: ${roi}x (ARR last 6 months / all-time direct OR spend)`);
      lines.push("  Note: Uses direct OR spend only — allocated infra share excluded at this scale to avoid distorting the ROI signal.");
      if (arrLast6 === 0) lines.push("  Note: No closed-won ARR recorded in last 6 months — ROI cannot be computed.");
    }
  }

  // ── Hidden tools ─────────────────────────────────────────────────────────────────
  if (hiddenSet.size > 0) {
    lines.push("\n=== HIDDEN TOOLS (deleted from UI, excluded from all totals) ===");
    lines.push([...hiddenSet].join(", "));
  }

  // ── Data freshness ───────────────────────────────────────────────────────────────
  lines.push("\n=== DATA FRESHNESS ===");
  const latestInvoice  = rows[0]?.invoice_date ?? "unknown";
  const latestSnapshot = orSnapshots.length > 0 ? (orSnapshots[0]?.month as string ?? "unknown") : "no snapshots";
  const latestActivity = activityLogs.length > 0 ? (activityLogs[0] as { invoked_at?: string })?.invoked_at ?? "unknown" : "no activity logs";
  lines.push(`Latest invoice date: ${latestInvoice}`);
  lines.push(`Latest OpenRouter snapshot month: ${latestSnapshot}`);
  lines.push(`Latest API invocation: ${latestActivity}`);
  lines.push(`Invoice ingestion may be stalled if latest invoice is more than 2 weeks old.`);
  lines.push(`OpenRouter API data is synced hourly via n8n. Last sync timestamp is available in openrouter_usage_snapshots.`);

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const client = new OpenAI({
    apiKey: process.env.OPENROUTER_BILLFLOW_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_BASE_URL ?? "https://spendsync-production.up.railway.app",
      "X-Title": "BillFlow",
    },
  });
  const { messages } = await req.json();

  const context = await buildFullContext();

  const systemPrompt = `You are Orion, the AI spend intelligence assistant embedded in BillFlow — Fello Innovations' internal dashboard for tracking AI infrastructure costs and project outcomes.

You have full, real-time visibility into:

1. **Invoice-based spend** — all financial records from vendor invoices (paid, unpaid, overdue)
2. **API-key-based spend** — per-project LLM costs tracked via named OpenRouter API keys (primary and most accurate source for LLM spend)
3. **Volume-attributed project expense** — each project's OR spend with shared keys split by actual invocation volume; shared infrastructure (Railway, Supabase, etc.) distributed proportionally to projects by direct spend share
4. **Unallocated spend** — shared tooling (HubSpot, Slack, etc.) and misc invoice vendors with no project link; shared infra is NOT here — it has been allocated to projects
5. **Budget guardrails** — monthly spend limits per project, warning thresholds, recommended budgets
6. **Spend forecast** — next month projections per vendor based on 3-month rolling averages
7. **Arthur outcomes** — AI-referral pipeline metrics (LLM traffic, demos booked/held, closed-won deals, ARR) sourced from HubSpot CRM
8. **All projects** — name, status, description, LLMs, spend allocation method

CRITICAL — dual-source cost model:
- **LLM costs** come primarily from OpenRouter API key snapshots (the "OPENROUTER PER-KEY API SPEND" section). These are metered and accurate.
- **Service/infrastructure costs** (Oxylabs, Supabase, Apify, etc.) come from invoice records and are NOT attributed to individual projects.
- **Invoice-based vendor totals** may be stale if invoice ingestion has paused. Check the DATA FRESHNESS section.
- When reporting OpenRouter/LLM spend, prefer the API snapshot figures over invoice figures — they are more current.
- The total org spend = OpenRouter API total + shared infrastructure invoice total. Do not double-count.
- **Shared key allocation**: OR keys shared between projects are split by invocation log volume. Check the PROJECT EXPENSE SUMMARY section for per-project figures.
- **Infrastructure allocation**: The shared infra pool (Railway, Supabase, etc.) is proportionally distributed across projects based on each project's share of total direct spend. All infra figures are estimates — marked as "(est.)" in the UI.

CRITICAL — spend calculation rules:
- Always use total_amount (tax-inclusive) for invoice spend, never subtotal.
- Grand total = sum of ALL total_amount values across ALL records regardless of payment_status.
- When asked about a specific project's cost, use the PROJECT EXPENSE SUMMARY section for the most accurate figure.
- Projects with "No metered spend" have no OpenRouter API key — their LLM costs cannot be individually attributed.

ARTHUR ROI GUIDANCE:
- Arthur is Fello's AI agent that generates inbound leads through AI platform mentions (ChatGPT, Perplexity, Claude).
- LLM traffic = number of new contacts whose source is attributed to an AI platform in HubSpot.
- Precomputed ROI is in the PROJECT ROI section: ARR closed (last 6 months) / all-time direct OR spend.
- Demos booked and held are counted independently — a demo booked in one month but held in another counts in both, so held/booked ratio can exceed 100%.
- For "which platform sends us the most demos?" — check ARTHUR OUTCOMES per-month source breakdown (ChatGPT/Perplexity/Claude/Other columns) and identify which has the highest cumulative traffic, then cross-reference with demo conversion. Traffic is a proxy since HubSpot doesn't directly attribute demos to source platform.

Response formatting rules:
- Use **bold** for key numbers and names (they render as highlights in the chat UI).
- Use bullet lists (- item) for breakdowns with 3-8 items. Never use pipe-based markdown tables — they render poorly in the chat bubble.
- For comparisons or rankings, use numbered lists (1. item — $X).
- For monthly breakdowns, use this format:
  - **May 2026**: $1,244 (paid $1,244 · unpaid $0)
  - **Apr 2026**: $376 (paid $376 · unpaid $0)
- Keep each response to 3-6 bullet points or 3-5 sentences unless the user asks for a detailed breakdown.
- Start with the direct answer (the number or fact), then supporting detail. Never lead with a preamble.
- Use line breaks between sections for readability.
- When reporting project costs, format as: **Project Name** — $X (key: key_name, models: model1, model2)
- For vendor costs, format as: **Vendor** — $X (Y% of total)
- End with a one-line data freshness note only if the data might be stale.
- Tone: professional, data-driven, direct.

Current BillFlow snapshot:
${context}`;

  const stream = await client.chat.completions.create({
    model: "openai/gpt-4o-mini",
    max_tokens: 1500,
    stream: true,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages,
    ],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content ?? "";
        if (text) controller.enqueue(encoder.encode(text));
      }
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
