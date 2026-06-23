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

function MomBadge({ filteredData }: { filteredData: { month: string; value: number }[] }) {
  const lastVal = filteredData[filteredData.length - 1]?.value ?? 0;
  const prevVal = filteredData[filteredData.length - 2]?.value ?? 0;

  if (filteredData.length < 2) return null;
  if (lastVal === 0) return <span className="text-xs text-[var(--text-quaternary)] font-medium">—</span>;
  if (prevVal === 0) return null;

  const momPct = ((lastVal - prevVal) / prevVal) * 100;

  if (Math.abs(momPct) >= 99) return <span className="text-xs text-[var(--text-quaternary)] font-medium">—</span>;

  return (
    <span className={cn(
      "text-xs font-medium px-1.5 py-0.5 rounded-full",
      momPct >= 0
        ? "bg-[var(--bg-success-primary)] text-[var(--text-success-primary)]"
        : "bg-[var(--bg-error-primary)] text-[var(--text-error-primary)]",
    )}>
      {momPct >= 0 ? "↑" : "↓"} {Math.abs(momPct).toFixed(0)}%
    </span>
  );
}

function TrendChartCard({ chart, scope }: { chart: TrendChartData; scope: string }) {
  const filteredData = filterDataByScope(chart.data, scope);
  const scopeTotal = filteredData.reduce((s, d) => s + d.value, 0);
  const displayScopeTotal = chart.isMonetary
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(scopeTotal)
    : scopeTotal.toLocaleString();

  const chartData = filteredData.map((d) => ({ month: formatMonthLabel(d.month), value: d.value }));

  return (
    <div className="rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-primary)] shadow-sm p-4 flex flex-col">
      <div className="flex items-start justify-between mb-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-[var(--text-tertiary)] block">
          {chart.label}
        </span>
        <MomBadge filteredData={filteredData} />
      </div>
      <div className="text-xl font-semibold text-[var(--text-primary)] mb-2">{displayScopeTotal}</div>
      <div className="flex-1 min-h-[90px] mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 4, bottom: 8 }}>
            <defs>
              <linearGradient id={`fill-${chart.metricKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--bg-brand-solid)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--bg-brand-solid)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--bg-brand-solid)"
              strokeWidth={2}
              fill={`url(#fill-${chart.metricKey})`}
              dot={false}
              activeDot={{ r: 3, fill: "var(--bg-brand-solid)" }}
              isAnimationActive={false}
            />
            <XAxis dataKey="month" hide />
            <YAxis hide />
            <Tooltip
              content={({ active, payload, label }: { active?: boolean; payload?: { value?: number }[]; label?: string }) => {
                if (!active || !payload?.length) return null;
                const val = payload[0].value ?? 0;
                return (
                  <div className="rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs shadow-md">
                    <div className="text-[var(--text-tertiary)] mb-0.5">{label}</div>
                    <div className="font-semibold text-[var(--text-primary)]">
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
