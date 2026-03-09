import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { DashboardMetrics } from "@/types";

const EMPTY_METRICS: DashboardMetrics = {
  totalMonthlySpend: 0, spendMonth: "", unpaidCount: 0, unpaidTotal: 0,
  overdueCount: 0, upcomingDue: [], spendByVendor: [], monthlyTrend: [],
};

async function getDashboard(): Promise<DashboardMetrics> {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const res = await fetch(`${base}/api/dashboard`, { cache: "no-store" });
    if (!res.ok) return EMPTY_METRICS;
    return res.json();
  } catch {
    return EMPTY_METRICS;
  }
}

export default async function DashboardPage() {
  const metrics = await getDashboard();
  return <DashboardClient initial={metrics} />;
}
