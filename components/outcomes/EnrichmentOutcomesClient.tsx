"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import {
  OutcomeMetricConfig,
  OutcomeMtdSummary,
  MonthlyOutcomeBreakdown,
} from "@/types";

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Sparkline({ data, color = "#6366f1" }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const w = 80; const h = 28;
  const pts = data
    .map((v, i) => `${(i / (data.length - 1)) * w},${h - (v / max) * h}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="opacity-70">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ── HeroStatCard ──────────────────────────────────────────────────────────────
function HeroStatCard({
  label,
  value,
  sparkData,
  isCurrency = false,
  accent = "indigo",
  note,
  sub,
}: {
  label: string;
  value: number;
  sparkData?: number[];
  isCurrency?: boolean;
  accent?: "indigo" | "emerald" | "amber" | "violet" | "sky";
  note?: string;
  sub?: string;
}) {
  const accentColor = {
    indigo: "#6366f1",
    emerald: "#10b981",
    amber: "#f59e0b",
    violet: "#8b5cf6",
    sky: "#0ea5e9",
  }[accent];

  const display = isCurrency ? formatCurrency(value) : value.toLocaleString();

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex flex-col gap-1">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {label}
      </p>
      <div className="flex items-end justify-between gap-2 mt-1">
        <p className="text-2xl font-bold text-slate-900 dark:text-white leading-none">{display}</p>
        {sparkData && sparkData.length >= 2 && (
          <Sparkline data={sparkData} color={accentColor} />
        )}
      </div>
      {note && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{note}</p>
      )}
      {sub && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>
      )}
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
      type === "success"
        ? "bg-emerald-500 text-white"
        : "bg-red-500 text-white"
    }`}>
      {msg}
    </div>
  );
}

