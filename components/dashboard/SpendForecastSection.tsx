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

  const top3 = data.forecasts.slice(0, 3);

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60">
      {/* Label */}
      <span className="text-xs font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
        Forecast · {data.nextMonthName}
      </span>

      {/* Divider */}
      <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 shrink-0" />

      {/* Projected total */}
      <span className="text-[18px] font-bold tabular-nums shrink-0" style={{ color: "#00d4ff" }}>
        {formatCurrency(data.totalForecast)}
      </span>

      {/* Vendor pills */}
      {top3.length > 0 && (
        <>
          <span className="w-px h-4 bg-slate-200 dark:bg-slate-700 shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            {top3.map((f, i) => (
              <span key={f.vendor}>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-600 dark:text-slate-300">{f.vendor}</span>
                  {" "}{fmt(f.forecastedAmount)}
                </span>
                {i < top3.length - 1 && (
                  <span className="text-slate-300 dark:text-slate-600 mx-1">·</span>
                )}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Spacer */}
      <span className="flex-1" />

      {/* Link */}
      <Link
        href="/forecasting"
        className="flex items-center gap-1 text-xs font-semibold text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors whitespace-nowrap shrink-0"
      >
        View full forecast
        <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
