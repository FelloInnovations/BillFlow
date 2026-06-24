"use client";

import React from "react";
import { ChevronRight } from "lucide-react";

export interface FunnelStage {
  label: string;
  value: number;
  displayValue: string;
  isMonetary?: boolean;
  conversionFromPrev?: number | null;
}

function formatConversion(rate: number | null | undefined): string | null {
  if (rate == null) return null;
  const pct = rate * 100;
  if (pct > 100) return ">100%";
  return `${pct.toFixed(1)}%`;
}

export function FunnelFlow({ stages }: { stages: FunnelStage[] }) {
  return (
    <div className="rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-primary)] shadow-sm p-4 md:p-6 mb-6">
      <div className="flex items-start justify-between gap-1 md:gap-2 overflow-x-auto pb-1">
        {stages.map((stage, index) => (
          <React.Fragment key={stage.label}>
            <div className="flex flex-col items-center min-w-[70px] flex-shrink-0">
              {stage.isMonetary ? (
                <span className="text-[var(--text-brand-primary)] text-xl md:text-2xl font-semibold tracking-tight">{stage.displayValue}</span>
              ) : (
                <span className="text-[var(--text-primary)] text-xl md:text-2xl font-semibold tracking-tight">{stage.displayValue}</span>
              )}
              <span className="text-xs font-semibold uppercase tracking-widest text-[var(--text-tertiary)] mt-1">
                {stage.label}
              </span>
            </div>
            {index < stages.length - 1 && (
              <div className="flex flex-col items-center justify-start pt-3 flex-shrink-0 min-w-[48px]">
                <div className="flex items-center gap-0.5 w-full">
                  <div className="h-px bg-[var(--border-tertiary)] flex-1" />
                  <ChevronRight className="h-4 w-4 text-[var(--text-quaternary)] flex-shrink-0" />
                </div>
                {formatConversion(stages[index + 1].conversionFromPrev) && (
                  <span className="text-xs font-medium text-[var(--text-tertiary)] mt-1 whitespace-nowrap">
                    {formatConversion(stages[index + 1].conversionFromPrev)}
                  </span>
                )}
              </div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
