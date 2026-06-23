"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

interface Props {
  data: { month: string; total: number }[];
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[var(--bg-primary)] border border-[var(--border-tertiary)] rounded-lg shadow-lg px-3.5 py-2.5">
      <p className="text-xs text-[var(--text-tertiary)] mb-1">{label}</p>
      <p className="text-sm font-semibold text-[var(--text-primary)]">
        {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(payload[0].value)}
      </p>
    </div>
  );
};

export function MonthlyTrendChart({ data }: Props) {
  return (
    <div className="rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm p-6">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-5">Monthly Spend Trend <span className="text-[var(--text-quaternary)] font-normal">(invoices + API usage)</span></h3>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff725c" stopOpacity={0.1} />
              <stop offset="100%" stopColor="#ff725c" stopOpacity={0} />
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
            stroke="#ff725c"
            strokeWidth={2}
            fill="url(#areaGrad)"
            dot={false}
            activeDot={{ r: 4, fill: "#ff725c", stroke: "#fff", strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
