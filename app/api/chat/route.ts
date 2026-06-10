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
      .select("metric_key, value, date")
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

  // ── Shared infrastructure (org-wide service costs from invoices) ─────────────────
  lines.push("\n=== SHARED INFRASTRUCTURE (org-wide, not attributed to projects) ===");
  lines.push("These service costs come from invoices and are NOT split across projects.");
  const infraVendors = vendorTotals.filter(([v]) => {
    const lower = v.toLowerCase();
    return !lower.includes("openrouter") && !hiddenSet.has(v);
  });
  for (const [vendor, total] of infraVendors) {
    lines.push(`${vendor}: ${fmt(total)}`);
  }

  // ── Volume-attributed project expense summary ────────────────────────────────────
  if (expenseMap && expenseMap.size > 0) {
    lines.push("\n=== PROJECT EXPENSE SUMMARY (volume-attributed, all-time) ===");
    lines.push("OR spend on shared keys is split by actual invocation volume (falls back to equal split if no log data).");
    const sortedExpense = [...expenseMap.entries()]
      .filter(([, e]) => e.total > 0)
      .sort((a, b) => b[1].total - a[1].total);
    for (const [name, e] of sortedExpense) {
      const methodLabel = e.orAllocationMethod === "dedicated" ? "metered"
        : e.orAllocationMethod === "volume" ? "volume-split"
        : e.orAllocationMethod === "equal" ? "equal-split"
        : "no OR key";
      lines.push(`${name}: ${fmt(e.total)} total (OR dedicated: ${fmt(e.orDedicated)}, OR allocated: ${fmt(e.orShared)}, tools: ${fmt(e.toolsDedicated + e.toolsShared)}) [${methodLabel}]`);
    }
  }

  if (unallocated) {
    lines.push("\n=== UNALLOCATED SPEND (org-wide, not attributed to any project) ===");
    lines.push(`Total unallocated: ${fmt(unallocated.total)}`);
    lines.push(`  Shared infrastructure (Railway, Supabase, etc.): ${fmt(unallocated.sharedInfra)}`);
    lines.push(`  Invoice vendors with no project link: ${fmt(unallocated.invoicesUnallocated)}`);
    if (unallocated.unlinkedOrKeys > 0) lines.push(`  OR keys not linked to any project: ${fmt(unallocated.unlinkedOrKeys)}`);
    if (unallocated.topUnallocatedInvoiceVendors.length > 0) {
      lines.push("  Top unallocated invoice vendors:");
      for (const v of unallocated.topUnallocatedInvoiceVendors) lines.push(`    ${v.vendor}: ${fmt(v.amount)}`);
    }
    lines.push("NOTE: Invoice spend cannot be attributed to individual projects until Phase 2 adds project_id to financial_records.");
  }

  // ── Arthur outcomes (AI referral ROI for Fello) ──────────────────────────────────
  if (arthurOutcomes.length > 0) {
    lines.push("\n=== ARTHUR OUTCOMES (AI-referral pipeline for Fello) ===");
    lines.push("Arthur is Fello's AI agent that attracts inbound leads via ChatGPT, Perplexity, Claude mentions.");
    lines.push("Metrics sourced from HubSpot CRM. LLM traffic = contacts created via AI referral per day.");

    type ARow = { metric_key: string; value: number; date: string };
    const trafficByMonth = new Map<string, number>();
    const mtdByMonth = new Map<string, Record<string, number>>();
    for (const row of arthurOutcomes as ARow[]) {
      const month = row.date.substring(0, 7);
      if (row.metric_key === "llm_traffic_daily") {
        trafficByMonth.set(month, (trafficByMonth.get(month) ?? 0) + row.value);
      } else {
        const m = mtdByMonth.get(month) ?? {};
        if (!(row.metric_key in m)) m[row.metric_key] = row.value;
        mtdByMonth.set(month, m);
      }
    }

    const months = [...new Set([...trafficByMonth.keys(), ...mtdByMonth.keys()])].sort().reverse().slice(0, 6);
    for (const month of months) {
      const m = mtdByMonth.get(month) ?? {};
      const traffic = trafficByMonth.get(month) ?? 0;
      lines.push(
        `${month}: traffic=${traffic} | demos booked=${m["demos_booked_mtd"] ?? 0} | demos held=${m["demos_held_mtd"] ?? 0} | closed-won=${m["closed_won_mtd"] ?? 0} | ARR closed=${fmt(m["arr_closed_mtd"] ?? 0)}`
      );
    }

    const arthurExpense = expenseMap?.get("Arthur for Fello");
    if (arthurExpense && arthurExpense.total > 0) {
      lines.push(`Arthur all-time OR spend: ${fmt(arthurExpense.total)} [${arthurExpense.orAllocationMethod}]`);
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
3. **Volume-attributed project expense** — each project's OR spend with shared keys split by actual invocation volume (falls back to equal split when no log data)
4. **Unallocated spend** — shared infrastructure (Railway, Supabase, etc.) and invoice vendors not yet linked to projects
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

CRITICAL — spend calculation rules:
- Always use total_amount (tax-inclusive) for invoice spend, never subtotal.
- Grand total = sum of ALL total_amount values across ALL records regardless of payment_status.
- When asked about a specific project's cost, use the PROJECT EXPENSE SUMMARY section for the most accurate figure.
- Projects with "No metered spend" have no OpenRouter API key — their LLM costs cannot be individually attributed.

ARTHUR ROI GUIDANCE:
- Arthur is Fello's AI agent that generates inbound leads through AI platform mentions (ChatGPT, Perplexity, Claude).
- LLM traffic = number of new contacts whose source is attributed to an AI platform in HubSpot.
- ROI can be calculated as: ARR closed / Arthur OR spend. Use the ARTHUR OUTCOMES section for monthly data.
- Demos booked and held are counted independently — a demo booked in one month but held in another counts in both, so held/booked ratio can exceed 100%.

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
