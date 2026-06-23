"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { ForecastResult } from "@/types";

interface Props {
  data: { month: string; total: number }[];
}

const EMPTY_FORECAST: ForecastResult = {
  forecasts: [],
  inactiveVendors: [],
  totalForecast: 0,
  nextMonthName: "—",
  computedAt: "",
};

const CustomTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border-tertiary)] rounded-xl shadow-lg px-3.5 py-2.5">
      <p className="text-xs text-[var(--text-quaternary)] mb-1">{label}</p>
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(payload[0].value)}
      </p>
    </div>
  );
};

export function TrendAndForecastCard({ data }: Props) {
  const [forecast, setForecast] = useState<ForecastResult | null>(null);

  useEffect(() => {
    fetch("/api/forecast")
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setForecast(json ?? EMPTY_FORECAST))
      .catch(() => setForecast(EMPTY_FORECAST));
  }, []);

  const top3 = forecast?.forecasts.slice(0, 3) ?? [];

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm p-6 flex flex-col">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-5">
        Monthly Spend Trend{" "}
        <span className="text-[var(--text-quaternary)] font-normal">(invoices + API usage)</span>
      </h3>
      <ResponsiveContainer width="100%" height={185}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="areaGradTAF" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF725C" stopOpacity={0.12} />
              <stop offset="100%" stopColor="#FF725C" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-tertiary)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: "var(--text-quaternary)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "var(--text-quaternary)" }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            width={44}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#FF725C"
            strokeWidth={2}
            fill="url(#areaGradTAF)"
            dot={false}
            activeDot={{ r: 4, fill: "#FF725C", stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      <div className="border-t border-[var(--border-tertiary)] mt-5 mb-4" />

      {forecast ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--text-quaternary)]">
              Forecast · {forecast.nextMonthName}
            </span>
            <Link
              href="/forecasting"
              className="flex items-center gap-1 text-xs font-semibold text-[var(--text-brand-primary)] hover:opacity-80 transition-opacity"
            >
              View full forecast
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span className="text-[20px] font-semibold tabular-nums leading-none text-[var(--text-brand-primary)]">
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                forecast.totalForecast
              )}
            </span>
            {top3.length > 0 && (
              <span className="text-xs text-[var(--text-quaternary)]">
                {top3.map((f, i) => (
                  <span key={f.vendor}>
                    <span className="text-[var(--text-tertiary)]">{f.vendor}</span>{" "}
                    {fmt(f.forecastedAmount)}
                    {i < top3.length - 1 && (
                      <span className="mx-1.5 text-[var(--border-secondary)]">·</span>
                    )}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="h-10 flex items-center">
          <span className="text-xs text-[var(--text-quaternary)]">Loading forecast…</span>
        </div>
      )}
    </div>
  );
}
