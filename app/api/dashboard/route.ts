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

  const [monthlyRes, unpaidRes, vendorRes, trendRes, upcomingRes, hiddenRes, allInvoicesRes, orSnapshotsRes] = await Promise.all([
    // Last complete month paid spend (anchor month - 1)
    supabase
      .from("financial_records")
      .select("total_amount")
      .eq("payment_status", "paid")
      .gte("invoice_date", firstOfLastComplete)
      .lt("invoice_date", firstOfAnchorMonth)
      .not("vendor_name", "ilike", "%makemytrip%"),

    // All unpaid records
    supabase
      .from("financial_records")
      .select("total_amount, due_date")
      .neq("payment_status", "paid")
      .not("vendor_name", "ilike", "%makemytrip%"),

    // Last 12 months — vendor breakdown
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount")
      .gte("invoice_date", twelveMonthsAgo)
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),

    // Last 12 months — monthly trend (vendor_name needed for hidden-tool filtering)
    supabase
      .from("financial_records")
      .select("vendor_name, invoice_date, total_amount, payment_status, due_date")
      .gte("invoice_date", twelveMonthsAgo)
      .not("vendor_name", "ilike", "%makemytrip%"),

    // Upcoming due (real clock — actual future dates)
    supabase
      .from("financial_records")
      .select("*")
      .gte("due_date", today)
      .lte("due_date", nextWeek)
      .neq("payment_status", "paid")
      .not("vendor_name", "ilike", "%makemytrip%")
      .order("due_date")
      .limit(5),

    supabase.from("hidden_tools").select("tool_key"),

    // All-time non-OR invoices for shared infrastructure bucket
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount")
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),

    // OpenRouter per-key monthly snapshots (last 12 months)
    supabase
      .from("openrouter_usage_snapshots")
      .select("key_name, period, usage_total")
      .gte("period", twelveMonthsAgo.substring(0, 7)),
  ]);

  const hiddenKeys = new Set((hiddenRes.data ?? []).map((r) => r.tool_key as string));

  const totalMonthlySpend = (monthlyRes.data ?? []).reduce(
    (s, r) => s + Number(r.total_amount ?? 0),
    0
  );

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

  // For OpenRouter: replace invoice-based total with snapshot-based total (more current/accurate).
  // Snapshots reflect actual metered API usage per key; invoices may lag by weeks.
  const orSnapshotTotal = (orSnapshotsRes.data ?? []).reduce(
    (s, snap) => s + Number(snap.usage_total ?? 0),
    0
  );
  if (orSnapshotTotal > 0) {
    vendorMap.set("OpenRouter", orSnapshotTotal);
  }

  const spendByVendor = [...vendorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([vendor, total]) => ({ vendor, total }));

  // Pre-aggregate snapshot spend by display month key so we can query it quickly below.
  const orSnapshotByMonth = new Map<string, number>();
  for (const snap of orSnapshotsRes.data ?? []) {
    const [year, month] = snap.period.split("-");
    const key = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
    });
    orSnapshotByMonth.set(key, (orSnapshotByMonth.get(key) ?? 0) + Number(snap.usage_total ?? 0));
  }

  // Monthly trend with paid/unpaid split.
  // hasOrInvoice tracks whether a month already has invoice-based OpenRouter rows in financial_records,
  // so we can avoid double-counting when we later fold in snapshot data.
  type MonthBucket = { paid: number; unpaid: number; unpaidCount: number; overdueCount: number; hasOrInvoice: boolean };
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
    const b = monthMap.get(label) ?? { paid: 0, unpaid: 0, unpaidCount: 0, overdueCount: 0, hasOrInvoice: false };
    const amount = Number(r.total_amount ?? 0);
    if (r.payment_status === "paid") {
      b.paid += amount;
    } else {
      b.unpaid += amount;
      b.unpaidCount += 1;
      if (r.due_date && r.due_date < today) b.overdueCount += 1;
    }
    if (r.vendor_name && canonicalVendor(r.vendor_name as string) === "OpenRouter") {
      b.hasOrInvoice = true;
    }
    monthMap.set(label, b);
  }

  // Fold in OpenRouter snapshot spend for months that have no invoice-based OR rows.
  // Snapshot spend is metered/paid — it goes into the paid bucket.
  for (const [key, snapshotAmount] of orSnapshotByMonth) {
    const b = monthMap.get(key) ?? { paid: 0, unpaid: 0, unpaidCount: 0, overdueCount: 0, hasOrInvoice: false };
    if (!b.hasOrInvoice) {
      b.paid += snapshotAmount;
    }
    monthMap.set(key, b);
  }

  const monthlyTrend = [...monthMap.entries()]
    .sort((a, b) => new Date("1 " + a[0]).getTime() - new Date("1 " + b[0]).getTime())
    .map(([month, b]) => {
      const { hasOrInvoice, ...rest } = b;
      const snapshotAmount = orSnapshotByMonth.get(month) ?? 0;
      const source: "invoice" | "snapshot" | "none" = hasOrInvoice
        ? "invoice"
        : snapshotAmount > 0
        ? "snapshot"
        : "none";
      return { month, total: rest.paid + rest.unpaid, ...rest, source };
    });

  // Shared infrastructure: all-time non-OpenRouter vendor totals
  const infraMap = new Map<string, number>();
  for (const r of allInvoicesRes.data ?? []) {
    if (!r.vendor_name) continue;
    const canonical = canonicalVendor(r.vendor_name as string);
    if (canonical === "OpenRouter") continue;
    if (hiddenKeys.has(canonical)) continue;
    infraMap.set(canonical, (infraMap.get(canonical) ?? 0) + Number(r.total_amount ?? 0));
  }
  const infraServices: SharedInfraService[] = [...infraMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, total]) => ({ name, total }));
  const infraTotal = infraServices.reduce((s, svc) => s + svc.total, 0);

  // Compute data freshness warning for the dashboard banner.
  const latestSnapshotPeriod =
    [...(orSnapshotsRes.data ?? []).map((s) => s.period as string)].sort().at(-1) ?? "";
  const invoiceIngestionStalled = latestDateStr
    ? Date.now() - new Date(latestDateStr + "T00:00:00").getTime() > 45 * 24 * 60 * 60 * 1000
    : false;

  const metrics: DashboardMetrics = {
    totalMonthlySpend,
    spendMonth,
    unpaidCount,
    unpaidTotal,
    overdueCount,
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
