"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { AlertCircle, CalendarClock, RefreshCw, OctagonAlert } from "lucide-react";
import { KPICard } from "@/components/dashboard/KPICard";
import { SpendRangeCard } from "@/components/dashboard/SpendByMonthCard";
import { SpendByVendorChart } from "@/components/dashboard/SpendByVendorChart";
import { TrendAndForecastCard } from "@/components/dashboard/TrendAndForecastCard";
import { DashboardMetrics, FinancialRecord } from "@/types";
import { formatCurrency, cn, canonicalVendor } from "@/lib/utils";
import { DashboardChat } from "@/components/dashboard/DashboardChat";
import { SharedInfraCard } from "@/components/dashboard/SharedInfraCard";

interface Props {
  initial: DashboardMetrics;
}

export function DashboardClient({ initial }: Props) {
  const [metrics, setMetrics] = useState<DashboardMetrics>(initial);
  const [loading, setLoading] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [vendorProjects, setVendorProjects] = useState<Record<string, string[]>>({});

  useEffect(() => {
    Promise.all([
      fetch("/api/sheets").then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/tools/attribute").then((r) => r.ok ? r.json() : null).catch(() => null),
    ]).then(([sheetsJson, attrJson]) => {
      const map: Record<string, string[]> = {};
      for (const project of sheetsJson?.projects ?? []) {
        const vendors = (project.llms ?? []).map((l: { provider: string }) => l.provider);
        for (const v of vendors) {
          const key = canonicalVendor(v).toLowerCase();
          if (!map[key]) map[key] = [];
          if (!map[key].includes(project.name)) map[key].push(project.name);
        }
      }
      for (const ov of attrJson?.overrides ?? []) {
        const key = (ov.vendor_name as string).toLowerCase();
        if (!map[key]) map[key] = [];
        for (const p of ov.project_names as string[]) {
          if (!map[key].includes(p)) map[key].push(p);
        }
      }
      setVendorProjects(map);
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setMetrics(data);
        setLastRefreshed(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="pt-6 md:pt-10 px-4 md:px-7 pb-7 space-y-6 max-w-7xl">
      {/* Header row */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)]">Dashboard</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">AI infrastructure spend overview</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:block text-xs font-medium text-[var(--text-quaternary)]">
            {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · Updated {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg text-white disabled:opacity-40 transition-colors duration-200 shadow-sm"
            style={{ backgroundColor: "var(--bg-brand-solid)" }}
            onMouseEnter={(e) => { if (!loading) (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-brand-solid_hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--bg-brand-solid)"; }}
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Row 1 — Orion AI */}
      <div className="max-w-2xl mx-auto">
        <DashboardChat metrics={metrics} />
      </div>

      {/* Row 2 — Stat cards */}
      <div className={cn("grid grid-cols-1 sm:grid-cols-3 gap-4 transition-opacity", loading && "opacity-60")}>
        <SpendRangeCard />
        <Link href="/records?status=unpaid" className="block">
          <KPICard
            title="Unpaid Invoices"
            value={metrics.unpaidCount}
            sub={`${formatCurrency(metrics.unpaidTotal)} outstanding`}
            icon={AlertCircle}
            accent="amber"
          />
        </Link>
        <Link href="/records?status=overdue" className="block">
          <KPICard
            title="Overdue"
            value={metrics.overdueCount}
            sub="Past due date"
            icon={OctagonAlert}
            accent="rose"
          />
        </Link>
      </div>

      {/* Row 3 — Charts */}
      <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-5 transition-opacity", loading && "opacity-60")}>
        <SpendByVendorChart data={metrics.spendByVendor} vendorProjects={vendorProjects} />
        <TrendAndForecastCard data={metrics.monthlyTrend} />
      </div>

      {/* Row 4 — Shared Infrastructure */}
      {metrics.sharedInfrastructure && metrics.sharedInfrastructure.services.length > 0 && (
        <div className={cn("transition-opacity", loading && "opacity-60")}>
          <SharedInfraCard data={metrics.sharedInfrastructure} />
        </div>
      )}

      {/* Upcoming due */}
      {metrics.upcomingDue.length > 0 && (
        <div className={cn("rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm overflow-hidden transition-opacity", loading && "opacity-60")}>
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-[var(--border-tertiary)]">
            <CalendarClock className="w-4 h-4 text-[var(--fg-brand-primary)]" />
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Upcoming Due Invoices</h3>
            <span className="ml-auto text-xs bg-[var(--bg-brand-primary)] text-[var(--text-brand-primary)] font-semibold px-2.5 py-0.5 rounded-full">
              {metrics.upcomingDue.length} due soon
            </span>
          </div>
          <div className="divide-y divide-[var(--border-tertiary)]">
            {metrics.upcomingDue.map((inv: FinancialRecord) => {
              const today = new Date().toISOString().split("T")[0];
              const isOverdue = inv.due_date ? inv.due_date < today : false;
              const daysUntil = inv.due_date
                ? Math.ceil((new Date(inv.due_date).getTime() - new Date(today).getTime()) / 86400000)
                : null;
              return (
                <div key={inv.id} className={cn(
                  "flex items-center justify-between px-4 md:px-6 py-3.5",
                  isOverdue && "bg-[var(--bg-error-primary)]"
                )}>
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                      isOverdue ? "bg-[var(--bg-brand-primary)]" : "bg-[var(--bg-secondary)]"
                    )}>
                      <span className={cn(
                        "text-xs font-semibold",
                        isOverdue ? "text-[var(--text-brand-primary)]" : "text-[var(--text-tertiary)]"
                      )}>
                        {(inv.vendor_name ?? "?")[0].toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">{inv.vendor_name ?? "Unknown"}</p>
                        {isOverdue && (
                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--bg-error-primary)] text-[var(--text-error-primary)]">OVERDUE</span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-quaternary)]">
                        Invoice #{inv.invoice_number ?? "—"} · {isOverdue
                          ? `${Math.abs(daysUntil ?? 0)}d overdue`
                          : daysUntil === 0 ? "Due today"
                          : `Due in ${daysUntil}d`}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {formatCurrency(inv.total_amount, inv.currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
