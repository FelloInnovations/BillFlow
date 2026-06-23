import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { DashboardMetrics, FinancialRecord, SharedInfraService } from "@/types";
import { canonicalVendor } from "@/lib/utils";

export async function GET() {
  // Anchor all date windows to the latest invoice in the DB.
  // Prevents stale/empty KPIs if the ingestion pipeline stalls for weeks.
  const { data: latestRow } = await supabase
    .from("financial_records")
    .select("invoice_date")
    .not("vendor_name", "ilike", "%makemytrip%")
    .order("invoice_date", { ascending: false })
    .limit(1);

  const latestDateStr = (latestRow?.[0]?.invoice_date as string | null) ?? null;
  const anchor = latestDateStr ? new Date(latestDateStr + "T00:00:00") : new Date();
  const anchorYear = anchor.getFullYear();
  const anchorMonth = anchor.getMonth(); // 0-indexed

  // "Last complete month" = the month BEFORE the anchor month.
  const lastCompleteDate = new Date(anchorYear, anchorMonth - 1, 1);
  const firstOfLastComplete = lastCompleteDate.toISOString().split("T")[0];
  const firstOfAnchorMonth = new Date(anchorYear, anchorMonth, 1).toISOString().split("T")[0];
  const spendMonth = lastCompleteDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const twelveMonthsAgo = new Date(anchorYear - 1, anchorMonth, 1).toISOString().split("T")[0];

  // Upcoming-due checks use the real clock (future due dates are always real-time)
  const today = new Date().toISOString().split("T")[0];
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  const currentMonth = new Date().toISOString().substring(0, 7);

  const [monthlyRes, unpaidRes, vendorRes, trendRes, upcomingRes, hiddenRes, allInvoicesRes, orSnapshotsRes, todaySnapshotRes] = await Promise.all([
    // Last complete month paid spend (anchor month - 1)
    supabase
      .from("financial_records")
      .select("total_amount")
      .eq("payment_status", "paid")
      .gte("invoice_date", firstOfLastComplete)
      .lt("invoice_date", firstOfAnchorMonth)
      .not("vendor_name", "ilike", "%makemytrip%")
      .not("vendor_name", "ilike", "%openrouter%"),

    // All unpaid records
    supabase
      .from("financial_records")
      .select("total_amount, due_date")
      .neq("payment_status", "paid")
      .not("vendor_name", "ilike", "%makemytrip%")
      .not("vendor_name", "ilike", "%openrouter%"),

    // Last 12 months — vendor breakdown
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount")
      .gte("invoice_date", twelveMonthsAgo)
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%")
      .not("vendor_name", "ilike", "%openrouter%"),

    // Last 12 months — monthly trend (vendor_name needed for hidden-tool filtering)
    supabase
      .from("financial_records")
      .select("vendor_name, invoice_date, total_amount, payment_status, due_date")
      .gte("invoice_date", twelveMonthsAgo)
      .not("vendor_name", "ilike", "%makemytrip%")
      .not("vendor_name", "ilike", "%openrouter%"),

    // Upcoming due (real clock — actual future dates)
    supabase
      .from("financial_records")
      .select("*")
      .gte("due_date", today)
      .lte("due_date", nextWeek)
      .neq("payment_status", "paid")
      .not("vendor_name", "ilike", "%makemytrip%")
      .not("vendor_name", "ilike", "%openrouter%")
      .order("due_date")
      .limit(5),

    supabase.from("hidden_tools").select("tool_key"),

    // All-time non-OR invoices for shared infrastructure bucket
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount")
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%")
      .not("vendor_name", "ilike", "%openrouter%"),

    // OpenRouter per-key monthly snapshots (last 12 months)
    supabase
      .from("openrouter_usage_snapshots")
      .select("key_name, month, usage_total")
      .gte("month", twelveMonthsAgo.substring(0, 7)),

    // Today's live spend per key from usage_today snapshots (updated hourly, more accurate than log rows)
    supabase
      .from("openrouter_usage_snapshots")
      .select("usage_today")
      .eq("month", currentMonth),
  ]);

  const hiddenKeys = new Set((hiddenRes.data ?? []).map((r) => r.tool_key as string));

  // Sum OR snapshots by YYYY-MM period — deduplicate by (key_name, month) so shared
  // keys are counted once even if the snapshot table has duplicate rows for a key.
  const orByMonth: Record<string, number> = {};
  const seenKeyMonth = new Set<string>();
  for (const row of orSnapshotsRes.data ?? []) {
    const key = (row.key_name as string) ?? "";
    const period = row.month as string;
    const dk = `${key}::${period}`;
    if (seenKeyMonth.has(dk)) continue;
    seenKeyMonth.add(dk);
    orByMonth[period] = (orByMonth[period] ?? 0) + Number(row.usage_total ?? 0);
  }

  // Merge today's snapshot spend into current month (usage_today is updated hourly)
  const todayLiveSpend = (todaySnapshotRes.data ?? []).reduce(
    (sum, row) => sum + Number(row.usage_today ?? 0), 0
  );
  if (todayLiveSpend > 0) {
    orByMonth[currentMonth] = (orByMonth[currentMonth] ?? 0) + todayLiveSpend;
  }

  // Previous calendar month key (real clock — not invoice anchor — so May snapshot appears)
  const now = new Date();
  const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthKey = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, "0")}`;
  const orCurrentMonthSpend = orByMonth[prevMonthKey] ?? 0;

  // Monthly spend card: invoice paid spend + OR snapshot for the current period
  const invoiceMonthlySpend = (monthlyRes.data ?? []).reduce(
    (s, r) => s + Number(r.total_amount ?? 0),
    0
  );
  const totalMonthlySpend = invoiceMonthlySpend + orCurrentMonthSpend;

  const unpaidData = unpaidRes.data ?? [];
  const unpaidCount = unpaidData.length;
  const unpaidTotal = unpaidData.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
  const overdueCount = unpaidData.filter((r) => r.due_date && r.due_date < today).length;

  // Roll up vendor names to canonical form (Anthropic/OpenAI/xAI → OpenRouter, etc.)
  const vendorMap = new Map<string, number>();
  for (const r of vendorRes.data ?? []) {
    if (!r.vendor_name) continue;
    const canonical = canonicalVendor(r.vendor_name as string);
    if (hiddenKeys.has(canonical)) continue;
    vendorMap.set(canonical, (vendorMap.get(canonical) ?? 0) + Number(r.total_amount ?? 0));
  }

  // Replace OpenRouter invoice total with snapshot total (snapshots are more current/accurate)
  const orSnapshotTotal = Object.values(orByMonth).reduce((s, v) => s + v, 0);
  const existingORKey = [...vendorMap.keys()].find((k) => k.toLowerCase().includes("openrouter"));
  if (existingORKey) {
    vendorMap.set(existingORKey, orSnapshotTotal);
  } else if (orSnapshotTotal > 0) {
    vendorMap.set("OpenRouter", orSnapshotTotal);
  }

  const spendByVendor = [...vendorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([vendor, total]) => ({ vendor, total }));

  // Monthly trend: build from invoices, then add OR snapshot spend on top
  type MonthBucket = { paid: number; unpaid: number; unpaidCount: number; overdueCount: number };
  const monthMap = new Map<string, MonthBucket>();

  for (const r of trendRes.data ?? []) {
    if (!r.invoice_date) continue;
    if (r.vendor_name && hiddenKeys.has(canonicalVendor(r.vendor_name as string))) continue;
    const yyyyMm = (r.invoice_date as string).substring(0, 7);
    const [yr, mo] = yyyyMm.split("-");
    const label = new Date(parseInt(yr), parseInt(mo) - 1, 1).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    const b = monthMap.get(label) ?? { paid: 0, unpaid: 0, unpaidCount: 0, overdueCount: 0 };
    const amount = Number(r.total_amount ?? 0);
    if (r.payment_status === "paid") {
      b.paid += amount;
    } else {
      b.unpaid += amount;
      b.unpaidCount += 1;
      if (r.due_date && r.due_date < today) b.overdueCount += 1;
    }
    monthMap.set(label, b);
  }

  // Add OR snapshot spend into each month (additive — snapshots cover months invoices miss)
  for (const [period, snapTotal] of Object.entries(orByMonth)) {
    const [y, m] = period.split("-");
    const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    const b = monthMap.get(label) ?? { paid: 0, unpaid: 0, unpaidCount: 0, overdueCount: 0 };
    b.paid += snapTotal;
    monthMap.set(label, b);
  }

  // Build the trend array sorted oldest → newest
  const orSnapshotMonths = new Set(
    Object.keys(orByMonth).map((period) => {
      const [y, m] = period.split("-");
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
      });
    })
  );

  const monthlyTrend = [...monthMap.entries()]
    .sort((a, b) => new Date("1 " + a[0]).getTime() - new Date("1 " + b[0]).getTime())
    .map(([month, b]) => {
      const source: "invoice" | "snapshot" | "none" = orSnapshotMonths.has(month)
        ? "snapshot"
        : "invoice";
      return { month, total: b.paid + b.unpaid, ...b, source };
    });

  // Shared infrastructure: all-time non-OpenRouter vendor totals
  const infraMap = new Map<string, number>();
  for (const r of allInvoicesRes.data ?? []) {
    if (!r.vendor_name) continue;
    const canonical = canonicalVendor(r.vendor_name as string);
    if (hiddenKeys.has(canonical)) continue;
    infraMap.set(canonical, (infraMap.get(canonical) ?? 0) + Number(r.total_amount ?? 0));
  }
  const infraServices: SharedInfraService[] = [...infraMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, total]) => ({ name, total }));
  const infraTotal = infraServices.reduce((s, svc) => s + svc.total, 0);

  // Data freshness warning for the dashboard banner
  const latestSnapshotPeriod = Object.keys(orByMonth).sort().at(-1) ?? "";
  const invoiceIngestionStalled = latestDateStr
    ? Date.now() - new Date(latestDateStr + "T00:00:00").getTime() > 45 * 24 * 60 * 60 * 1000
    : false;

  const metrics: DashboardMetrics = {
    totalMonthlySpend,
    spendMonth,
    unpaidCount,
    unpaidTotal,
    overdueCount,
    todaySpend: todayLiveSpend,
    upcomingDue: (upcomingRes.data ?? []) as FinancialRecord[],
    spendByVendor,
    monthlyTrend,
    sharedInfrastructure: { services: infraServices, total: infraTotal },
    dataWarning: {
      invoiceDataThrough: latestDateStr ?? "",
      snapshotDataThrough: latestSnapshotPeriod,
      invoiceIngestionStalled,
    },
  };

  return NextResponse.json(metrics);
}
