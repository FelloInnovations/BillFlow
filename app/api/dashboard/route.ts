import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { DashboardMetrics, FinancialRecord } from "@/types";

export async function GET() {
  const now = new Date();
  const firstOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toISOString().split("T")[0];
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString().split("T")[0];
  const spendMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    .toLocaleDateString("en-US", { month: "short", year: "numeric" });
  const twelveMonthsAgo = new Date(now.getFullYear() - 1, now.getMonth(), 1)
    .toISOString().split("T")[0];
  const today = now.toISOString().split("T")[0];
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  // Fetch all records needed for aggregations in parallel
  const [monthlyRes, unpaidRes, vendorRes, trendRes, upcomingRes] = await Promise.all([
    // Previous month's paid spend
    supabase
      .from("financial_records")
      .select("total_amount")
      .eq("payment_status", "paid")
      .gte("invoice_date", firstOfPrevMonth)
      .lt("invoice_date", firstOfMonth)
      .not("vendor_name", "ilike", "%makemytrip%"),

    // All unpaid records
    supabase
      .from("financial_records")
      .select("total_amount, due_date")
      .neq("payment_status", "paid")
      .not("vendor_name", "ilike", "%makemytrip%"),

    // Last 12 months — for vendor breakdown
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount")
      .gte("invoice_date", twelveMonthsAgo)
      .not("vendor_name", "is", null)
      .not("vendor_name", "ilike", "%makemytrip%"),

    // Last 12 months — for monthly trend
    supabase
      .from("financial_records")
      .select("invoice_date, total_amount, payment_status, due_date")
      .gte("invoice_date", twelveMonthsAgo)
      .not("vendor_name", "ilike", "%makemytrip%"),

    // Upcoming due
    supabase
      .from("financial_records")
      .select("*")
      .gte("due_date", today)
      .lte("due_date", nextWeek)
      .neq("payment_status", "paid")
      .not("vendor_name", "ilike", "%makemytrip%")
      .order("due_date")
      .limit(5),
  ]);

  // Aggregate: monthly spend
  const totalMonthlySpend = (monthlyRes.data ?? []).reduce(
    (s, r) => s + Number(r.total_amount ?? 0), 0
  );

  // Aggregate: unpaid + overdue
  const unpaidData = unpaidRes.data ?? [];
  const unpaidCount = unpaidData.length;
  const unpaidTotal = unpaidData.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
  const overdueCount = unpaidData.filter((r) => r.due_date && r.due_date < today).length;

  // Aggregate: spend by vendor (top 10)
  const vendorMap = new Map<string, number>();
  for (const r of vendorRes.data ?? []) {
    if (!r.vendor_name) continue;
    vendorMap.set(r.vendor_name, (vendorMap.get(r.vendor_name) ?? 0) + Number(r.total_amount ?? 0));
  }
  const spendByVendor = [...vendorMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([vendor, total]) => ({ vendor, total }));

  // Aggregate: monthly trend with paid/unpaid split
  type MonthBucket = { paid: number; unpaid: number; unpaidCount: number; overdueCount: number };
  const monthMap = new Map<string, MonthBucket>();
  for (const r of trendRes.data ?? []) {
    if (!r.invoice_date) continue;
    const key = new Date(r.invoice_date).toLocaleDateString("en-US", { month: "short", year: "numeric" });
    const b = monthMap.get(key) ?? { paid: 0, unpaid: 0, unpaidCount: 0, overdueCount: 0 };
    const amount = Number(r.total_amount ?? 0);
    if (r.payment_status === "paid") {
      b.paid += amount;
    } else {
      b.unpaid += amount;
      b.unpaidCount += 1;
      if (r.due_date && r.due_date < today) b.overdueCount += 1;
    }
    monthMap.set(key, b);
  }
  const monthlyTrend = [...monthMap.entries()]
    .sort((a, b) => new Date("1 " + a[0]).getTime() - new Date("1 " + b[0]).getTime())
    .map(([month, b]) => ({ month, total: b.paid + b.unpaid, ...b }));

  const metrics: DashboardMetrics = {
    totalMonthlySpend,
    spendMonth,
    unpaidCount,
    unpaidTotal,
    overdueCount,
    upcomingDue: (upcomingRes.data ?? []) as FinancialRecord[],
    spendByVendor,
    monthlyTrend,
  };

  return NextResponse.json(metrics);
}
