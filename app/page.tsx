import { AlertCircle, Clock, TrendingUp, CalendarClock } from "lucide-react";
import { KPICard } from "@/components/dashboard/KPICard";
import { SpendByMonthCard } from "@/components/dashboard/SpendByMonthCard";
import { SpendByVendorChart } from "@/components/dashboard/SpendByVendorChart";
import { MonthlyTrendChart } from "@/components/dashboard/MonthlyTrendChart";
import { DashboardMetrics } from "@/types";
import { formatCurrency, formatDate } from "@/lib/utils";

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

  return (
    <div className="p-7 space-y-6 max-w-7xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">AI infrastructure spend overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SpendByMonthCard monthlyTrend={metrics.monthlyTrend} />
        <KPICard
          title="Unpaid Invoices"
          value={metrics.unpaidCount}
          sub={`${formatCurrency(metrics.unpaidTotal)} outstanding`}
          icon={AlertCircle}
          accent="amber"
        />
        <KPICard
          title="Due This Week"
          value={metrics.upcomingDue.length}
          sub="invoices due in 7 days"
          icon={Clock}
          accent="rose"
        />
        <KPICard
          title="Months Tracked"
          value={metrics.monthlyTrend.length}
          sub="months of data"
          icon={TrendingUp}
          accent="emerald"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <SpendByVendorChart data={metrics.spendByVendor} />
        <MonthlyTrendChart data={metrics.monthlyTrend} />
      </div>

      {/* Upcoming due */}
      {metrics.upcomingDue.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <CalendarClock className="w-4 h-4 text-rose-500" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Upcoming Due Invoices</h3>
            <span className="ml-auto text-xs bg-rose-50 dark:bg-rose-950 text-rose-600 dark:text-rose-400 font-semibold px-2.5 py-0.5 rounded-full">
              {metrics.upcomingDue.length} due soon
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {metrics.upcomingDue.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-rose-50 dark:bg-rose-950 flex items-center justify-center shrink-0">
                    <span className="text-rose-600 dark:text-rose-400 text-xs font-bold">
                      {(inv.vendor_name ?? "?")[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{inv.vendor_name ?? "Unknown"}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Invoice #{inv.invoice_number ?? "—"} · Due {formatDate(inv.due_date)}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {formatCurrency(inv.total_amount, inv.currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
