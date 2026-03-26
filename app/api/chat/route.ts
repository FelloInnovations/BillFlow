import OpenAI from "openai";
import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { buildForecast } from "@/lib/forecast";

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
  // This matches exactly what the Tools page queries, giving the correct all-time totals.
  const { data: records } = await supabase
    .from("financial_records")
    .select("vendor_name, total_amount, subtotal, tax_amount, payment_status, invoice_date, due_date, currency")
    .not("vendor_name", "ilike", "%makemytrip%")
    .order("invoice_date", { ascending: false });

  const rows: FinancialRow[] = records ?? [];

  // Verify total matches expected — should be $11,466.78
  const grandTotal = rows.reduce((sum, r) => sum + parseFloat(String(r.total_amount ?? 0)), 0);
  console.log("Total being sent to AI:", grandTotal.toFixed(2));

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

  // ── 2. Fetch forecast + projects + tools + HubSpot in parallel ──
  const [forecastResult, sheetsRes, toolsRes, hubspotRes] = await Promise.allSettled([
    buildForecast(),
    fetch(`${base}/api/sheets`).then((r) => r.json()).catch(() => null),
    fetch(`${base}/api/tools`).then((r) => r.json()).catch(() => null),
    fetch(`${base}/api/hubspot`).then((r) => r.json()).catch(() => null),
  ]);

  const forecast = forecastResult.status === "fulfilled" ? forecastResult.value : null;
  const sheets = sheetsRes.status === "fulfilled" ? sheetsRes.value : null;
  const tools  = toolsRes.status  === "fulfilled" ? toolsRes.value  : null;
  const hs     = hubspotRes.status === "fulfilled" ? hubspotRes.value : null;

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const lines: string[] = [];

  // ── Spend overview (from raw records — authoritative) ──────────────
  lines.push("=== SPEND OVERVIEW (all-time, all records) ===");
  lines.push(`Grand total (ALL records, ALL statuses): ${fmt(grandTotal)}`);
  lines.push(`Paid total: ${fmt(paidTotal)}`);
  lines.push(`Unpaid/pending total: ${fmt(unpaidTotal)} (${unpaidCount} invoices)`);
  lines.push(`Overdue invoices: ${overdueCount}`);
  lines.push(`Total invoice count: ${rows.length}`);

  // ── Vendor breakdown (all-time) ────────────────────────────────────
  lines.push("\n=== VENDOR TOTALS (all-time, total_amount) ===");
  vendorTotals.forEach(([vendor, total]) =>
    lines.push(`${vendor}: ${fmt(total)}`)
  );

  // ── Monthly trend ─────────────────────────────────────────────────
  lines.push("\n=== MONTHLY TREND ===");
  monthlyTrend.forEach(([month, b]) =>
    lines.push(`${month}: ${fmt(b.paid + b.unpaid)} total (paid ${fmt(b.paid)}, unpaid ${fmt(b.unpaid)})`)
  );

  // ── Spend forecast ────────────────────────────────────────────────
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

  // ── Projects ──────────────────────────────────────────────────────
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

  // ── Tools / vendor detail ─────────────────────────────────────────
  if (tools?.tools?.length) {
    lines.push("\n=== TOOLS & SERVICES ===");
    tools.tools.forEach((t: { name: string; type: string; projects: string[]; totalSpend: number; monthlyTrend?: { month: string; total: number }[] }) => {
      const proj = t.projects?.join(", ") || "none";
      const recent = t.monthlyTrend?.slice(-3).map((m: { month: string; total: number }) => `${m.month}: ${fmt(m.total)}`).join(", ") || "";
      lines.push(`${t.name} (${t.type}) — total: ${fmt(t.totalSpend)} | projects: ${proj}${recent ? ` | recent: ${recent}` : ""}`);
    });
  }

  // ── HubSpot enrichment tickets ────────────────────────────────────
  if (Array.isArray(hs) && hs.length) {
    lines.push("\n=== HUBSPOT ENRICHMENT TICKETS ===");
    lines.push(`Total tickets: ${hs.length}`);
    const done     = hs.filter((t: { enrichment_status?: string }) => t.enrichment_status === "Done").length;
    const hitRates = hs.filter((t: { hit_rate?: number }) => t.hit_rate != null).map((t: { hit_rate: number }) => t.hit_rate);
    const avgHit   = hitRates.length ? (hitRates.reduce((a: number, b: number) => a + b, 0) / hitRates.length * 100).toFixed(1) : "N/A";
    lines.push(`Completed: ${done}/${hs.length} | Avg hit rate: ${avgHit}%`);
    hs.slice(0, 15).forEach((t: { category?: string; list_detail?: string; contacts_to_enrich?: number; valid_enriched?: number; hit_rate?: number; enrichment_status?: string; owner?: string }) => {
      const hr = t.hit_rate != null ? ` | ${(t.hit_rate * 100).toFixed(0)}% hit` : "";
      lines.push(`• [${t.category ?? "—"}] ${t.list_detail ?? ""} (${t.contacts_to_enrich ?? 0} contacts, ${t.valid_enriched ?? 0} enriched${hr}) — ${t.enrichment_status ?? "unknown"} | ${t.owner ?? "—"}`);
    });
  }

  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { messages } = await req.json();

  const context = await buildFullContext();

  const systemPrompt = `You are Orion, an AI assistant embedded in Billflow — an internal dashboard for Fello Innovations that tracks AI infrastructure spend, projects, vendors, and HubSpot enrichment work.

You have full visibility into:
- Monthly spend KPIs, unpaid/overdue invoices, upcoming due dates
- All vendors and their all-time spend totals
- Every project (name, status, LLMs used, services, total spend)
- All tools and services with monthly breakdowns
- HubSpot enrichment tickets (category, contacts, hit rate, status)
- Spend forecast data: next month projections per vendor based on 3-month rolling average

IMPORTANT — spend calculation rules:
- The total_amount field is the definitive invoice amount (inclusive of tax). Always use total_amount for spend calculations, never subtotal or tax_amount.
- Total/overall spend = sum of ALL total_amount values across ALL records regardless of payment_status.
- Paid spend = sum of total_amount where payment_status = 'paid'.
- Unpaid/pending spend = sum of total_amount where payment_status != 'paid'.
- Never exclude any records from the total unless the user explicitly asks to filter by status.
- The grand total across all records is provided explicitly in the snapshot under "Grand total" — use that figure directly.

IMPORTANT — forecast rules:
- Forecast data is calculated as a simple average of the last 3 calendar months per vendor (both paid and pending invoices included).
- The total projected spend for next month is provided explicitly — use that figure directly.
- Trend: "up" = last month >10% higher than 3 months ago, "down" = >10% lower, "stable" = within 10%.
- Inactive vendors (no invoices in last 3 months) are excluded from the forecast total.

Current BillFlow snapshot:
${context}

Guidelines:
- Keep answers short and direct (2-4 sentences max unless a list or table is needed)
- Use $ amounts, counts, and % figures from the data when relevant
- For project/vendor/ticket questions, reference specific names and numbers from the snapshot
- If asked something not covered by the snapshot, say so clearly
- Tone: professional but conversational`;

  const stream = await client.chat.completions.create({
    model: "gpt-4o-mini",
    max_tokens: 600,
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
