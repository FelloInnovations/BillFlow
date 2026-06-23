"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { ForecastResult, VendorForecast } from "@/types";
import { formatCurrency, cn } from "@/lib/utils";

interface Props {
  initial: ForecastResult;
}

function TrendBadge({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up")
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--text-warning-primary)]">
        <TrendingUp className="w-3.5 h-3.5" /> ↑
      </span>
    );
  if (trend === "down")
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--text-success-primary)]">
        <TrendingDown className="w-3.5 h-3.5" /> ↓
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-[var(--text-quaternary)]">
      <Minus className="w-3.5 h-3.5" /> →
    </span>
  );
}

function StatCard({
  title,
  value,
  sub,
  accent = "salmon",
}: {
  title: string;
  value: string;
  sub?: string;
  accent?: "cyan" | "salmon" | "slate";
}) {
  const accentClass = {
    cyan: "border-t-cyan-400",
    salmon: "border-t-salmon-400",
    slate: "border-t-slate-400",
  }[accent];

  return (
    <div
      className={cn(
        "rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] border-t-4 shadow-sm p-5",
        accentClass
      )}
    >
      <p className="text-xs font-semibold text-[var(--text-tertiary)] mb-3">{title}</p>
      <p className="text-3xl font-semibold tracking-tight text-[var(--text-primary)] leading-none">
        {value}
      </p>
      {sub && <p className="text-xs mt-1.5 text-[var(--text-quaternary)]">{sub}</p>}
    </div>
  );
}

function ForecastBarChart({ forecasts }: { forecasts: VendorForecast[] }) {
  const [tooltip, setTooltip] = useState<{
    vendor: string;
    amount: number;
    trend: "up" | "down" | "stable";
    x: number;
    y: number;
  } | null>(null);

  const max = forecasts[0]?.forecastedAmount || 1;

  const barColor = (trend: "up" | "down" | "stable") => {
    if (trend === "up") return "#f59e0b";   // amber-400
    if (trend === "down") return "#10b981"; // emerald-500
    return "#94a3b8";                       // slate-400
  };

  const trendLabel = (trend: "up" | "down" | "stable") => {
    if (trend === "up") return "↑ Increasing";
    if (trend === "down") return "↓ Decreasing";
    return "→ Stable";
  };

  return (
    <div className="relative">
      <div className="space-y-2.5">
        {forecasts.map((f) => (
          <div
            key={f.vendor}
            className="flex items-center gap-3"
            onMouseEnter={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              setTooltip({ vendor: f.vendor, amount: f.forecastedAmount, trend: f.trend, x: rect.right + 8, y: rect.top });
            }}
            onMouseLeave={() => setTooltip(null)}
          >
            <span className="w-32 shrink-0 text-xs text-[var(--text-tertiary)] truncate text-right">
              {f.vendor}
            </span>
            <div className="flex-1 h-4 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(f.forecastedAmount / max) * 100}%`,
                  backgroundColor: barColor(f.trend),
                }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-xs font-semibold text-[var(--text-secondary)] tabular-nums">
              {formatCurrency(f.forecastedAmount)}
            </span>
          </div>
        ))}
      </div>

      {tooltip && (
        <div
          className="fixed z-50 bg-[var(--bg-primary-solid)] text-white rounded-lg shadow-xl px-3 py-2.5 pointer-events-none min-w-44"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="text-xs font-semibold mb-1">{tooltip.vendor}</p>
          <p className="text-sm font-semibold text-[var(--text-brand-primary)]">{formatCurrency(tooltip.amount)}</p>
          <p className="text-[10px] text-slate-400 mt-1">Trend: {trendLabel(tooltip.trend)}</p>
        </div>
      )}
    </div>
  );
}