// ── BackfillModal ─────────────────────────────────────────────────────────────
function BackfillModal({
  onClose,
  onDone,
  onStarted,
}: {
  onClose: () => void;
  onDone: (from: string, to: string) => void;
  onStarted: (from: string, to: string) => void;
}) {
  const [from, setFrom] = useState("2024-01-01");
  const [to, setTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function run() {
    if (!from || !to) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/outcomes/trigger-backfill-enrichment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? `Status ${res.status}`);
      if (res.status === 202) {
        onStarted(from, to);
      } else {
        onDone(from, to);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Backfill failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-6 w-80">
        <h3 className="font-bold text-slate-900 dark:text-white mb-4">Backfill Enrichment Metrics</h3>
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white"
            />
          </div>
        </div>
        {err && <p className="text-xs text-red-500 mb-3">{err}</p>}
        <div className="flex gap-2">
          <button
            onClick={run}
            disabled={loading || !from || !to}
            className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold py-2 transition-colors"
          >
            {loading ? "Running…" : "Run Backfill"}
          </button>
          <button
            onClick={onClose}
            className="px-4 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Scope helpers ─────────────────────────────────────────────────────────────
type Scope = "all_time" | "this_month";

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "all_time",   label: "All Time"   },
  { value: "this_month", label: "This Month" },
];

// Keys whose all-time value is a SUM across months (period/count metrics)
const SUM_KEYS = new Set(["agents_enriched_period", "agents_pushed_hubspot"]);

// MTD snapshot metrics: each month's value is the month-end cumulative total.
// All-time = sum of the per-month totals (monthly breakdown already stores max-per-month).
const SNAPSHOT_KEYS = new Set([
  "demos_booked_mtd",
  "demos_held_mtd",
  "closed_won_mtd",
  "arr_closed_mtd",
]);

function aggregateSnapshotMetric(
  rows: MonthlyOutcomeBreakdown[],
  key: string,
): number {
  return rows.reduce((s, m) => s + ((m.metrics[key] as number) ?? 0), 0);
}

// Keys whose all-time value = latest snapshot (not sum across months)
const LATEST_TOTAL_KEYS = new Set(["agents_enriched_total", "agents_pushed_hubspot_total"]);

function computeAllTime(
  monthly: MonthlyOutcomeBreakdown[],
  configKeys: string[],
): OutcomeMtdSummary {
  const result: OutcomeMtdSummary = {};
  const sorted = [...monthly].sort((a, b) => b.month.localeCompare(a.month));
  for (const key of configKeys) {
    if (LATEST_TOTAL_KEYS.has(key)) {
      // All-time snapshot — take the max (most recent) value across months
      result[key] = Math.max(0, ...monthly.map((m) => (m.metrics[key] as number) ?? 0));
    } else if (SUM_KEYS.has(key) || SNAPSHOT_KEYS.has(key)) {
      // Sum latest-per-month values across all months
      result[key] = aggregateSnapshotMetric(monthly, key);
    } else {
      result[key] = (sorted[0]?.metrics[key] as number) ?? 0;
    }
  }
  return result;
}

function noteFor(key: string, scope: Scope): string {
  if (key === "agents_enriched_total") return "all time";
  if (scope === "all_time") return "all time";
  return key === "agents_enriched_period" ? "this month" : "month-to-date";
}

// ── Metric accent color ───────────────────────────────────────────────────────
function accentFor(key: string): "indigo" | "emerald" | "amber" | "violet" | "sky" {
  if (key === "agents_enriched_total") return "violet";
  if (key === "agents_enriched_period") return "sky";
  if (key === "agents_pushed_hubspot")  return "indigo";
  if (key.includes("arr"))              return "amber";
  if (key.includes("closed_won"))       return "emerald";
  return "indigo";
}

// ── Props ─────────────────────────────────────────────────────────────────────
export interface EnrichmentOutcomesClientProps {
  initialConfig:           OutcomeMetricConfig[];
  initialMtd:              OutcomeMtdSummary;
  initialMonthlyBreakdown: MonthlyOutcomeBreakdown[];
  initialLastSynced:       string | null;
}

// ── Main component ────────────────────────────────────────────────────────────
export function EnrichmentOutcomesClient({
  initialConfig,
  initialMtd,
  initialMonthlyBreakdown,
  initialLastSynced,
}: EnrichmentOutcomesClientProps) {
  const [config]              = useState(initialConfig);
  const [mtd, setMtd]         = useState(initialMtd);
  const [monthly, setMonthly] = useState(initialMonthlyBreakdown);
  const [lastSynced, setLastSynced] = useState(initialLastSynced);
  const [scope, setScope]     = useState<Scope>("all_time");
  const [backfillOpen, setBackfillOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast]     = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/outcomes/enrichment");
      if (!res.ok) return;
      const d = await res.json();
      setMtd(d.mtd ?? {});
      setMonthly(d.monthlyBreakdown ?? []);
      setLastSynced(d.lastSynced ?? null);
    } catch { /* ignore */ }
  }, []);

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch("/api/outcomes/trigger-enrichment", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Sync failed");
      setToast({ msg: "Sync complete", type: "success" });
      await fetchData();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "Sync failed", type: "error" });
    } finally {
      setSyncing(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  const configKeys = config.map((c) => c.metric_key);

  const allTimeValues = useMemo(
    () => computeAllTime(monthly, configKeys),
    [monthly, configKeys],
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    const keys = ["demos_booked_mtd", "demos_held_mtd", "closed_won_mtd", "arr_closed_mtd"] as const;
    for (const key of keys) {
      const tableSum = monthly.reduce((acc, m) => acc + ((m.metrics[key] as number) ?? 0), 0);
      const headlineValue = (allTimeValues[key] as number) ?? 0;
      if (Math.abs(tableSum - headlineValue) > 1) {
        console.warn(`[ENRICHMENT] ${key} mismatch: headline=${headlineValue} table_sum=${tableSum}`);
      }
    }
  }, [allTimeValues, monthly]);

  const displayValues: OutcomeMtdSummary =
    scope === "all_time" ? allTimeValues : mtd;

  // Sparkline data per metric from monthly breakdown
  const sparkMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const key of configKeys) {
      const pts = [...monthly]
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((b) => (b.metrics[key] as number) ?? 0);
      if (pts.some((v) => v > 0)) map.set(key, pts);
    }
    return map;
  }, [monthly, configKeys]);

  function timeAgo(ts: string) {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <div className="flex-1 min-h-screen bg-slate-50 dark:bg-slate-950 p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Enrichment — Outcomes
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            MAD-ID enriched agent pipeline metrics
            {lastSynced && (
              <span className="ml-2 text-slate-400 dark:text-slate-500">
                · Synced {timeAgo(lastSynced)}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Scope selector */}
          <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden text-sm font-semibold">
            {SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setScope(opt.value)}
                className={`px-3 py-2 transition-colors ${
                  scope === opt.value
                    ? "bg-indigo-600 text-white"
                    : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={syncNow}
            disabled={syncing}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
          <button
            onClick={() => setBackfillOpen(true)}
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-colors"
          >
            Backfill
          </button>
        </div>
      </div>

      {/* KPI cards — 5 pipeline metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        {config
          .filter((c) =>
            c.metric_key !== "agents_enriched_total" &&
            c.metric_key !== "agents_enriched_period" &&
            c.metric_key !== "agents_pushed_hubspot_total",
          )
          .map((c) => {
            // "Pushed to HubSpot": show all-time total when scope = all_time
            const metricKey =
              c.metric_key === "agents_pushed_hubspot" && scope === "all_time"
                ? "agents_pushed_hubspot_total"
                : c.metric_key;
            const value = (displayValues[metricKey] as number) ?? 0;
            const isCurrency = c.metric_key === "arr_closed_mtd";
            return (
              <HeroStatCard
                key={c.metric_key}
                label={c.label}
                value={value}
                sparkData={sparkMap.get(c.metric_key)}
                isCurrency={isCurrency}
                accent={accentFor(c.metric_key)}
                note={noteFor(c.metric_key, scope)}
              />
            );
          })}
      </div>

      {/* Monthly breakdown table */}
      {monthly.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Monthly Breakdown</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="text-left px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    Month
                  </th>
                  {config
                    .filter((c) => c.metric_key !== "agents_enriched_total" && c.metric_key !== "agents_enriched_period" && c.metric_key !== "agents_pushed_hubspot_total")
                    .map((c) => (
                      <th
                        key={c.metric_key}
                        className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap"
                      >
                        {c.label}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                {monthly.map((row) => (
                  <tr key={row.month} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                      {row.monthLabel}
                    </td>
                    {config
                      .filter((c) => c.metric_key !== "agents_enriched_total" && c.metric_key !== "agents_enriched_period" && c.metric_key !== "agents_pushed_hubspot_total")
                      .map((c) => {
                        const val = (row.metrics[c.metric_key] as number) ?? 0;
                        const isCur = c.metric_key === "arr_closed_mtd";
                        return (
                          <td key={c.metric_key} className="text-right px-4 py-3 text-slate-600 dark:text-slate-400 tabular-nums">
                            {isCur ? formatCurrency(val) : val.toLocaleString()}
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

      {/* Modals / toasts */}
      {backfillOpen && (
        <BackfillModal
          onClose={() => setBackfillOpen(false)}
          onStarted={(from, to) => {
            setBackfillOpen(false);
            setToast({ msg: `Backfill started for ${from} → ${to}. Running in background — refresh in a few minutes to see updated data.`, type: "success" });
            setTimeout(() => setToast(null), 8000);
          }}
          onDone={(from, to) => {
            setBackfillOpen(false);
            setToast({ msg: `Backfill complete — metrics synced from ${from} to ${to}.`, type: "success" });
            fetchData();
          }}
        />
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
