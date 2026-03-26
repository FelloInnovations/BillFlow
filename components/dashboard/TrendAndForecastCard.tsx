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
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg px-3.5 py-2.5">
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{label}</p>
      <p className="text-sm font-bold text-slate-900 dark:text-white">
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
      .then((json) => { if (json) setForecast(json); })
      .catch(() => {});
  }, []);

  const top3 = forecast?.forecasts.slice(0, 3) ?? [];

  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-6 flex flex-col">
      {/* Trend chart */}
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-5">
        Monthly Spend Trend{" "}
        <span className="text-slate-400 dark:text-slate-500 font-normal">(all invoices)</span>
      </h3>
      <ResponsiveContainer width="100%" height={185}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="areaGradTAF" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            width={44}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="total"
            stroke="#6366f1"
            strokeWidth={2}
            fill="url(#areaGradTAF)"
            dot={false}
            activeDot={{ r: 4, fill: "#6366f1", stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Divider */}
      <div className="border-t border-slate-100 dark:border-slate-800 mt-5 mb-4" />

      {/* Forecast section */}
      {forecast ? (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Forecast · {forecast.nextMonthName}
            </span>
            <Link
              href="/forecasting"
              className="flex items-center gap-1 text-xs font-semibold text-cyan-500 dark:text-cyan-400 hover:text-cyan-600 dark:hover:text-cyan-300 transition-colors"
            >
              View full forecast
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="flex items-baseline gap-3 flex-wrap">
            <span
              className="text-[20px] font-semibold tabular-nums leading-none"
              style={{ color: "#00d4ff" }}
            >
              {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
                forecast.totalForecast
              )}
            </span>
            {top3.length > 0 && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                {top3.map((f, i) => (
                  <span key={f.vendor}>
                    <span className="text-slate-500 dark:text-slate-400">{f.vendor}</span>{" "}
                    {fmt(f.forecastedAmount)}
                    {i < top3.length - 1 && (
                      <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
                    )}
                  </span>
                ))}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="h-10 flex items-center">
          <span className="text-xs text-slate-400 dark:text-slate-500">Loading forecast…</span>
        </div>
      )}
    </div>
  );
}
