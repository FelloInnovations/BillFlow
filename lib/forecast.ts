import { supabase } from "@/lib/supabase";
import { ForecastResult, VendorForecast } from "@/types";

function formatMonthKey(monthKey: string): string {
  const [year, month] = monthKey.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export async function buildForecast(): Promise<ForecastResult> {
  const { data: records } = await supabase
    .from("financial_records")
    .select("vendor_name, total_amount, invoice_date, payment_status")
    .not("vendor_name", "ilike", "%makemytrip%")
    .order("invoice_date", { ascending: false });

  // Group by vendor and month
  const vendorMonthly: Record<string, Record<string, number>> = {};

  for (const record of records || []) {
    const vendor = (record.vendor_name as string | null)?.trim();
    if (!vendor || !record.total_amount) continue;

    const date = new Date(record.invoice_date as string);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    if (!vendorMonthly[vendor]) vendorMonthly[vendor] = {};
    if (!vendorMonthly[vendor][monthKey]) vendorMonthly[vendor][monthKey] = 0;
    vendorMonthly[vendor][monthKey] += parseFloat(String(record.total_amount));
  }

  // Last 3 month keys, most recent first: [last month, 2 months ago, 3 months ago]
  const now = new Date();
  const last3MonthKeys = [-1, -2, -3].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Next month name
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthName = nextMonthDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const forecasts: VendorForecast[] = [];
  const inactiveVendors: VendorForecast[] = [];

  for (const [vendor, monthly] of Object.entries(vendorMonthly)) {
    // monthValues[0] = last month, [1] = 2 months ago, [2] = 3 months ago
    const monthValues = last3MonthKeys.map((m) => monthly[m] || 0);
    const hasRecentActivity = monthValues.some((v) => v > 0);

    // Store oldest → newest for display (reverse of monthValues)
    const last3Data = last3MonthKeys.map((m) => ({
      month: formatMonthKey(m),
      amount: monthly[m] || 0,
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

    // Trend: compare last month (index 0) vs 3 months ago (index 2)
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
    computedAt: new Date().toISOString(),
  };
}
