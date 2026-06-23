"use client";

import { useState, useRef } from "react";
import { formatCurrency } from "@/lib/utils";

interface Props {
  data: { vendor: string; total: number }[];
  vendorProjects: Record<string, string[]>;
}

function getVendorBarColor(index: number, total: number): string {
  const minOpacity = 0.15;
  const maxOpacity = 1.0;
  const opacity = maxOpacity - (index / Math.max(total - 1, 1)) * (maxOpacity - minOpacity);
  const g = Math.round(255 - (255 - 114) * opacity);
  const b = Math.round(255 - (255 - 92) * opacity);
  return `rgb(255, ${g}, ${b})`;
}

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
    <div ref={containerRef} className="rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm p-6 flex flex-col">
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">
        Spend by Vendor{" "}
        <span className="text-[var(--text-quaternary)] font-normal">(last 12 months)</span>
      </h3>
      <p className="text-xs text-[var(--text-quaternary)] mb-4">{sorted.length} vendors</p>

      <div
        className="overflow-y-auto max-h-72 space-y-2.5 pr-2"
        style={{ scrollbarWidth: "thin", scrollbarColor: "var(--bg-brand-solid) var(--bg-secondary)" }}
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
              <span className="w-28 shrink-0 text-xs text-[var(--text-tertiary)] truncate text-right">
                {vendor}
              </span>

              <div className="flex-1 h-4 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-tertiary)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${(total / max) * 100}%`,
                    backgroundColor: getVendorBarColor(i, sorted.length),
                    transition: "width 0.5s",
                  }}
                />
              </div>

              <div className="w-28 shrink-0 text-right">
                <p className="text-xs font-semibold text-[var(--text-primary)] leading-tight tabular-nums">
                  {total > 0 ? formatCurrency(total) : "—"}
                </p>
                <p className="text-[10px] text-[var(--text-quaternary)] leading-tight">
                  {total > 0 ? `${pct}%` : "no spend"}
                </p>
              </div>
            </div>
          );
        })}

        {sorted.length === 0 && (
          <p className="text-sm text-[var(--text-quaternary)] text-center py-8">No data</p>
        )}
      </div>

      {tooltip && (
        <div
          className="fixed z-50 rounded-xl shadow-xl px-3 py-2.5 min-w-44 pointer-events-none"
          style={{ left: tooltip.x, top: tooltip.y, backgroundColor: "var(--bg-primary-solid)", color: "white" }}
        >
          <p className="text-xs font-semibold mb-1.5">{tooltip.vendor}</p>
          {tooltip.projects.length > 0 && (
            <>
              <p className="text-[10px] uppercase tracking-wider mb-1" style={{ color: "rgba(255,255,255,0.5)" }}>Used in</p>
              <ul className="space-y-0.5">
                {tooltip.projects.map((p) => (
                  <li key={p} className="text-xs flex items-center gap-1.5" style={{ color: "rgba(255,255,255,0.85)" }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--bg-brand-solid)" }} />
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
