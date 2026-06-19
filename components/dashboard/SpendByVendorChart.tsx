"use client";

import { useState, useRef } from "react";
import { formatCurrency } from "@/lib/utils";

interface Props {
  data: { vendor: string; total: number }[];
  vendorProjects: Record<string, string[]>;
}

const BAR_COLORS = [
  "#FF725C",
  "#FF8C7A",
  "#FFA599",
  "#FFBEB1",
  "#FFD7CF",
  "#FFEDE9",
];

interface TooltipState {
  vendor: string;
  projects: string[];
  x: number;
  y: number;
}

export function SpendByVendorChart({ data, vendorProjects }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const sorted = [...data].sort((a, b) => b.total - a.total);
  const max = sorted.find((d) => d.total > 0)?.total ?? 1;
  const grandTotal = sorted.reduce((s, d) => s + d.total, 0);

  function handleMouseEnter(e: React.MouseEvent, vendor: string) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltip({
      vendor,
      projects: vendorProjects[vendor.toLowerCase()] ?? [],
      x: rect.right + 8,
      y: rect.top,
    });
  }

  return (
    <div ref={containerRef} className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-6 flex flex-col">
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
        Spend by Vendor{" "}
        <span className="text-slate-400 dark:text-slate-500 font-normal">(last 12 months)</span>
      </h3>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">{sorted.length} vendors</p>

      <div
        className="overflow-y-auto max-h-72 space-y-2.5 pr-2"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#FF725C #f1f5f9" }}
      >
        {sorted.map(({ vendor, total }, i) => {
          const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;

          return (
            <div
              key={vendor}
              className="flex items-center gap-3"
              onMouseEnter={(e) => handleMouseEnter(e, vendor)}
              onMouseLeave={() => setTooltip(null)}
            >
              {/* Vendor name */}
              <span className="w-28 shrink-0 text-xs text-slate-600 dark:text-slate-400 truncate text-right">
                {vendor}
              </span>

              {/* Bar */}
              <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(total / max) * 100}%`,
                    backgroundColor: BAR_COLORS[i % BAR_COLORS.length],
                    transition: "width 0.5s",
                  }}
                />
              </div>

              {/* Amount + % stacked */}
              <div className="w-28 shrink-0 text-right">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-tight tabular-nums">
                  {total > 0 ? formatCurrency(total) : "—"}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                  {total > 0 ? `${pct}%` : "no spend"}
                </p>
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">No data</p>
        )}
      </div>

      {/* Tooltip rendered outside scroll container, fixed to viewport */}
      {tooltip && (
        <div
          className="fixed z-50 bg-slate-900 text-white rounded-xl shadow-xl px-3 py-2.5 min-w-44 pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <p className="text-xs font-bold mb-1.5">{tooltip.vendor}</p>
          {tooltip.projects.length > 0 && (
            <>
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Used in</p>
              <ul className="space-y-0.5">
                {tooltip.projects.map((p) => (
                  <li key={p} className="text-xs text-slate-200 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-salmon-400 shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
