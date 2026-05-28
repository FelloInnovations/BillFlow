"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import { ChevronDown, ChevronUp, ChevronRight, RefreshCw, Loader2 } from "lucide-react";
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

function formatDay(d: string) {
  const [, mo, dd] = d.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[parseInt(mo) - 1]} ${parseInt(dd)}`;
}

function formatDateShort(d: string) {
  const [, mo, dd] = d.split("-");
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[parseInt(mo) - 1]} ${parseInt(dd)}`;
}

function formatLastSync(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function TrendBadge({ trend }: { trend: "up" | "down" | "stable" | null }) {
  if (!trend) return (
    <span
      title="Trend available after 2 months of data"
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 cursor-help"
    >
      New
    </span>
  );
  if (trend === "up")
    return <span className="text-emerald-500 dark:text-emerald-400 font-bold text-base">↑</span>;
  if (trend === "down")
    return <span className="text-rose-500 dark:text-rose-400 font-bold text-base">↓</span>;
  return <span className="text-slate-400 dark:text-slate-500 font-bold text-base">→</span>;
}

interface KeyDetail {
  daily: { date: string; cost: number }[];
  models: {
    model: string; requests: number; prompt_tokens: number;
    completion_tokens: number; total_cost: number; avg_cost: number;
  }[];
}

interface DayData {
  days: Record<string, number | string>[];
  key_names: string[];
}

interface SpendTabProps {
  activity: ActivityData;
  monthRange: 3 | 6 | 12;
  setMonthRange: (n: 3 | 6 | 12) => void;
  onSync: () => Promise<void>;
  syncing: boolean;
  syncResult: SyncResult;
  syncDisabled: boolean;
  lastSyncAt: string | null;
}

type SortCol = "project" | "thisMonth" | "pctTotal" | "avgMonth" | "total";
type SortDir = "asc" | "desc";

export function SpendTab({
  activity, monthRange, setMonthRange,
  onSync, syncing, syncResult, syncDisabled, lastSyncAt,
}: SpendTabProps) {
  const [chartView, setChartView] = useState<"key" | "day">("key");
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState(false);
  const [sortBy, setSortBy] = useState<SortCol>("thisMonth");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);
  const [dayData, setDayData] = useState<DayData | null>(null);
  const [dayLoading, setDayLoading] = useState(false);
  const [keyDetails, setKeyDetails] = useState<Record<string, KeyDetail>>({});
  const [keyDetailLoading, setKeyDetailLoading] = useState<Record<string, boolean>>({});

  const currentMonth = useMemo(() => new Date().toISOString().substring(0, 7), []);

  const cutoffMonth = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - monthRange + 1);
    return d.toISOString().substring(0, 7);
  }, [monthRange]);

  // Fetch daily data when switching to day view or changing period
  useEffect(() => {
    if (chartView !== "day") return;
    let cancelled = false;
    setDayLoading(true);
    fetch(`/api/activity/daily?period=${monthRange}m`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setDayData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setDayLoading(false); });
    return () => { cancelled = true; };
  }, [chartView, monthRange]);

  // Fetch per-key detail when a row is expanded
  useEffect(() => {
    if (!expandedRow) return;
    if (keyDetails[expandedRow]) return;
    let cancelled = false;
    setKeyDetailLoading(prev => ({ ...prev, [expandedRow]: true }));
    fetch(`/api/activity/key/${encodeURIComponent(expandedRow)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setKeyDetails(prev => ({ ...prev, [expandedRow]: d })); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setKeyDetailLoading(prev => ({ ...prev, [expandedRow]: false })); });
    return () => { cancelled = true; };
  }, [expandedRow]); // eslint-disable-line react-hooks/exhaustive-deps

  // Period-filtered stats for each key (used in table columns)
  const periodStats = useMemo(() => {
    const map = new Map<string, { total: number; activeMonths: number; avg: number }>();
    for (const k of activity.keys) {
      const inRange = k.monthly.filter(m => m.month >= cutoffMonth);
      const total = inRange.reduce((s, m) => s + m.spend, 0);
      // snapshotMonths: completed months (< currentMonth) that had actual spend
      const snapshotMonths = inRange.filter(m => m.spend > 0 && m.month < currentMonth).length;
      // If no completed months yet, treat current partial month as 1 month to avoid $0.00 avg
      const effectiveMonths = snapshotMonths > 0 ? snapshotMonths : (total > 0 ? 1 : 0);
      const avg = effectiveMonths > 0 ? total / effectiveMonths : 0;
      map.set(k.key_name, { total, activeMonths: snapshotMonths, avg });
    }
    return map;
  }, [activity.keys, cutoffMonth, currentMonth]);

  const periodGrandTotal = useMemo(
    () => [...periodStats.values()].reduce((s, v) => s + v.total, 0),
    [periodStats]
  );

  const visibleMonths = useMemo(
    () => activity.months.filter(m => m >= cutoffMonth),
    [activity.months, cutoffMonth]
  );

  // Fix 1 + 7: start from cutoffMonth (reflects period selection), end at actual latest DB date
  const periodLabel = useMemo(() => {
    const end = activity.latest_date
      ? formatDateShort(activity.latest_date)
      : visibleMonths.length > 0 ? formatMonth(visibleMonths[visibleMonths.length - 1]) : "";
    return end ? `${formatMonth(cutoffMonth)} – ${end}` : "";
  }, [cutoffMonth, activity.latest_date, visibleMonths]);

  const periodTotal = useMemo(
    () => [...periodStats.values()].reduce((s, v) => s + v.total, 0),
    [periodStats]
  );

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

  // Active in chart = has any spend in period + not hidden
  const activeKeys = useMemo(
    () => activity.keys.filter(k => showInactive || (periodStats.get(k.key_name)?.total ?? 0) > 0),
    [activity.keys, showInactive, periodStats]
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

  // Day chart key colors: use same color index as monthly chart
  const keyColorIndex = useMemo(() => {
    const map = new Map<string, number>();
    activity.keys.forEach((k, i) => map.set(k.key_name, i));
    return map;
  }, [activity.keys]);

  function toggleKey(keyName: string) {
    setHiddenKeys(prev => {
      const next = new Set(prev);
      if (next.has(keyName)) next.delete(keyName); else next.add(keyName);
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
      let va: number | string = 0, vb: number | string = 0;
      const sa = periodStats.get(a.key_name) ?? { total: 0, avg: 0 };
      const sb = periodStats.get(b.key_name) ?? { total: 0, avg: 0 };
      if (sortBy === "project")    { va = a.project_name; vb = b.project_name; }
      else if (sortBy === "thisMonth") { va = a.current_month_spend; vb = b.current_month_spend; }
      else if (sortBy === "pctTotal")  { va = sa.total; vb = sb.total; }
      else if (sortBy === "avgMonth")  { va = sa.avg;   vb = sb.avg; }
      else if (sortBy === "total")     { va = sa.total; vb = sb.total; }
      if (typeof va === "string" && typeof vb === "string")
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }

  // Active this month = has current_month_spend > 0
  const tableActiveKeys = useMemo(
    () => sortKeys(activity.keys.filter(k => k.current_month_spend > 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity.keys, sortBy, sortDir, periodStats]
  );

  // Inactive this month = no spend in current month (but may have historical spend)
  const tableInactiveKeys = useMemo(
    () => sortKeys(activity.keys.filter(k => k.current_month_spend === 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity.keys, sortBy, sortDir, periodStats]
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
    const ps = periodStats.get(k.key_name) ?? { total: 0, avg: 0 };
    const pct = periodGrandTotal > 0 ? (ps.total / periodGrandTotal) * 100 : 0;
    const modelList = k.models ?? [];
    const shownModels = modelList.slice(0, 2).map(shortModel);
    const extraModels = modelList.length > 2 ? modelList.length - 2 : 0;
    const detail = keyDetails[k.key_name];
    const detailLoading = keyDetailLoading[k.key_name];

    return (
      <React.Fragment key={k.key_name}>
        <tr
          onClick={() => setExpandedRow(isExpanded ? null : k.key_name)}
          className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
        >
          {/* Project */}
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
          </td>
          {/* Models */}
          <td className="px-5 py-3">
            {modelList.length === 0 ? (
              <span className="text-slate-300 dark:text-slate-600 text-xs">—</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {shownModels.map(m => (
                  <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-mono whitespace-nowrap">
                    {m}
                  </span>
                ))}
                {extraModels > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-400">
                    +{extraModels} more
                  </span>
                )}
              </div>
            )}
          </td>
          {/* This Month */}
          <td className="px-5 py-3 font-semibold text-indigo-600 dark:text-indigo-400 text-sm whitespace-nowrap">
            {formatCurrency(k.current_month_spend)}
          </td>
          {/* % of Total (period) */}
          <td className="px-5 py-3 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
            {pct.toFixed(1)}%
          </td>
          {/* Avg/Month (period, active months only) */}
          <td className="px-5 py-3 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
            {formatCurrency(ps.avg)}
          </td>
          {/* Trend */}
          <td className="px-5 py-3">
            <TrendBadge trend={k.trend} />
          </td>
          {/* Total (period) */}
          <td className="px-5 py-3 font-semibold text-slate-800 dark:text-slate-200 text-sm whitespace-nowrap">
            {formatCurrency(ps.total)}
          </td>
        </tr>

        {/* Expandable detail panel */}
        {isExpanded && (
          <tr key={`${k.key_name}-detail`} className="bg-slate-50 dark:bg-slate-800/30">
            <td colSpan={7} className="px-5 py-4">
              {detailLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-400 py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading detail…
                </div>
              ) : detail ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Daily spend chart */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                      Daily Spend — Last 30 Days
                    </p>
                    {detail.daily.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No log data for this period.</p>
                    ) : (
                      <ResponsiveContainer width="100%" height={120}>
                        <AreaChart data={detail.daily} margin={{ top: 2, right: 4, left: 0, bottom: 0 }}>
                          <XAxis
                            dataKey="date"
                            tickFormatter={formatDay}
                            tick={{ fontSize: 9, fill: "#94a3b8" }}
                            axisLine={false} tickLine={false}
                            interval="preserveStartEnd"
                          />
                          <YAxis
                            tickFormatter={v => `$${v}`}
                            tick={{ fontSize: 9, fill: "#94a3b8" }}
                            axisLine={false} tickLine={false}
                            width={40}
                          />
                          <Tooltip
                            formatter={(v: number) => [formatCurrency(v), "Cost"]}
                            contentStyle={{ borderRadius: "0.5rem", border: "1px solid #e2e8f0", fontSize: 11 }}
                          />
                          <Area
                            type="monotone" dataKey="cost"
                            stroke="#6366f1" fill="#6366f133" strokeWidth={1.5}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Model breakdown table */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
                      Model Breakdown — Last 30 Days
                    </p>
                    {detail.models.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No model data.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-700">
                              <th className="text-left pb-1.5 text-slate-400 font-semibold">Model</th>
                              <th className="text-right pb-1.5 text-slate-400 font-semibold">Req</th>
                              <th className="text-right pb-1.5 text-slate-400 font-semibold">Prompt</th>
                              <th className="text-right pb-1.5 text-slate-400 font-semibold">Compl.</th>
                              <th className="text-right pb-1.5 text-slate-400 font-semibold">Cost</th>
                              <th className="text-right pb-1.5 text-slate-400 font-semibold">Avg/req</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50 dark:divide-slate-700/60">
                            {detail.models.map(m => (
                              <tr key={m.model} className="hover:bg-slate-100/50 dark:hover:bg-slate-700/20">
                                <td className="py-1.5 font-mono text-slate-600 dark:text-slate-300 max-w-[160px] truncate">{m.model}</td>
                                <td className="py-1.5 text-right text-slate-500 dark:text-slate-400">{m.requests.toLocaleString()}</td>
                                <td className="py-1.5 text-right text-slate-500 dark:text-slate-400">{m.prompt_tokens.toLocaleString()}</td>
                                <td className="py-1.5 text-right text-slate-500 dark:text-slate-400">{m.completion_tokens.toLocaleString()}</td>
                                <td className="py-1.5 text-right font-semibold text-indigo-600 dark:text-indigo-400">{formatCurrency(m.total_cost)}</td>
                                <td className="py-1.5 text-right text-slate-500 dark:text-slate-400">{formatCurrency(m.avg_cost)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  }

  const thCls = "px-5 py-3 text-left text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider cursor-pointer hover:text-slate-600 dark:hover:text-slate-300 select-none whitespace-nowrap";

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
            <span className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-bold",
              pctChange > 0
                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
            )}>
              {pctChange > 0 ? "↑" : "↓"} {Math.abs(pctChange).toFixed(1)}%
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-400">—</span>
          )}
          <p className="text-[11px] text-slate-400 dark:text-slate-500">vs prev month</p>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Period */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {([3, 6, 12] as const).map(n => (
            <button key={n} onClick={() => setMonthRange(n)}
              className={cn("px-3 py-1 rounded-md text-xs font-semibold transition-all",
                monthRange === n
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              )}>
              {n}M
            </button>
          ))}
        </div>

        {/* Chart view */}
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {(["key", "day"] as const).map(v => (
            <button key={v} onClick={() => setChartView(v)}
              className={cn("px-3 py-1 rounded-md text-xs font-semibold transition-all",
                chartView === v
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
              )}>
              {v === "key" ? "By Key" : "By Day"}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer select-none">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-indigo-600 rounded" />
          Show inactive
        </label>

        <div className="ml-auto flex items-center gap-3 flex-wrap justify-end">
          {/* Last sync + result */}
          <div className="flex flex-col items-end gap-0.5">
            {syncResult && (
              <span className={cn("text-xs font-medium",
                syncResult.errors.length > 0 ? "text-amber-500 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
              )}>
                {syncResult.errors.length > 0
                  ? `${syncResult.synced_keys} keys synced, ${syncResult.errors.length} error(s)`
                  : `Synced ${syncResult.synced_keys} keys · ${syncResult.total_log_rows_written} rows`}
              </span>
            )}
            {lastSyncAt && (
              <div className="text-right">
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  Last synced: {formatLastSync(lastSyncAt)}
                </span>
                {activity.latest_date && (
                  <p className="text-[10px] text-slate-300 dark:text-slate-600 mt-0.5">
                    · data through {formatDateShort(activity.latest_date)} · today&apos;s spend available tomorrow
                  </p>
                )}
              </div>
            )}
          </div>
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
          (dayLoading || dayData === null) ? (
            <div className="flex items-center justify-center h-40 gap-2 text-slate-400">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading daily data…
            </div>
          ) : dayData.days.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm text-slate-400 dark:text-slate-500 text-center max-w-sm">
                No daily data for this period. Run Sync Now to populate.
              </p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={dayData.days} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDay}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false} tickLine={false}
                    interval={Math.floor(dayData.days.length / 8)}
                  />
                  <YAxis
                    tickFormatter={v => `$${v}`}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false} tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      const k = activity.keys.find(x => x.key_name === name);
                      return [formatCurrency(value), k?.project_name ?? name];
                    }}
                    contentStyle={{ borderRadius: "0.75rem", border: "1px solid #e2e8f0", fontSize: 12 }}
                  />
                  {dayData.key_names
                    .filter(k => !hiddenKeys.has(k))
                    .map((k, i) => (
                      <Bar
                        key={k} dataKey={k}
                        stackId="stack"
                        fill={KEY_COLORS[(keyColorIndex.get(k) ?? i) % KEY_COLORS.length]}
                        radius={i === dayData.key_names.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                      />
                    ))}
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-3">
                {dayData.key_names.map(k => {
                  const color = KEY_COLORS[(keyColorIndex.get(k) ?? 0) % KEY_COLORS.length];
                  const hidden = hiddenKeys.has(k);
                  const label = activity.keys.find(x => x.key_name === k)?.project_name ?? k;
                  return (
                    <button key={k} onClick={() => toggleKey(k)}
                      className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                        hidden
                          ? "border-slate-200 dark:border-slate-700 text-slate-400 opacity-50"
                          : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900"
                      )}>
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hidden ? "#94a3b8" : color }} />
                      {label}
                    </button>
                  );
                })}
              </div>
            </>
          )
        ) : visibleMonths.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-sm text-slate-400 dark:text-slate-500">No usage data yet.</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={v => `$${v}`} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={52} />
                <Tooltip
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  contentStyle={{ borderRadius: "0.75rem", border: "1px solid #e2e8f0", fontSize: 12 }}
                />
                {visibleChartKeys.map((k, i) => (
                  <Bar
                    key={k.key_name} dataKey={k.key_name} name={k.project_name}
                    stackId="stack"
                    fill={KEY_COLORS[(keyColorIndex.get(k.key_name) ?? i) % KEY_COLORS.length]}
                    radius={i === visibleChartKeys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 mt-3">
              {activeKeys.map(k => {
                const color = KEY_COLORS[(keyColorIndex.get(k.key_name) ?? 0) % KEY_COLORS.length];
                const hidden = hiddenKeys.has(k.key_name);
                return (
                  <button key={k.key_name} onClick={() => toggleKey(k.key_name)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                      hidden
                        ? "border-slate-200 dark:border-slate-700 text-slate-400 opacity-50"
                        : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900"
                    )}>
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
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Summary</h3>
          <span className="text-xs text-slate-400 dark:text-slate-500">{periodLabel} · period-filtered</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className={thCls} onClick={() => toggleSort("project")}>
                  <span className="flex items-center gap-1">Project <SortIcon col="project" /></span>
                </th>
                <th className={cn(thCls, "cursor-default hover:text-slate-400")}>Models</th>
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
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">
                    No active keys this month.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Inactive this month — collapsed section */}
        {tableInactiveKeys.length > 0 && (
          <div className="border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setInactiveExpanded(e => !e)}
              className="w-full flex items-center gap-2 px-5 py-3 text-xs font-semibold text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors text-left"
            >
              {inactiveExpanded ? <ChevronUp className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
              <span>
                Inactive this month:{" "}
                {tableInactiveKeys.slice(0, 3).map(k => k.project_name).join(", ")}
                {tableInactiveKeys.length > 3
                  ? ` … (${tableInactiveKeys.length} total)`
                  : ` (${tableInactiveKeys.length})`}
              </span>
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
