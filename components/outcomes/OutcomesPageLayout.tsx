"use client";

import React, { useState } from "react";
import { RefreshCw, ChevronDown } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { FunnelFlow } from "./FunnelFlow";
import { TrendChartsGrid } from "./TrendChartsGrid";
import type { FunnelStage } from "./FunnelFlow";
import type { TrendChartData } from "./TrendChartsGrid";

export interface MonthlyRow {
  month: string;
  [key: string]: string | number;
}

export interface MonthlyColumn {
  key: string;
  label: string;
  isMonetary?: boolean;
}

interface OutcomesPageLayoutProps {
  title: string;
  subtitle: string;
  lastSynced: string;
  scope: string;
  onScopeChange: (scope: string) => void;
  scopeOptions: { label: string; value: string }[];
  funnelStages: FunnelStage[];
  trendCharts: TrendChartData[];
  monthlyData: MonthlyRow[];
  monthlyColumns: MonthlyColumn[];
  onSyncNow: () => void;
  onBackfill: () => void;
  backfillRunning: boolean;
  syncingNow?: boolean;
  projectSpecificSection?: React.ReactNode;
  tabs?: React.ReactNode;
  extraActions?: React.ReactNode;
}

export function OutcomesPageLayout({
  title,
  subtitle,
  lastSynced,
  scope,
  onScopeChange,
  scopeOptions,
  funnelStages,
  trendCharts,
  monthlyData,
  monthlyColumns,
  onSyncNow,
  onBackfill,
  backfillRunning,
  syncingNow = false,
  projectSpecificSection,
  tabs,
  extraActions,
}: OutcomesPageLayoutProps) {
  const [tableExpanded, setTableExpanded] = useState(false);

  return (
    <div className="flex-1 min-h-screen bg-[var(--bg-primary)] p-4 md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{title}</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            {subtitle}
            {lastSynced && (
              <span className="ml-2">· Synced {lastSynced}</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-[var(--border-tertiary)] overflow-hidden text-sm font-semibold">
            {scopeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => onScopeChange(opt.value)}
                className={cn(
                  "px-3 py-2 transition-colors",
                  scope === opt.value
                    ? "text-white"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]",
                )}
                style={scope === opt.value ? { backgroundColor: "var(--bg-brand-solid)" } : undefined}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={onSyncNow}
            disabled={syncingNow}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-tertiary)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", syncingNow && "animate-spin")} />
            {syncingNow ? "Syncing…" : "Sync Now"}
          </button>
          <button
            onClick={onBackfill}
            className={cn(
              "px-3 py-2 rounded-lg border text-sm font-semibold transition-colors",
              backfillRunning
                ? "border-[var(--border-warning)] text-[var(--text-warning-primary)] bg-[var(--bg-warning-primary)] cursor-default"
                : "border-[var(--border-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)]",
            )}
          >
            {backfillRunning ? "Backfill Running…" : "Backfill"}
          </button>
          {extraActions}
        </div>
      </div>

      {tabs}

      <FunnelFlow stages={funnelStages} />

      {projectSpecificSection}

      {trendCharts.length > 0 && (
        <div className="flex items-center gap-3 mt-8 mb-4">
          <h3 className="text-xs font-semibold text-[var(--text-quaternary)] uppercase tracking-widest shrink-0">Trends</h3>
          <div className="flex-1 h-px bg-[var(--border-tertiary)]" />
        </div>
      )}
      <TrendChartsGrid charts={trendCharts} scope={scope} />

      {monthlyData.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setTableExpanded((v) => !v)}
            className="flex items-center gap-2 text-xs font-medium text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] uppercase tracking-widest transition-colors mt-8 mb-3"
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform duration-200",
                tableExpanded && "rotate-180",
              )}
            />
            {tableExpanded ? "Hide" : "Show"} monthly breakdown
          </button>
          {tableExpanded && (
            <div className="rounded-lg border border-[var(--border-tertiary)] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-tertiary)] bg-[var(--bg-secondary)]">
                      <th className="text-left px-5 py-3 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-widest whitespace-nowrap">
                        Month
                      </th>
                      {monthlyColumns.map((col) => (
                        <th
                          key={col.key}
                          className="text-right px-4 py-3 text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-widest whitespace-nowrap"
                        >
                          {col.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-tertiary)]">
                    {monthlyData.map((row, idx) => (
                      <tr key={row.month} className={cn("hover:bg-[var(--bg-secondary\_subtle)] transition-colors", idx % 2 === 0 ? "bg-[var(--bg-primary)]" : "bg-[var(--bg-secondary\_subtle)]")}>
                        <td className="px-5 py-3 font-medium text-[var(--text-primary)] whitespace-nowrap">
                          {row.month}
                        </td>
                        {monthlyColumns.map((col) => {
                          const val = (row[col.key] as number) ?? 0;
                          return (
                            <td
                              key={col.key}
                              className="text-right px-4 py-3 tabular-nums text-[var(--text-secondary)] whitespace-nowrap"
                            >
                              {col.isMonetary ? formatCurrency(val) : val.toLocaleString()}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
