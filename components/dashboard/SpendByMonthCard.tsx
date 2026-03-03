"use client";

import { useState } from "react";
import { DollarSign, ChevronDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface Props {
  monthlyTrend: { month: string; total: number }[];
}

export function SpendByMonthCard({ monthlyTrend }: Props) {
  const sorted = [...monthlyTrend].reverse(); // most recent first
  const [selected, setSelected] = useState(sorted[0]?.month ?? "");

  const current = monthlyTrend.find((m) => m.month === selected);
  const amount = current?.total ?? 0;

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 border-t-4 border-t-indigo-500 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        {/* Month dropdown */}
        <div className="relative">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="appearance-none pr-6 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 bg-transparent border-none outline-none cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            {sorted.map((m) => (
              <option key={m.month} value={m.month}>
                {m.month}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-0 top-0.5 w-3.5 h-3.5 text-slate-400" />
        </div>

        <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-500">
          <DollarSign className="w-4 h-4" />
        </div>
      </div>

      <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
        {formatCurrency(amount)}
      </p>
      <p className="text-xs mt-1.5 text-slate-400 dark:text-slate-500">paid invoices</p>
    </div>
  );
}
