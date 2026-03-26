"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ForecastResult } from "@/types";
import { formatCurrency } from "@/lib/utils";

export function SpendForecastSection() {
  const [data, setData] = useState<ForecastResult | null>(null);

  useEffect(() => {
    fetch("/api/forecast")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => { if (json) setData(json); })
      .catch(() => {});
  }, []);

  if (!data) return null;

  const top5 = data.forecasts.slice(0, 5);
  const max = top5[0]?.forecastedAmount || 1;

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Spend Forecast — Next Month
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{data.nextMonthName}</p>
        </div>
        <Link
          href="/forecasting"
          className="flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 transition-colors"
        >
          View full forecast
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>

      {/* Projected total */}
      <div className="rounded-xl bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-100 dark:border-cyan-900/40 px-5 py-4">
        <p className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 uppercase tracking-wide mb-1">
          Projected Total
        </p>
        <p className="text-3xl font-bold tracking-tight" style={{ color: "#00d4ff" }}>
          {formatCurrency(data.totalForecast)}
        </p>
      </div>

      {/* Top 5 vendor bars */}
      {top5.length > 0 && (
        <div className="space-y-2.5">
          {top5.map((f) => (
            <div key={f.vendor} className="flex items-center gap-3">
              <span className="w-28 shrink-0 text-xs text-slate-600 dark:text-slate-400 truncate text-right">
                {f.vendor}
              </span>
              <div className="flex-1 h-3.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(f.forecastedAmount / max) * 100}%`,
                    backgroundColor: "#22d3ee",
                    transition: "width 0.5s",
                  }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                {formatCurrency(f.forecastedAmount)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Note */}
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Based on average of last 3 months · includes paid and pending invoices
      </p>
    </div>
  );
}