export function ForecastingClient({ initial }: Props) {
  const [data, setData] = useState<ForecastResult>(initial);
  const [loading, setLoading] = useState(false);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch("/api/forecast", { cache: "no-store" });
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  const top = data.forecasts[0];
  const lastUpdated = data.computedAt
    ? new Date(data.computedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "—";

  // Column headers derived from actual data months (oldest→newest order).
  // Uses the first forecast's last3Months labels so headers always match the rows,
  // even when the anchor date is behind the wall clock.
  const anyForecast = data.forecasts[0] ?? data.inactiveVendors[0];
  const monthColLabels = anyForecast
    ? [anyForecast.last3Months[2].month, anyForecast.last3Months[1].month, anyForecast.last3Months[0].month]
    : ["3mo ago", "2mo ago", "Last month"];

  // Display rows with months in oldest→newest order
  const displayMonths = (f: VendorForecast) => [f.last3Months[2], f.last3Months[1], f.last3Months[0]];

  return (
    <div className="pt-6 md:pt-10 px-4 md:px-7 pb-7 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Spend Forecast</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            Projected spend for {data.nextMonthName} based on last 3 months average
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:block text-xs font-medium text-[var(--text-quaternary)]">
            {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · Updated {lastUpdated}
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[var(--bg-brand-solid)] hover:bg-[var(--bg-brand-solid\_hover)] text-white disabled:opacity-40 transition-colors shadow-sm"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className={cn("grid grid-cols-1 md:grid-cols-3 gap-4 transition-opacity", loading && "opacity-60")}>
        <StatCard
          title="Projected Total"
          value={formatCurrency(data.totalForecast)}
          sub="Next month estimated spend"
          accent="cyan"
        />
        <StatCard
          title="Vendors Tracked"
          value={String(data.forecasts.length)}
          sub="With activity in last 3 months"
          accent="salmon"
        />
        <StatCard
          title="Highest Spend Vendor"
          value={top?.vendor ?? "—"}
          sub={top ? `${formatCurrency(top.forecastedAmount)} projected` : "No data"}
          accent="slate"
        />
      </div>

      {/* Forecast table */}
      <div
        className={cn(
          "rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm overflow-hidden transition-opacity",
          loading && "opacity-60"
        )}
      >
        <div className="px-6 py-4 border-b border-[var(--border-tertiary)]">
          <h3 className="text-sm font-semibold text-[var(--text-secondary)]">Vendor Forecast Breakdown</h3>
          <p className="text-xs text-[var(--text-quaternary)] mt-0.5">
            Based on 3-month rolling average · includes paid and pending invoices
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-tertiary)] bg-[var(--bg-secondary\_subtle)]">
                <th className="text-left px-6 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
                  Vendor
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide whitespace-nowrap">
                  3 Months Ago
                  <span className="block font-normal normal-case text-[var(--text-quaternary)]">
                    {monthColLabels[0]}
                  </span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide whitespace-nowrap">
                  2 Months Ago
                  <span className="block font-normal normal-case text-[var(--text-quaternary)]">
                    {monthColLabels[1]}
                  </span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide whitespace-nowrap">
                  Last Month
                  <span className="block font-normal normal-case text-[var(--text-quaternary)]">
                    {monthColLabels[2]}
                  </span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-medium text-[var(--text-brand-primary)] uppercase tracking-wide">
                  Forecasted
                </th>
                <th className="text-center px-4 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
                  Trend
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-tertiary)]">
              {data.forecasts.map((f) => (
                <tr key={f.vendor} className="hover:bg-[var(--bg-primary\_hover)] transition-colors">
                  <td className="px-6 py-3 font-medium text-[var(--text-secondary)]">{f.vendor}</td>
                  {displayMonths(f).map((m, i) => (
                    <td key={i} className="px-4 py-3 text-right tabular-nums text-[var(--text-tertiary)]">
                      {m.amount > 0 ? (
                        formatCurrency(m.amount)
                      ) : (
                        <span className="text-[var(--text-disabled)]">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums font-semibold text-[var(--text-brand-primary)]">
                    {formatCurrency(f.forecastedAmount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <TrendBadge trend={f.trend} />
                  </td>
                </tr>
              ))}
              {data.forecasts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-[var(--text-quaternary)]">
                    No forecast data available
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Full bar chart */}
      {data.forecasts.length > 0 && (
        <div
          className={cn(
            "rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm p-6 transition-opacity",
            loading && "opacity-60"
          )}
        >
          <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-1">
            Forecasted Spend by Vendor
          </h3>
          <p className="text-xs text-[var(--text-quaternary)] mb-5">
            <span className="inline-flex items-center gap-1.5 mr-4">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-400" /> amber = increasing
            </span>
            <span className="inline-flex items-center gap-1.5 mr-4">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400" /> green = decreasing
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-slate-400" /> gray = stable
            </span>
          </p>
          <ForecastBarChart forecasts={data.forecasts} />
        </div>
      )}

      {/* Inactive vendors — collapsed section */}
      {data.inactiveVendors.length > 0 && (
        <div
          className={cn(
            "rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm overflow-hidden transition-opacity",
            loading && "opacity-60"
          )}
        >
          <button
            onClick={() => setInactiveExpanded((x) => !x)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[var(--bg-primary\_hover)] transition-colors"
          >
            <div>
              <p className="text-sm font-semibold text-[var(--text-tertiary)]">
                Inactive vendors — no invoices in last 3 months
              </p>
              <p className="text-xs text-[var(--text-quaternary)] mt-0.5">
                {data.inactiveVendors.length} vendor{data.inactiveVendors.length !== 1 ? "s" : ""} excluded
                from forecast total
              </p>
            </div>
            {inactiveExpanded ? (
              <ChevronDown className="w-4 h-4 text-[var(--text-quaternary)] shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-[var(--text-quaternary)] shrink-0" />
            )}
          </button>

          {inactiveExpanded && (
            <div className="overflow-x-auto border-t border-[var(--border-tertiary)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-tertiary)] bg-[var(--bg-secondary\_subtle)]">
                    <th className="text-left px-6 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
                      Vendor
                    </th>
                    {monthColLabels.map((label, i) => (
                      <th
                        key={i}
                        className="text-right px-4 py-3 text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide whitespace-nowrap"
                      >
                        {i === 0 ? "3 Months Ago" : i === 1 ? "2 Months Ago" : "Last Month"}
                        <span className="block font-normal normal-case text-[var(--text-quaternary)]">
                          {label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-tertiary)]">
                  {data.inactiveVendors.map((f) => (
                    <tr key={f.vendor} className="hover:bg-[var(--bg-primary\_hover)] transition-colors">
                      <td className="px-6 py-3 font-medium text-[var(--text-tertiary)]">{f.vendor}</td>
                      {displayMonths(f).map((m, i) => (
                        <td key={i} className="px-4 py-3 text-right tabular-nums text-[var(--text-quaternary)]">
                          {m.amount > 0 ? (
                            formatCurrency(m.amount)
                          ) : (
                            <span className="text-[var(--text-disabled)]">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
