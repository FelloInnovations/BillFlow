"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  BarChart, Bar, Cell, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from "recharts";
import { ChevronDown, ChevronUp, ChevronRight, Loader2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { ActivityData, ActivityKeyData } from "@/types";

const KEY_COLORS = [
  "#ff725c", "#f59e0b", "#10b981", "#f43f5e",
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

function formatRelativeTime(iso: string): string {
  const minsAgo = (Date.now() - new Date(iso).getTime()) / 60000;
  if (minsAgo < 60) return `${Math.floor(minsAgo)}m ago`;
  const hoursAgo = minsAgo / 60;
  if (hoursAgo < 24) return `${Math.floor(hoursAgo)}h ago`;
  return `${Math.floor(hoursAgo / 24)}d ago`;
}

function TrendBadge({ trend }: { trend: "up" | "down" | "stable" | null }) {
  if (!trend) return (
    <span
      title="Trend available after 2 months of data"
      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-quaternary)] cursor-help"
    >
      New
    </span>
  );
  if (trend === "up")
    return <span className="text-[var(--text-success-primary)] font-semibold text-base">↑</span>;
  if (trend === "down")
    return <span className="text-[var(--text-error-primary)] font-semibold text-base">↓</span>;
  return <span className="text-[var(--text-quaternary)] font-semibold text-base">→</span>;
}

interface KeyDetail {
  daily: { date: string; cost: number }[];
  models: {
    model: string; requests: number; prompt_tokens: number;
    completion_tokens: number; total_cost: number; avg_cost: number;
  }[];
}

interface SpendTabProps {
  activity: ActivityData;
  monthRange: 1 | 3 | 6 | 12;
  setMonthRange: (n: 1 | 3 | 6 | 12) => void;
  lastSynced: string | null;
}

type SortCol = "project" | "thisMonth" | "today" | "pctTotal" | "avgMonth" | "avgWeek" | "avgDay" | "total";
type SortDir = "asc" | "desc";

