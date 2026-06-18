"use client";

import { cn } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface TrendChartData {
  label: string;
  metricKey: string;
  data: { month: string; value: number }[];
  totalValue: number;
  displayTotal: string;
  isMonetary?: boolean;
}

function getMonthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return getMonthKey(d);
}

function filterDataByScope(
  data: { month: string; value: number }[],
  scope: string,
): { month: string; value: number }[] {
  switch (scope) {
    case "this_month":
      return data.filter((d) => d.month === getMonthKey(new Date()));
    case "last_3_months":
      return data.filter((d) => d.month >= monthsAgo(2));
    case "last_6_months":
      return data.filter((d) => d.month >= monthsAgo(5));
    case "last_12_months":
      return data.filter((d) => d.month >= monthsAgo(11));
    case "all_time":
    default:
      return data;
  }
}

function formatMonthLabel(month: string): string {
  const [y, m] = month.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString("en-US", { month: "short" });
}

function TrendChartCard({ chart, scope }: { chart: TrendChartData; scope: string }) {
  const filteredData = filterDataByScope(chart.data, scope);
  const scopeTotal = filteredData.reduce((s, d) => s + d.value, 0);
  const displayScopeTotal = chart.isMonetary
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(scopeTotal)
    : scopeTotal.toLocaleString();

  const lastVal = filteredData[filteredData.length - 1]?.value ?? 0;
  const prevVal = filteredData[filteredData.length - 2]?.value ?? 0;
  const momPct = filteredData.length >= 2 && prevVal > 0
    ? ((lastVal - prevVal) / prevVal) * 100
    : null;

  const chartData = filteredData.map((d) => ({ month: formatMonthLabel(d.month), value: d.value }));

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-start justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {chart.label}
        </span>
        {momPct !== null && (
          <span className={cn(
            "text-xs font-medium px-1.5 py-0.5 rounded-full",
            momPct >= 0 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600",
          )}>
            {momPct >= 0 ? "↑" : "↓"} {Math.abs(momPct).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-foreground mb-3">{displayScopeTotal}</div>
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`fill-${chart.metricKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FF725C" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#FF725C" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke="#FF725C"
            strokeWidth={2}
            fill={`url(#fill-${chart.metricKey})`}
            dot={false}
            activeDot={{ r: 3, fill: "#FF725C" }}
            isAnimationActive={false}
          />
          <XAxis dataKey="month" hide />
          <YAxis hide />
          <Tooltip
            content={({ active, payload, label }: { active?: boolean; payload?: { value?: number }[]; label?: string }) => {
              if (!active || !payload?.length) return null;
              const val = payload[0].value ?? 0;
              return (
                <div className="rounded-lg border bg-popover px-2 py-1.5 text-xs shadow-md">
                  <div className="text-muted-foreground mb-0.5">{label}</div>
                  <div className="font-semibold text-foreground">
                    {chart.isMonetary
                      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(val)
                      : val.toLocaleString()}
                  </div>
                </div>
              );
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TrendChartsGrid({ charts, scope }: { charts: TrendChartData[]; scope: string }) {
  if (!charts.length) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
      {charts.map((chart) => (
        <TrendChartCard key={chart.metricKey} chart={chart} scope={scope} />
      ))}
    </div>
  );
}
