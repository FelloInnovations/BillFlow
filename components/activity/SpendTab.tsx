"use client";

import React, { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ChevronDown, ChevronUp, ChevronRight, RefreshCw } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { ActivityData, ActivityKeyData } from "@/types";
import type { SyncResult } from "./ActivityClient";

const KEY_COLORS = [
  "#6366f1", "#f59e0b", "#10b981", "#f43f5e",
  "#3b82f6", "#8b5cf6", "#ec4899", "#14b8a6",
  "#f97316", "#06b6d4",
];

function formatMonth(m: string) {
  const [y, mo] = m.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[parseInt(mo) - 1]} '${y.slice(2)}`;
}

function Sparkline({ data, width = 56, height = 20 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const trending = data[data.length - 1] > data[0];
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={trending ? "#f97316" : "#10b981"}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

interface SpendTabProps {
  activity: ActivityData;
  monthRange: 3 | 6 | 12;
  setMonthRange: (n: 3 | 6 | 12) => void;
  onSync: () => Promise<void>;
  syncing: boolean;
  syncResult: SyncResult;
  syncDisabled: boolean;
}

type SortCol = "project" | "thisMonth" | "pctTotal" | "avgMonth" | "total";
type SortDir = "asc" | "desc";

export function SpendTab({ activity, monthRange, setMonthRange, onSync, syncing, syncResult, syncDisabled }: SpendTabProps) {
  const [chartView, setChartView] = useState<"key" | "day">("key");
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState(false);
  const [sortBy, setSortBy] = useState<SortCol>("thisMonth");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);

  const currentMonth = useMemo(() => new Date().toISOString().substring(0, 7), []);

  const cutoffMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthRange + 1);
    return d.toISOString().substring(0, 7);
  }, [monthRange]);

  const visibleMonths = useMemo(
    () => activity.months.filter(m => m >= cutoffMonth),
    [activity.months, cutoffMonth]
  );

  const periodLabel = useMemo(() => {
    if (!visibleMonths.length) return "";
    return `${formatMonth(visibleMonths[0])} – ${formatMonth(visibleMonths[visibleMonths.length - 1])}`;
  }, [visibleMonths]);

  const allTotal = useMemo(() => activity.keys.reduce((s, k) => s + k.total, 0), [activity.keys]);

  const periodTotal = useMemo(() => {
    return activity.keys.reduce((sum, k) => {
      return sum + k.monthly
        .filter(m => m.month >= cutoffMonth)
        .reduce((s, m) => s + m.spend, 0);
    }, 0);
  }, [activity.keys, cutoffMonth]);

  const prevMonthTotal = useMemo(() => {
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    const prevStr = prev.toISOString().substring(0, 7);
    return activity.keys.reduce((sum, k) => {
      const m = k.monthly.find(x => x.month === prevStr);
      return sum + (m?.spend ?? 0);
    }, 0);
  }, [activity.keys]);

  const currMonthTotal = useMemo(
    () => activity.keys.reduce((s, k) => s + k.current_month_spend, 0),
    [activity.keys]
  );

  const pctChange = prevMonthTotal > 0
    ? ((currMonthTotal - prevMonthTotal) / prevMonthTotal) * 100
    : null;

  const activeKeys = useMemo(
    () => activity.keys.filter(k => showInactive || k.total > 0),
    [activity.keys, showInactive]
  );

  const visibleChartKeys = useMemo(
    () => activeKeys.filter(k => !hiddenKeys.has(k.key_name)),
    [activeKeys, hiddenKeys]
  );

  const chartData = useMemo(() => {
    return visibleMonths.map(month => {
      const entry: Record<string, string | number> = { month: formatMonth(month) };
      for (const k of visibleChartKeys) {
        const m = k.monthly.find(x => x.month === month);
        entry[k.key_name] = m?.spend ?? 0;
      }
      return entry;
    });
  }, [visibleMonths, visibleChartKeys]);

  const chartPeriodTotal = useMemo(() => {
    return visibleChartKeys.reduce((sum, k) => {
      return sum + k.monthly
        .filter(m => m.month >= cutoffMonth)
        .reduce((s, m) => s + m.spend, 0);
    }, 0);
  }, [visibleChartKeys, cutoffMonth]);

  function toggleKey(keyName: string) {
    setHiddenKeys(prev => {
      const next = new Set(prev);
      if (next.has(keyName)) next.delete(keyName);
      else next.add(keyName);
      return next;
    });
  }

  function toggleSort(col: SortCol) {
    if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortBy(col); setSortDir("desc"); }
  }

  function SortIcon({ col }: { col: SortCol }) {
    if (sortBy !== col) return <ChevronDown className="w-3 h-3 text-slate-300 dark:text-slate-600" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-indigo-500" />
      : <ChevronDown className="w-3 h-3 text-indigo-500" />;
  }

  function sortKeys(keys: ActivityKeyData[]) {
    return [...keys].sort((a, b) => {
      let va: number | string = 0;
      let vb: number | string = 0;
      if (sortBy === "project") { va = a.project_name; vb = b.project_name; }
      else if (sortBy === "thisMonth") { va = a.current_month_spend; vb = b.current_month_spend; }
      else if (sortBy === "pctTotal") { va = allTotal ? a.total / allTotal : 0; vb = allTotal ? b.total / allTotal : 0; }
      else if (sortBy === "avgMonth") { va = a.avg; vb = b.avg; }
      else if (sortBy === "total") { va = a.total; vb = b.total; }
      if (typeof va === "string" && typeof vb === "string")
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }

  const tableActiveKeys = useMemo(
    () => sortKeys(activity.keys.filter(k => k.total > 0 || k.current_month_spend > 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity.keys, sortBy, sortDir, allTotal]
  );

  const tableInactiveKeys = useMemo(
    () => sortKeys(activity.keys.filter(k => k.total === 0 && k.current_month_spend === 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity.keys, sortBy, sortDir]
  );

  function statusDot(k: ActivityKeyData) {
    if (k.current_month_spend > 0) return "bg-emerald-500";
    if (k.total > 0) return "bg-amber-400";
    return "bg-slate-300 dark:bg-slate-600";
  }

  function shortModel(m: string) {
    return m.includes("/") ? m.split("/").slice(1).join("/") : m;
  }

  function renderRow(k: ActivityKeyData) {
    const isExpanded = expandedRow === k.key_name;
    const pct = allTotal > 0 ? (k.total / allTotal) * 100 : 0;
    const sparkData = k.monthly
      .filter(m => m.month >= cutoffMonth)
      .map(m => m.spend);
    const modelList = k.models ?? [];
    const shownModels = modelList.slice(0, 2).map(shortModel);
    const extraModels = modelList.length > 2 ? modelList.length - 2 : 0;

    const rangeMonths = k.monthly.filter(m => m.month >= cutoffMonth);

    return (
      <React.Fragment key={k.key_name}>
        <tr
          onClick={() => setExpandedRow(isExpanded ? null : k.key_name)}
          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
        >
          <td className="px-5 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("w-2 h-2 rounded-full shrink-0", statusDot(k))} />
              <span className="font-medium text-slate-800 dark:text-slate-200 text-sm">{k.project_name}</span>
              {k.project_status && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 uppercase">
                  {k.project_status}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 ml-4 font-mono">{k.key_name}</p>
            <div className="flex flex-wrap gap-1 mt-1 ml-4">
              {modelList.length === 0 ? (
                <span className="text-[11px] text-slate-300 dark:text-slate-600">—</span>
              ) : (
                <>
                  {shownModels.map(m => (
                    <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-mono">
                      {m}
                    </span>
                  ))}
                  {extraModels > 0 && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                      +{extraModels} more
                    </span>
                  )}
                </>
              )}
            </div>
          </td>
          <td className="px-5 py-3 font-semibold text-indigo-600 dark:text-indigo-400 text-sm">
            {formatCurrency(k.current_month_spend)}
          </td>
          <td className="px-5 py-3 text-sm text-slate-600 dark:text-slate-300">
            {pct.toFixed(1)}%
          </td>
          <td className="px-5 py-3 text-sm text-slate-600 dark:text-slate-300">
            {formatCurrency(k.avg)}
          </td>
          <td className="px-5 py-3">
            <Sparkline data={sparkData} />
          </td>
          <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-200 text-sm">
            {formatCurrency(k.total)}
          </td>
        </tr>
        {isExpanded && (
          <tr key={`${k.key_name}-detail`} className="bg-slate-50 dark:bg-slate-800/30">
            <td colSpan={6} className="px-5 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                    Monthly Breakdown ({formatMonth(visibleMonths[0] ?? "")} – {formatMonth(visibleMonths[visibleMonths.length - 1] ?? "")})
                  </p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr>
                        <th className="text-left pb-1 text-slate-400 font-medium">Month</th>
                        <th className="text-right pb-1 text-slate-400 font-medium">Spend</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {rangeMonths.map(m => (
                        <tr key={m.month}>
                          <td className="py-1 text-slate-600 dark:text-slate-300">{formatMonth(m.month)}</td>
                          <td className="py-1 text-right font-mono text-slate-700 dark:text-slate-200">
                            {formatCurrency(m.spend)}
                          </td>
                        </tr>
                      ))}
                      {rangeMonths.length === 0 && (
                        <tr><td colSpan={2} className="py-2 text-slate-400">No data in range</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">
                    Model Breakdown
                  </p>
                  {modelList.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500 italic">
                      Model-level detail available after activity sync — run snapshot-openrouter-usage to populate logs.
                    </p>
                  ) : (
                    <table className="w-full text-xs">
                      <thead>
                        <tr>
                          <th className="text-left pb-1 text-slate-400 font-medium">Model</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {modelList.map(m => (
                          <tr key={m}>
                            <td className="py-1 font-mono text-slate-600 dark:text-slate-300">{m}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  }

  const thCls = "px-5 py-3 text-left text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 select-none";

  return (
    <div className="space-y-5">
      {/* Total spend banner */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-0.5">
            Total this period
          </p>
          <p className="text-3xl font-bold text-slate-900 dark:text-white">
            {formatCurrency(periodTotal)}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{periodLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {pctChange !== null ? (
            <span
              className={cn(
                "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold",
                pctChange > 0
                  ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                  : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
              )}
            >
              {pctChange > 0 ? "↑" : "↓"} {Math.abs(pctChange).toFixed(1)}%
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-400">
              —
            </span>
          )}
          <p className="text-[11px] text-slate-400 dark:text-slate-500">vs prev month</p>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {([3, 6, 12] as const).map(n => (
            <button
              key={n}
              onClick={() => setMonthRange(n)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-semibold transition-all",
                monthRange === n
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              {n}M
            </button>
          ))}
        </div>

        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {(["key", "day"] as const).map(v => (
            <button
              key={v}
              onClick={() => setChartView(v)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-semibold transition-all capitalize",
                chartView === v
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              )}
            >
              {v === "key" ? "By Key" : "By Day"}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={e => setShowInactive(e.target.checked)}
            className="accent-indigo-600 rounded"
          />
          Show inactive
        </label>

        <div className="ml-auto flex items-center gap-2">
          {syncResult && (
            <span className={cn(
              "text-xs font-medium",
              syncResult.errors.length > 0 ? "text-amber-500 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
            )}>
              {syncResult.errors.length > 0
                ? `${syncResult.synced_keys} keys synced, ${syncResult.errors.length} error(s)`
                : `Synced ${syncResult.synced_keys} keys · ${syncResult.total_log_rows_written} rows`
              }
            </span>
          )}
          <button
            onClick={onSync}
            disabled={syncing || syncDisabled}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={cn("w-3 h-3", syncing && "animate-spin")} />
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>
      </div>

      {/* Chart card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {chartView === "key" ? "Monthly Spend by Key" : "Daily Spend"}
          </h3>
          {chartView === "key" && visibleMonths.length > 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              Visible total: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatCurrency(chartPeriodTotal)}</span>
            </span>
          )}
        </div>

        {chartView === "day" ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-sm text-slate-400 dark:text-slate-500 text-center max-w-sm">
              Daily granularity available after first activity sync — run snapshot-openrouter-usage to populate logs.
            </p>
          </div>
        ) : visibleMonths.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-sm text-slate-400 dark:text-slate-500">No usage data yet.</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={v => `$${v}`}
                  tick={{ fontSize: 11, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                  width={52}
                />
                <Tooltip
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  contentStyle={{
                    borderRadius: "0.75rem",
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                />
                {visibleChartKeys.map((k, i) => (
                  <Bar
                    key={k.key_name}
                    dataKey={k.key_name}
                    name={k.project_name}
                    stackId="stack"
                    fill={KEY_COLORS[activity.keys.findIndex(x => x.key_name === k.key_name) % KEY_COLORS.length]}
                    radius={i === visibleChartKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>

            {/* Clickable legend */}
            <div className="flex flex-wrap gap-2 mt-3">
              {activeKeys.map((k, i) => {
                const color = KEY_COLORS[activity.keys.findIndex(x => x.key_name === k.key_name) % KEY_COLORS.length];
                const hidden = hiddenKeys.has(k.key_name);
                return (
                  <button
                    key={k.key_name}
                    onClick={() => toggleKey(k.key_name)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                      hidden
                        ? "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-800/50 opacity-50"
                        : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900"
                    )}
                  >
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hidden ? "#94a3b8" : color }} />
                    {k.project_name}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Summary table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className={thCls} onClick={() => toggleSort("project")}>
                  <span className="flex items-center gap-1">Project <SortIcon col="project" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort("thisMonth")}>
                  <span className="flex items-center gap-1">This Month <SortIcon col="thisMonth" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort("pctTotal")}>
                  <span className="flex items-center gap-1">% of Total <SortIcon col="pctTotal" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort("avgMonth")}>
                  <span className="flex items-center gap-1">Avg/Month <SortIcon col="avgMonth" /></span>
                </th>
                <th className={cn(thCls, "cursor-default hover:text-slate-400")}>Trend</th>
                <th className={thCls} onClick={() => toggleSort("total")}>
                  <span className="flex items-center gap-1">Total <SortIcon col="total" /></span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
              {tableActiveKeys.map(k => renderRow(k))}
              {tableActiveKeys.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">
                    No active keys found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {tableInactiveKeys.length > 0 && (
          <div className="border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setInactiveExpanded(e => !e)}
              className="w-full flex items-center gap-2 px-5 py-3 text-xs font-semibold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
            >
              {inactiveExpanded
                ? <ChevronUp className="w-3.5 h-3.5" />
                : <ChevronRight className="w-3.5 h-3.5" />
              }
              Inactive Keys ({tableInactiveKeys.length})
            </button>
            {inactiveExpanded && (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                  {tableInactiveKeys.map(k => renderRow(k))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