export function SpendTab({
  activity, monthRange, setMonthRange, lastSynced,
}: SpendTabProps) {
  const [chartView, setChartView] = useState<"key" | "day">("key");
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());
  const [showInactive, setShowInactive] = useState(false);
  const [sortBy, setSortBy] = useState<SortCol>("thisMonth");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [inactiveExpanded, setInactiveExpanded] = useState(false);
  const [keyDetails, setKeyDetails] = useState<Record<string, KeyDetail>>({});
  const [keyDetailLoading, setKeyDetailLoading] = useState<Record<string, boolean>>({});
  const currentMonth = useMemo(() => new Date().toISOString().substring(0, 7), []);
  const todayUtc     = useMemo(() => new Date().toISOString().substring(0, 10), []);

  // Latest month with actual LOG entries (not snapshots).
  // Used to prevent snapshot-only months from appearing in the period charts.
  const latestLogMonth = useMemo(
    () => activity.latest_date?.substring(0, 7) ?? null,
    [activity.latest_date]
  );

  const cutoffMonth = useMemo(() => {
    // Anchor on latest log date if available, otherwise fall back to latest snapshot month
    const latestDataMonth = activity.latest_date
      ? activity.latest_date.substring(0, 7)
      : activity.months[activity.months.length - 1]
      ?? new Date().toISOString().substring(0, 7);

    const [y, m] = latestDataMonth.split("-").map(Number);
    const cutoff = new Date(y, m - 1 - (monthRange - 1), 1);
    return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, "0")}`;
  }, [monthRange, activity.latest_date, activity.months]);

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

  // Latest month with actual spend across all keys (used for "Latest Month" column header + values)
  const latestActiveMonth = useMemo(() => {
    let latest = "";
    for (const k of activity.keys) {
      for (const m of k.monthly) {
        if (m.spend > 0 && m.month > latest) latest = m.month;
      }
    }
    return latest; // e.g. "2026-05"
  }, [activity.keys]);

  // Period-filtered stats for each key (used in table columns)
  const periodStats = useMemo(() => {
    const map = new Map<string, { total: number; activeMonths: number; avg: number; latestMonthSpend: number; weekly: number; daily: number }>();
    for (const k of activity.keys) {
      const inRange = k.monthly.filter(m =>
        m.month >= cutoffMonth && (!latestLogMonth || m.month <= latestLogMonth)
      );
      const total = inRange.reduce((s, m) => s + m.spend, 0);
      // snapshotMonths: completed months (< currentMonth) that had actual spend
      const snapshotMonths = inRange.filter(m => m.spend > 0 && m.month < currentMonth).length;
      // If no completed months yet, treat current partial month as 1 month to avoid $0.00 avg
      const effectiveMonths = snapshotMonths > 0 ? snapshotMonths : (total > 0 ? 1 : 0);
      const avg = effectiveMonths > 0 ? total / effectiveMonths : 0;
      const latestMonthSpend = k.monthly.find(m => m.month === latestActiveMonth)?.spend ?? 0;
      const weekly = avg / 4.33;
      const daily  = avg / 30;
      map.set(k.key_name, { total, activeMonths: snapshotMonths, avg, latestMonthSpend, weekly, daily });
    }
    return map;
  }, [activity.keys, cutoffMonth, currentMonth, latestActiveMonth, latestLogMonth]);

  const periodGrandTotal = useMemo(
    () => [...periodStats.values()].reduce((s, v) => s + v.total, 0),
    [periodStats]
  );

  const visibleMonths = useMemo(
    () => activity.months.filter(m =>
      m >= cutoffMonth && (!latestLogMonth || m <= latestLogMonth)
    ),
    [activity.months, cutoffMonth, latestLogMonth]
  );

  const periodLabel = useMemo(() => {
    const end = activity.latest_date
      ? formatDateShort(activity.latest_date)
      : visibleMonths.length > 0
        ? formatMonth(visibleMonths[visibleMonths.length - 1])
        : "";
    const start = formatMonth(cutoffMonth);
    return end ? `${start} – ${end}` : start;
  }, [cutoffMonth, activity.latest_date, visibleMonths]);

  const periodTotal = useMemo(
    () => [...periodStats.values()].reduce((s, v) => s + v.total, 0),
    [periodStats]
  );

  // Compare the two most recent completed months that have non-zero spend
  const pctChange = useMemo(() => {
    const monthTotals: Record<string, number> = {};
    for (const k of activity.keys) {
      for (const m of k.monthly) {
        if (m.month < currentMonth && m.spend > 0) {
          monthTotals[m.month] = (monthTotals[m.month] ?? 0) + m.spend;
        }
      }
    }
    const completedMonths = Object.entries(monthTotals)
      .sort((a, b) => b[0].localeCompare(a[0]));
    if (completedMonths.length < 2) return null;
    const [latest, prev] = completedMonths;
    return prev[1] > 0 ? ((latest[1] - prev[1]) / prev[1]) * 100 : null;
  }, [activity.keys, currentMonth]);

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
    if (sortBy !== col) return <ChevronDown className="w-3 h-3 text-[var(--text-quaternary)]" />;
    return sortDir === "asc"
      ? <ChevronUp className="w-3 h-3 text-salmon-500" />
      : <ChevronDown className="w-3 h-3 text-salmon-500" />;
  }

  function sortKeys(keys: ActivityKeyData[]) {
    return [...keys].sort((a, b) => {
      let va: number | string = 0, vb: number | string = 0;
      const sa = periodStats.get(a.key_name) ?? { total: 0, avg: 0, latestMonthSpend: 0, weekly: 0, daily: 0 };
      const sb = periodStats.get(b.key_name) ?? { total: 0, avg: 0, latestMonthSpend: 0, weekly: 0, daily: 0 };
      if (sortBy === "project")        { va = a.project_name;      vb = b.project_name; }
      else if (sortBy === "thisMonth") { va = sa.latestMonthSpend; vb = sb.latestMonthSpend; }
      else if (sortBy === "today")     { va = a.today_spend ?? 0; vb = b.today_spend ?? 0; }
      else if (sortBy === "pctTotal")  { va = sa.total;            vb = sb.total; }
      else if (sortBy === "avgMonth")  { va = sa.avg;              vb = sb.avg; }
      else if (sortBy === "avgWeek")   { va = sa.weekly;           vb = sb.weekly; }
      else if (sortBy === "avgDay")    { va = sa.daily;            vb = sb.daily; }
      else if (sortBy === "total")     { va = sa.total;            vb = sb.total; }
      if (typeof va === "string" && typeof vb === "string")
        return sortDir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
    });
  }

  // Active = has any spend in the selected period (not just current calendar month)
  const tableActiveKeys = useMemo(
    () => sortKeys(activity.keys.filter(k => (periodStats.get(k.key_name)?.total ?? 0) > 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity.keys, sortBy, sortDir, periodStats]
  );

  // Inactive = zero spend across the entire selected period
  const tableInactiveKeys = useMemo(
    () => sortKeys(activity.keys.filter(k => (periodStats.get(k.key_name)?.total ?? 0) === 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activity.keys, sortBy, sortDir, periodStats]
  );

  function statusDot(k: ActivityKeyData) {
    const periodTotal = periodStats.get(k.key_name)?.total ?? 0;
    if (periodTotal > 0) return "bg-emerald-500";
    if (k.total > 0) return "bg-amber-400";
    return "bg-[var(--text-disabled)]";
  }

  function shortModel(m: string) {
    return m.includes("/") ? m.split("/").slice(1).join("/") : m;
  }

  function renderRow(k: ActivityKeyData) {
    const isExpanded = expandedRow === k.key_name;
    const ps = periodStats.get(k.key_name) ?? { total: 0, avg: 0, latestMonthSpend: 0, weekly: 0, daily: 0 };
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
          className="hover:bg-[var(--bg-secondary\_subtle)] transition-colors cursor-pointer"
        >
          {/* Project */}
          <td className="px-5 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn("w-2 h-2 rounded-full shrink-0", statusDot(k))} />
              {(k.project_names?.length ?? 0) > 1 ? (
                <span className="font-medium text-[var(--text-primary)] text-sm">
                  {k.project_names.join(" · ")}
                </span>
              ) : (
                <span className="font-medium text-[var(--text-primary)] text-sm">{k.project_name}</span>
              )}
              {k.project_status && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-quaternary)] uppercase">
                  {k.project_status}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5 ml-4">
              <p className="text-[11px] text-[var(--text-quaternary)] font-mono">{k.key_name}</p>
              {k.account_name === "Account 2" && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--bg-secondary)] text-[var(--text-quaternary)]">
                  Account 2
                </span>
              )}
            </div>
          </td>
          {/* Models */}
          <td className="px-5 py-3">
            {modelList.length === 0 ? (
              <span className="text-[var(--text-quaternary)] text-xs">—</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {shownModels.map(m => (
                  <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-brand-primary)] text-[var(--text-brand-primary)] font-mono whitespace-nowrap">
                    {m}
                  </span>
                ))}
                {extraModels > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-secondary)] text-[var(--text-quaternary)]">
                    +{extraModels} more
                  </span>
                )}
              </div>
            )}
          </td>
          {/* Latest Month */}
          <td className="px-5 py-3 font-semibold text-[var(--text-brand-primary)] text-sm whitespace-nowrap">
            {formatCurrency(ps.latestMonthSpend)}
          </td>
          {/* Today — usage_today from openrouter_usage_snapshots, written by n8n hourly */}
          <td className="px-5 py-3 text-sm whitespace-nowrap">
            {k.today_spend != null && k.today_spend > 0
              ? <span className="font-semibold text-[var(--text-brand-primary)]">{`$${k.today_spend.toFixed(2)}`}</span>
              : <span className="text-[var(--text-quaternary)]">—</span>
            }
          </td>
          {/* % of Total (period) */}
          <td className="px-5 py-3 text-sm text-[var(--text-primary)] whitespace-nowrap">
            {pct.toFixed(1)}%
          </td>
          {/* Avg/Month (period, active months only) */}
          <td className="px-5 py-3 text-sm text-[var(--text-primary)] whitespace-nowrap">
            {formatCurrency(ps.avg)}
          </td>
          {/* Avg/Week */}
          <td className="px-5 py-3 text-sm text-[var(--text-primary)] whitespace-nowrap">
            {formatCurrency(ps.weekly)}
          </td>
          {/* Avg/Day */}
          <td className="px-5 py-3 text-sm text-[var(--text-primary)] whitespace-nowrap">
            {formatCurrency(ps.daily)}
          </td>
          {/* Trend */}
          <td className="px-5 py-3">
            <TrendBadge trend={k.trend} />
          </td>
          {/* Total (period) */}
          <td className="px-5 py-3 font-semibold text-[var(--text-primary)] text-sm whitespace-nowrap">
            {formatCurrency(ps.total)}
          </td>
        </tr>

        {/* Expandable detail panel */}
        {isExpanded && (
          <tr key={`${k.key_name}-detail`} className="bg-[var(--bg-secondary\_subtle)]">
            <td colSpan={10} className="px-5 py-4">
              {detailLoading ? (
                <div className="flex items-center gap-2 text-sm text-[var(--text-quaternary)] py-4">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading detail…
                </div>
              ) : detail ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Daily spend chart */}
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
                      Daily Spend — Last 30 Days
                    </p>
                    {detail.daily.length === 0 ? (
                      <p className="text-xs text-[var(--text-quaternary)] italic">No log data for this period.</p>
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
                            stroke="#ff725c" fill="#ff725c33" strokeWidth={1.5}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Model breakdown table */}
                  <div>
                    <p className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
                      Model Breakdown — Last 30 Days
                    </p>
                    {detail.models.length === 0 ? (
                      <p className="text-xs text-[var(--text-quaternary)] italic">No model data.</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-[var(--border-tertiary)]">
                              <th className="text-left pb-1.5 text-[var(--text-quaternary)] font-semibold">Model</th>
                              <th className="text-right pb-1.5 text-[var(--text-quaternary)] font-semibold">Req</th>
                              <th className="text-right pb-1.5 text-[var(--text-quaternary)] font-semibold">Prompt</th>
                              <th className="text-right pb-1.5 text-[var(--text-quaternary)] font-semibold">Compl.</th>
                              <th className="text-right pb-1.5 text-[var(--text-quaternary)] font-semibold">Cost</th>
                              <th className="text-right pb-1.5 text-[var(--text-quaternary)] font-semibold">Avg/req</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border-tertiary)]">
                            {detail.models.map(m => (
                              <tr key={m.model} className="hover:bg-[var(--bg-secondary\_subtle)]">
                                <td className="py-1.5 font-mono text-[var(--text-secondary)] max-w-[160px] truncate">{m.model}</td>
                                <td className="py-1.5 text-right text-[var(--text-tertiary)]">{m.requests.toLocaleString()}</td>
                                <td className="py-1.5 text-right text-[var(--text-tertiary)]">{m.prompt_tokens.toLocaleString()}</td>
                                <td className="py-1.5 text-right text-[var(--text-tertiary)]">{m.completion_tokens.toLocaleString()}</td>
                                <td className="py-1.5 text-right font-semibold text-[var(--text-brand-primary)]">{formatCurrency(m.total_cost)}</td>
                                <td className="py-1.5 text-right text-[var(--text-tertiary)]">{formatCurrency(m.avg_cost)}</td>
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

  const thCls = "px-5 py-3 text-left text-xs font-semibold text-[var(--text-quaternary)] uppercase tracking-wider cursor-pointer hover:text-[var(--text-secondary)] select-none whitespace-nowrap";

  return (
    <div className="space-y-5">

      {/* Total spend banner */}
      <div className="rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm p-5 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-semibold text-[var(--text-quaternary)] uppercase tracking-wide mb-0.5">
            Total this period
          </p>
          <p className="text-2xl font-semibold text-[var(--text-primary)]">
            {formatCurrency(periodTotal)}
          </p>
          <p className="text-xs text-[var(--text-quaternary)] mt-1">{periodLabel}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {pctChange !== null ? (
            <span className={cn(
              "inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-semibold",
              pctChange > 0
                ? "bg-[var(--bg-warning-primary)] text-[var(--text-warning-primary)]"
                : "bg-[var(--bg-success-primary)] text-[var(--text-success-primary)]"
            )}>
              {pctChange > 0 ? "↑" : "↓"} {Math.abs(pctChange).toFixed(1)}%
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-semibold bg-[var(--bg-secondary)] text-[var(--text-quaternary)]">—</span>
          )}
          <p className="text-[11px] text-[var(--text-quaternary)]">vs prev month</p>
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Period */}
        <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-lg p-1">
          {([1, 3, 6, 12] as const).map(n => (
            <button key={n} onClick={() => setMonthRange(n)}
              className={cn("px-3 py-1 rounded-md text-xs font-semibold transition-all",
                monthRange === n
                  ? "bg-[var(--bg-primary)] text-[var(--text-brand-primary)] shadow-sm"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              )}>
              {n}M
            </button>
          ))}
        </div>

        {/* Chart view */}
        <div className="flex gap-1 bg-[var(--bg-secondary)] rounded-lg p-1">
          {(["key", "day"] as const).map(v => (
            <button key={v} onClick={() => setChartView(v)}
              className={cn("px-3 py-1 rounded-md text-xs font-semibold transition-all",
                chartView === v
                  ? "bg-[var(--bg-primary)] text-[var(--text-brand-primary)] shadow-sm"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              )}>
              {v === "key" ? "By Key" : "By Day"}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-salmon-600 rounded" />
          Show inactive
        </label>

        <p className="ml-auto text-[11px] text-[var(--text-quaternary)]">
          {lastSynced
            ? `Synced ${formatRelativeTime(lastSynced)} · hourly via n8n`
            : 'Awaiting first n8n sync'}
        </p>
      </div>

      {/* Chart card */}
      <div className="rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm p-5">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            {chartView === "key" ? "Monthly Spend by Key" : "Daily Spend"}
          </h3>
          {chartView === "key" && visibleMonths.length > 0 && (
            <span className="text-xs text-[var(--text-quaternary)]">
              Visible total: <span className="font-semibold text-[var(--text-secondary)]">{formatCurrency(chartPeriodTotal)}</span>
            </span>
          )}
        </div>

        {chartView === "day" ? (() => {
          const byDay = activity.byDay ?? [];
          if (byDay.length === 0) return (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm text-[var(--text-quaternary)]">No daily data available.</p>
            </div>
          );
          return (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byDay} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDay}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false} tickLine={false}
                    interval={Math.floor(byDay.length / 8)}
                  />
                  <YAxis
                    tickFormatter={v => `$${v}`}
                    tick={{ fontSize: 11, fill: "#94a3b8" }}
                    axisLine={false} tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const entry = payload[0].payload as { date: string; total: number; isLive?: boolean };
                      return (
                        <div className="rounded-xl border border-[var(--border-tertiary)] bg-[var(--bg-primary)] p-3 text-xs shadow-md">
                          <p className="font-semibold text-[var(--text-primary)] mb-1">{formatDay(label as string)}</p>
                          <p className="text-[var(--text-secondary)]">{formatCurrency(payload[0].value as number)}</p>
                          {entry.isLive && (
                            <p className="text-[var(--text-brand-primary)] mt-1.5 border-t border-[var(--border-tertiary)] pt-1.5">
                              Updated hourly — partial day total
                            </p>
                          )}
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                    {byDay.map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.isLive ? "#ff8778" : "#ff725c"}
                        fillOpacity={entry.isLive ? 0.65 : 1}
                        stroke={entry.isLive ? "#ff725c" : "none"}
                        strokeWidth={entry.isLive ? 1 : 0}
                        strokeDasharray={entry.isLive ? "3 2" : undefined}
                      />
                    ))}
                    <LabelList
                      dataKey="total"
                      content={(props) => {
                        const { x, y, width, index } = props as { x: number; y: number; width: number; index: number };
                        if (!byDay[index]?.isLive) return null;
                        return (
                          <text
                            x={x + width / 2}
                            y={y - 5}
                            textAnchor="middle"
                            fontSize={9}
                            fontWeight={700}
                            fill="#ff725c"
                            letterSpacing={0.5}
                          >
                            LIVE
                          </text>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {(() => {
                if (!activity.latest_date) return null;
                const daysBehind = Math.floor(
                  (Date.now() - new Date(activity.latest_date + "T00:00:00Z").getTime()) / 86_400_000
                );
                if (daysBehind <= 3) return null;
                return (
                  <p className="text-[11px] text-[var(--text-warning-primary)] mt-2">
                    ⚠ Log data is {daysBehind} days behind — last entry {activity.latest_date}. OpenRouter activity API lag is typically 1–2 days; if this exceeds 3 days the sync may need attention.
                  </p>
                );
              })()}
              <p className="text-[11px] text-[var(--text-quaternary)] mt-1">
                Last 30 days · today&apos;s bar reflects the latest hourly snapshot
              </p>
            </>
          );
        })() : visibleMonths.length === 0 ? (
          <div className="flex items-center justify-center h-40">
            <p className="text-sm text-[var(--text-quaternary)]">No usage data yet.</p>
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
            {/* Current partial month — shown separately from the period chart */}
            {latestLogMonth && currentMonth > latestLogMonth && (() => {
              const partialTotal = activity.keys.reduce((sum, k) => {
                const m = k.monthly.find(m => m.month === currentMonth);
                return sum + (m?.spend ?? 0);
              }, 0);
              if (partialTotal <= 0) return null;
              return (
                <p className="text-xs text-[var(--text-quaternary)] mt-2 px-1">
                  {`${formatMonth(currentMonth)} (partial, live): `}
                  <span className="font-medium text-[var(--text-secondary)]">
                    {formatCurrency(partialTotal)}
                  </span>
                  {" — from hourly n8n snapshot"}
                </p>
              );
            })()}
            <div className="flex flex-wrap gap-2 mt-3">
              {activeKeys.map(k => {
                const color = KEY_COLORS[(keyColorIndex.get(k.key_name) ?? 0) % KEY_COLORS.length];
                const hidden = hiddenKeys.has(k.key_name);
                return (
                  <button key={k.key_name} onClick={() => toggleKey(k.key_name)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                      hidden
                        ? "border-[var(--border-tertiary)] text-[var(--text-quaternary)] opacity-50"
                        : "border-[var(--border-tertiary)] text-[var(--text-primary)] bg-[var(--bg-primary)]"
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
      <div className="rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border-tertiary)] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Summary</h3>
          <span className="text-xs text-[var(--text-quaternary)]">{periodLabel} · period-filtered</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-tertiary)]">
                <th className={thCls} onClick={() => toggleSort("project")}>
                  <span className="flex items-center gap-1">Project <SortIcon col="project" /></span>
                </th>
                <th className={cn(thCls, "cursor-default hover:text-[var(--text-quaternary)]")}>Models</th>
                <th className={thCls} onClick={() => toggleSort("thisMonth")}>
                  <span className="flex items-center gap-1">
                    {latestActiveMonth ? formatMonth(latestActiveMonth) : "Latest Month"}
                    <SortIcon col="thisMonth" />
                  </span>
                </th>
                <th className={thCls} onClick={() => toggleSort("today")}>
                  <span className="flex items-center gap-1" title="Today's running total from OpenRouter's live counter · updates every hour via n8n">
                    Today (live · as of last sync)
                    <SortIcon col="today" />
                  </span>
                </th>
                <th className={thCls} onClick={() => toggleSort("pctTotal")}>
                  <span className="flex items-center gap-1">% of Total <SortIcon col="pctTotal" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort("avgMonth")}>
                  <span className="flex items-center gap-1">Avg/Month <SortIcon col="avgMonth" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort("avgWeek")}>
                  <span className="flex items-center gap-1">Avg/Week <SortIcon col="avgWeek" /></span>
                </th>
                <th className={thCls} onClick={() => toggleSort("avgDay")}>
                  <span className="flex items-center gap-1">Avg/Day <SortIcon col="avgDay" /></span>
                </th>
                <th className={cn(thCls, "cursor-default hover:text-[var(--text-quaternary)]")}>Trend</th>
                <th className={thCls} onClick={() => toggleSort("total")}>
                  <span className="flex items-center gap-1">Total <SortIcon col="total" /></span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-tertiary)]">
              {tableActiveKeys.map(k => renderRow(k))}
              {tableActiveKeys.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-8 text-center text-sm text-[var(--text-quaternary)]">
                    No activity in selected period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* No activity in period — collapsed section */}
        {tableInactiveKeys.length > 0 && (
          <div className="border-t border-[var(--border-tertiary)]">
            <button
              onClick={() => setInactiveExpanded(e => !e)}
              className="w-full flex items-center gap-2 px-5 py-3 text-xs font-semibold text-[var(--text-quaternary)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-secondary\_subtle)] transition-colors text-left"
            >
              {inactiveExpanded ? <ChevronUp className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
              <span>No activity in selected period ({tableInactiveKeys.length} projects)</span>
            </button>
            {inactiveExpanded && (
              <table className="w-full text-sm">
                <tbody className="divide-y divide-[var(--border-tertiary)]">
                  {tableInactiveKeys.map(k => renderRow(k))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Latest-month note */}
        {latestActiveMonth && (
          <div className="px-5 py-3 border-t border-[var(--border-tertiary)]">
            <p className="text-[11px] text-[var(--text-quaternary)] italic">
              {currentMonth > latestActiveMonth
                ? `${new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })} data will appear after today's sync completes. Latest complete month: ${formatMonth(latestActiveMonth)}.`
                : `Showing ${formatMonth(latestActiveMonth)} as the latest complete month.`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
