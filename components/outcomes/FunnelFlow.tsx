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
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm p-4 md:p-6 mb-6">
      <div className="flex items-start justify-between gap-1 md:gap-2 overflow-x-auto pb-1">
        {stages.map((stage, index) => (
          <React.Fragment key={stage.label}>
            <div className="flex flex-col items-center min-w-[70px] flex-shrink-0">
              {stage.isMonetary ? (
                <span className="text-[#FF725C] text-2xl md:text-3xl font-bold tracking-tight">{stage.displayValue}</span>
              ) : (
                <span className="text-gray-900 text-2xl md:text-3xl font-bold tracking-tight">{stage.displayValue}</span>
              )}
              <span className="text-xs font-semibold uppercase tracking-widest text-gray-500 mt-1">
                {stage.label}
              </span>
            </div>
            {index < stages.length - 1 && (
              <div className="flex flex-col items-center justify-start pt-3 flex-shrink-0 min-w-[48px]">
                <div className="flex items-center gap-0.5 w-full">
                  <div className="h-px bg-gray-200 flex-1" />
                  <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                </div>
                {stages[index + 1].conversionFromPrev != null && (
                  <span className="text-xs font-medium text-gray-500 mt-1 whitespace-nowrap">
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
