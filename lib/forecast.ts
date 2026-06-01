import { supabase } from "@/lib/supabase";
import { ForecastResult, VendorForecast } from "@/types";
import { canonicalVendor } from "@/lib/utils";

function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

export async function buildForecast(): Promise<ForecastResult> {
  const [{ data: records }, { data: hiddenRows }, { data: orSnapshots }, { data: liveTodayRows }] = await Promise.all([
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount, invoice_date")
      .not("vendor_name", "ilike", "%makemytrip%")
      .not("vendor_name", "is", null)
      .order("invoice_date", { ascending: false }),
    supabase.from("hidden_tools").select("tool_key"),
    supabase
      .from("openrouter_usage_snapshots")
      .select("month, usage_total"),
    // Live-today rows: partial spend for the current day, not yet in snapshots
    supabase
      .from("api_invocation_logs")
      .select("cost_usd")
      .eq("source", "live_today"),
  ]);

  const hiddenKeys = new Set((hiddenRows ?? []).map((r) => r.tool_key as string));

  // Build per-period OR snapshot totals (sum across all keys for each month)
  const orByMonth: Record<string, number> = {};
  for (const snap of orSnapshots ?? []) {
    orByMonth[snap.month] = (orByMonth[snap.month] ?? 0) + Number(snap.usage_total ?? 0);
  }

  // Add scaled projection for the current month from live_today rows.
  // Extrapolates today's partial spend to a full-month estimate so the forecast
  // window advances to the current month rather than staying on last snapshot month.
  const liveTodayTotal = (liveTodayRows ?? []).reduce((s, r) => s + Number(r.cost_usd ?? 0), 0);
  if (liveTodayTotal > 0) {
    const now = new Date();
    const currentMonthKey = now.toISOString().substring(0, 7);
    if (!orByMonth[currentMonthKey]) {
      const dayOfMonth = now.getUTCDate();
      const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
      orByMonth[currentMonthKey] = liveTodayTotal * (daysInMonth / dayOfMonth);
    }
  }

  // Anchor: use the later of latest invoice date or latest snapshot period.
  // When invoice ingestion stalls, snapshots advance the window so recent months stay in view.
  const latestInvoiceDateStr = (records?.[0]?.invoice_date as string | null) ?? null;
  const latestSnapshotPeriod = Object.keys(orByMonth).sort().at(-1) ?? null;
  const snapshotAnchorDate = latestSnapshotPeriod ? latestSnapshotPeriod + "-01" : null;

  let anchor: Date;
  if (snapshotAnchorDate && (!latestInvoiceDateStr || snapshotAnchorDate > latestInvoiceDateStr)) {
    anchor = new Date(snapshotAnchorDate + "T00:00:00");
  } else {
    anchor = latestInvoiceDateStr ? new Date(latestInvoiceDateStr + "T00:00:00") : new Date();
  }

  const anchorYear = anchor.getFullYear();
  const anchorMonth = anchor.getMonth(); // 0-indexed

  // Last 3 months: anchor month (index 0), then 1 and 2 months prior
  const last3MonthKeys = [0, -1, -2].map((offset) => {
    const d = new Date(anchorYear, anchorMonth + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const nextMonthDate = new Date(anchorYear, anchorMonth + 1, 1);
  const nextMonthName = nextMonthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Group by canonical vendor and month.
  // Use substring(0,7) on invoice_date to avoid UTC/local timezone shifts when extracting month.
  const vendorMonthly: Record<string, Record<string, number>> = {};

  for (const record of records ?? []) {
    const vendor = (record.vendor_name as string | null)?.trim();
    if (!vendor || !record.total_amount || !record.invoice_date) continue;

    const canonical = canonicalVendor(vendor);
    if (hiddenKeys.has(canonical)) continue;
    const monthKey = (record.invoice_date as string).substring(0, 7); // "YYYY-MM"

    if (!vendorMonthly[canonical]) vendorMonthly[canonical] = {};
    vendorMonthly[canonical][monthKey] = (vendorMonthly[canonical][monthKey] ?? 0) +
      parseFloat(String(record.total_amount));
  }

  // Replace OR invoice monthly data with snapshot data — snapshots are metered and current,
  // while invoices lag (or stop entirely when ingestion stalls).
  const orKey =
    Object.keys(vendorMonthly).find((v) => v.toLowerCase().includes("openrouter")) ?? "OpenRouter";
  if (!vendorMonthly[orKey]) vendorMonthly[orKey] = {};
  for (const [period, total] of Object.entries(orByMonth)) {
    vendorMonthly[orKey][period] = total;
  }

  const forecasts: VendorForecast[] = [];
  const inactiveVendors: VendorForecast[] = [];

  for (const [vendor, monthly] of Object.entries(vendorMonthly)) {
    // monthValues[0] = anchor month (most recent), [1] = 1 prior, [2] = 2 prior
    const monthValues = last3MonthKeys.map((m) => monthly[m] ?? 0);
    const hasRecentActivity = monthValues.some((v) => v > 0);

    const last3Data = last3MonthKeys.map((m) => ({
      month: formatMonthKey(m),
      amount: monthly[m] ?? 0,
    }));

    if (!hasRecentActivity) {
      inactiveVendors.push({
        vendor,
        forecastedAmount: 0,
        last3Months: last3Data,
        hasRecentActivity: false,
        trend: "stable",
      });
      continue;
    }

    const avg = monthValues.reduce((a, b) => a + b, 0) / last3MonthKeys.length;

    // Trend: compare anchor month vs 2 months prior
    const oldest = monthValues[2];
    const latest = monthValues[0];
    let trend: "up" | "down" | "stable" = "stable";
    if (oldest > 0) {
      const change = (latest - oldest) / oldest;
      if (change > 0.1) trend = "up";
      else if (change < -0.1) trend = "down";
    } else if (latest > 0) {
      trend = "up";
    }

    forecasts.push({
      vendor,
      forecastedAmount: Math.round(avg * 100) / 100,
      last3Months: last3Data,
      hasRecentActivity: true,
      trend,
    });
  }

  forecasts.sort((a, b) => b.forecastedAmount - a.forecastedAmount);
  inactiveVendors.sort((a, b) => a.vendor.localeCompare(b.vendor));

  const totalForecast =
    Math.round(forecasts.reduce((sum, f) => sum + f.forecastedAmount, 0) * 100) / 100;

  return {
    forecasts,
    inactiveVendors,
    totalForecast,
    nextMonthName,
    anchorDate: anchor.toISOString().split("T")[0],
    computedAt: new Date().toISOString(),
  };
}
