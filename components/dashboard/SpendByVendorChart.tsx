"use client";

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

interface Props {
  data: { vendor: string; total: number }[];
}

function shortName(vendor: string) {
  return vendor.length > 13 ? vendor.slice(0, 12) + "…" : vendor;
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) => {
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

export function SpendByVendorChart({ data }: Props) {
  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-5">Spend by Vendor</h3>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 0, right: 8, left: 0, bottom: 48 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2535" vertical={false} />
          <XAxis
            dataKey="vendor"
            tickFormatter={shortName}
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            angle={-38}
            textAnchor="end"
            interval={0}
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
          <Tooltip content={<CustomTooltip />} cursor={{ fill: "#1e2535", radius: 4 }} />
          <Bar dataKey="total" radius={[4, 4, 0, 0]} fill="#6366f1" opacity={0.8} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
