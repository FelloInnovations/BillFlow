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
    <div className="flex items-center gap-4 px-4 py-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-tertiary)]">
      <span className="text-xs font-medium text-[var(--text-quaternary)] whitespace-nowrap shrink-0">
        Forecast · {data.nextMonthName}
      </span>

      <span className="w-px h-4 bg-[var(--border-tertiary)] shrink-0" />

      <span className="text-[18px] font-semibold tabular-nums shrink-0 text-[var(--text-brand-primary)]">
        {formatCurrency(data.totalForecast)}
      </span>

      {top3.length > 0 && (
        <>
          <span className="w-px h-4 bg-[var(--border-tertiary)] shrink-0" />
          <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
            {top3.map((f, i) => (
              <span key={f.vendor}>
                <span className="text-xs text-[var(--text-tertiary)]">
                  <span className="font-medium text-[var(--text-secondary)]">{f.vendor}</span>
                  {" "}{fmt(f.forecastedAmount)}
                </span>
                {i < top3.length - 1 && (
                  <span className="text-[var(--text-quaternary)] mx-1">·</span>
                )}
              </span>
            ))}
          </div>
        </>
      )}

      <span className="flex-1" />

      <Link
        href="/forecasting"
        className="flex items-center gap-1 text-xs font-semibold text-[var(--text-brand-primary)] hover:opacity-80 transition-opacity whitespace-nowrap shrink-0"
      >
        View full forecast
        <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  );
}
