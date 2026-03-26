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
      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
        <TrendingUp className="w-3.5 h-3.5" /> ↑
      </span>
    );
  if (trend === "down")
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
        <TrendingDown className="w-3.5 h-3.5" /> ↓
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-bold text-slate-400">
      <Minus className="w-3.5 h-3.5" /> →
    </span>
  );
}

function StatCard({
  title,
  value,
  sub,
  accent = "indigo",
}: {
  title: string;
  value: string;
  sub?: string;
  accent?: "cyan" | "indigo" | "slate";
}) {
  const accentClass = {
    cyan: "border-t-cyan-400",
    indigo: "border-t-indigo-400",
    slate: "border-t-slate-400",
  }[accent];

  return (
    <div
      className={cn(
        "rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 border-t-4 shadow-sm p-5",
        accentClass
      )}
    >
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">{title}</p>
      <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white leading-none">
        {value}
      </p>
      {sub && <p className="text-xs mt-1.5 text-slate-400 dark:text-slate-500">{sub}</p>}
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
            <span className="w-32 shrink-0 text-xs text-slate-600 dark:text-slate-400 truncate text-right">
              {f.vendor}
            </span>
            <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(f.forecastedAmount / max) * 100}%`,
                  backgroundColor: barColor(f.trend),
                }}
              />
            </div>
            <span className="w-24 shrink-0 text-right text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
              {formatCurrency(f.forecastedAmount)}
            </span>
          </div>
        ))}
      </div>

      {tooltip && (
        <div
          className="fixed z-50 bg-slate-900 text-white rounded-xl shadow-xl px-3 py-2.5 pointer-events-none min-w-44"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="text-xs font-bold mb-1">{tooltip.vendor}</p>
          <p className="text-sm font-bold text-cyan-400">{formatCurrency(tooltip.amount)}</p>
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

  // Column headers — oldest to newest (for display: 3 months ago → last month)
  const now = new Date();
  const monthColLabels = [-3, -2, -1].map((offset) => {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  });

  // Display rows with months in oldest→newest order
  const displayMonths = (f: VendorForecast) => [f.last3Months[2], f.last3Months[1], f.last3Months[0]];

  return (
    <div className="pt-10 px-7 pb-7 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Spend Forecast</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            Projected spend for {data.nextMonthName} based on last 3 months average
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap">
            {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · Updated {lastUpdated}
          </span>
          <button
            onClick={refresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 transition-colors shadow-sm"
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
          accent="indigo"
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
          "rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-opacity",
          loading && "opacity-60"
        )}
      >
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Vendor Forecast Breakdown</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
            Based on 3-month rolling average · includes paid and pending invoices
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Vendor
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                  3 Months Ago
                  <span className="block font-normal normal-case text-slate-400 dark:text-slate-500">
                    {monthColLabels[0]}
                  </span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                  2 Months Ago
                  <span className="block font-normal normal-case text-slate-400 dark:text-slate-500">
                    {monthColLabels[1]}
                  </span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                  Last Month
                  <span className="block font-normal normal-case text-slate-400 dark:text-slate-500">
                    {monthColLabels[2]}
                  </span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wide">
                  Forecasted
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Trend
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.forecasts.map((f) => (
                <tr key={f.vendor} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="px-6 py-3 font-medium text-slate-800 dark:text-slate-200">{f.vendor}</td>
                  {displayMonths(f).map((m, i) => (
                    <td key={i} className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">
                      {m.amount > 0 ? (
                        formatCurrency(m.amount)
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-cyan-600 dark:text-cyan-400">
                    {formatCurrency(f.forecastedAmount)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <TrendBadge trend={f.trend} />
                  </td>
                </tr>
              ))}
              {data.forecasts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-sm text-slate-400 dark:text-slate-500">
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
            "rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-6 transition-opacity",
            loading && "opacity-60"
          )}
        >
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
            Forecasted Spend by Vendor
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">
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
            "rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden transition-opacity",
            loading && "opacity-60"
          )}
        >
          <button
            onClick={() => setInactiveExpanded((x) => !x)}
            className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
          >
            <div>
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">
                Inactive vendors — no invoices in last 3 months
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {data.inactiveVendors.length} vendor{data.inactiveVendors.length !== 1 ? "s" : ""} excluded
                from forecast total
              </p>
            </div>
            {inactiveExpanded ? (
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            )}
          </button>

          {inactiveExpanded && (
            <div className="overflow-x-auto border-t border-slate-100 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Vendor
                    </th>
                    {monthColLabels.map((label, i) => (
                      <th
                        key={i}
                        className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap"
                      >
                        {i === 0 ? "3 Months Ago" : i === 1 ? "2 Months Ago" : "Last Month"}
                        <span className="block font-normal normal-case text-slate-400 dark:text-slate-500">
                          {label}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.inactiveVendors.map((f) => (
                    <tr key={f.vendor} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-6 py-3 font-medium text-slate-500 dark:text-slate-400">{f.vendor}</td>
                      {displayMonths(f).map((m, i) => (
                        <td key={i} className="px-4 py-3 text-right tabular-nums text-slate-400 dark:text-slate-500">
                          {m.amount > 0 ? (
                            formatCurrency(m.amount)
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
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
