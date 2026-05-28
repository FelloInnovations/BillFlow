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
  const [{ data: records }, { data: hiddenRows }] = await Promise.all([
    supabase
      .from("financial_records")
      .select("vendor_name, total_amount, invoice_date")
      .not("vendor_name", "ilike", "%makemytrip%")
      .not("vendor_name", "is", null)
      .order("invoice_date", { ascending: false }),
    supabase.from("hidden_tools").select("tool_key"),
  ]);

  const hiddenKeys = new Set((hiddenRows ?? []).map((r) => r.tool_key as string));

  // Anchor all windows to the latest invoice in the DB, not the wall clock.
  // Prevents empty forecasts if ingestion stalls for several months.
  const latestDateStr = (records?.[0]?.invoice_date as string | null) ?? null;
  const anchor = latestDateStr ? new Date(latestDateStr + "T00:00:00") : new Date();
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
