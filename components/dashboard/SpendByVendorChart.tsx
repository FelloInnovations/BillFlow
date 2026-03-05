"use client";

import { formatCurrency } from "@/lib/utils";

interface Props {
  data: { vendor: string; total: number }[];
}

// Muted tonal palette: steps from slate-blue → indigo → violet
const BAR_COLORS = [
  "#818cf8", // indigo-400
  "#6366f1", // indigo-500
  "#4f46e5", // indigo-600
  "#7c3aed", // violet-600
  "#8b5cf6", // violet-500
  "#a78bfa", // violet-400
  "#60a5fa", // blue-400
  "#3b82f6", // blue-500
  "#06b6d4", // cyan-500
  "#0ea5e9", // sky-500
];

export function SpendByVendorChart({ data }: Props) {
  const sorted = [...data].sort((a, b) => b.total - a.total);
  const max = sorted[0]?.total ?? 1;
  const grandTotal = sorted.reduce((s, d) => s + d.total, 0);

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-5">
        Spend by Vendor <span className="text-slate-400 dark:text-slate-500 font-normal">(last 12 months)</span>
      </h3>
      <div className="space-y-2.5">
        {sorted.map(({ vendor, total }, i) => (
          <div key={vendor} className="flex items-center gap-3">
            <span className="w-32 shrink-0 text-xs text-slate-600 dark:text-slate-400 truncate text-right">{vendor}</span>
            <div className="flex-1 h-5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(total / max) * 100}%`,
                  backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                  opacity: 0.85,
                }}
              />
            </div>
            <div className="w-28 shrink-0 text-right">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatCurrency(total)}</span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1">
                {grandTotal > 0 ? `${Math.round((total / grandTotal) * 100)}%` : ""}
              </span>
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">No data</p>
        )}
      </div>
    </div>
  );
}
