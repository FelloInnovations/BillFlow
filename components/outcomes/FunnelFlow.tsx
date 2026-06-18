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

export function FunnelFlow({ stages }: { stages: FunnelStage[] }) {
  return (
    <div className="rounded-xl border bg-card p-6 mb-6">
      <div className="flex items-start justify-between gap-2 overflow-x-auto">
        {stages.map((stage, index) => (
          <React.Fragment key={stage.label}>
            <div className="flex flex-col items-center min-w-[80px] flex-shrink-0">
              {stage.isMonetary ? (
                <span className="text-[#FF725C] text-3xl font-bold tracking-tight">{stage.displayValue}</span>
              ) : (
                <span className="text-foreground text-3xl font-bold tracking-tight">{stage.displayValue}</span>
              )}
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mt-1">
                {stage.label}
              </span>
            </div>
            {index < stages.length - 1 && (
              <div className="flex flex-col items-center justify-start pt-3 flex-shrink-0 min-w-[60px]">
                <div className="flex items-center gap-0.5 w-full">
                  <div className="h-px bg-border flex-1" />
                  <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                </div>
                {stages[index + 1].conversionFromPrev != null && (
                  <span className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
                    {(stages[index + 1].conversionFromPrev! * 100).toFixed(1)}%
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
