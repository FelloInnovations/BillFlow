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
}: {
  label: string;
  value: number;
  sparkData?: number[];
  isCurrency?: boolean;
  accent?: "indigo" | "emerald" | "amber" | "violet" | "sky";
  note?: string;
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
  type,
  onClose,
  onDone,
  onStarted,
  backfillRunning,
  onReleaseLock,
}: {
  type: "contact" | "team";
  onClose: () => void;
  onDone: (from: string, to: string) => void;
  onStarted: (from: string, to: string) => void;
  backfillRunning: boolean;
  onReleaseLock: () => Promise<void>;
}) {
  const today = new Date().toISOString().substring(0, 10);
  const [from, setFrom]       = useState("2025-05-01");
  const [to, setTo]           = useState(today);
  const [loading, setLoading] = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  const endpoint = type === "team"
    ? "/api/outcomes/trigger-backfill-enrichment-teams"
    : "/api/outcomes/trigger-backfill-enrichment";

  const title = type === "team"
    ? "Backfill Team Metrics"
    : "Backfill Enrichment Metrics";

  async function run() {
    if (!from || !to) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(endpoint, {
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
        <h3 className="font-bold text-slate-900 dark:text-white mb-4">{title}</h3>
        {backfillRunning ? (
          <div className="mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 px-3 py-2">
            <p className="text-[11px] text-amber-700 dark:text-amber-400 mb-1.5">
              A backfill is currently running. Wait for it to complete, or release the lock if it crashed.
            </p>
            <button
              onClick={onReleaseLock}
              className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 underline underline-offset-2"
            >
              Release Lock
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
            Set &lsquo;From&rsquo; to your earliest expected data date
          </p>
        )}
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-medium text-slate-500 dark:text-slate-400 block mb-1">From</label>
            <input
              type="date"
              value={from}
              min="2025-05-01"
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
            disabled={loading || !from || !to || backfillRunning}
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

// Keys whose all-time value is a SUM across months (additive period metrics)
const SUM_KEYS = new Set([
  "agents_enriched_period",
  "agents_pushed_hubspot",
  "teams_enriched_period",
  "teams_pushed_hubspot",
]);

// MTD snapshot metrics: all-time = sum of per-month totals
const SNAPSHOT_KEYS = new Set([
  "demos_booked_mtd",
  "demos_held_mtd",
  "closed_won_mtd",
  "arr_closed_mtd",
  "team_demos_booked_mtd",
  "team_demos_held_mtd",
  "team_closed_won_mtd",
  "team_arr_closed_mtd",
]);

// Keys whose all-time value = latest snapshot (running total, not cumulative sum)
const LATEST_TOTAL_KEYS = new Set([
  "agents_enriched_total",
  "agents_pushed_hubspot_total",
  "teams_enriched_total",
  "teams_pushed_hubspot_total",
]);

function aggregateSnapshotMetric(rows: MonthlyOutcomeBreakdown[], key: string): number {
  return rows.reduce((s, m) => s + ((m.metrics[key] as number) ?? 0), 0);
}

function computeAllTime(
  monthly: MonthlyOutcomeBreakdown[],
  configKeys: string[],
): OutcomeMtdSummary {
  const result: OutcomeMtdSummary = {};
  const sorted = [...monthly].sort((a, b) => b.month.localeCompare(a.month));
  for (const key of configKeys) {
    if (LATEST_TOTAL_KEYS.has(key)) {
      result[key] = Math.max(0, ...monthly.map((m) => (m.metrics[key] as number) ?? 0));
    } else if (SUM_KEYS.has(key) || SNAPSHOT_KEYS.has(key)) {
      result[key] = aggregateSnapshotMetric(monthly, key);
    } else {
      result[key] = (sorted[0]?.metrics[key] as number) ?? 0;
    }
  }
  return result;
}

function noteFor(key: string, scope: Scope): string {
  if (key === "agents_enriched_total" || key === "teams_enriched_total") return "all time";
  if (scope === "all_time") return "all time";
  return (key === "agents_enriched_period" || key === "teams_enriched_period") ? "this month" : "month-to-date";
}

function accentFor(key: string): "indigo" | "emerald" | "amber" | "violet" | "sky" {
  if (key === "agents_enriched_total"  || key === "teams_enriched_total")  return "violet";
  if (key === "agents_enriched_period" || key === "teams_enriched_period") return "sky";
  if (key === "agents_pushed_hubspot"  || key === "teams_pushed_hubspot")  return "indigo";
  if (key.includes("arr"))             return "amber";
  if (key.includes("closed_won"))      return "emerald";
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

  // Tabs
  const [activeTab, setActiveTab] = useState<"contact" | "team">("contact");

  // Independent scope selectors per tab
  const [contactScope, setContactScope] = useState<Scope>("all_time");
  const [teamScope, setTeamScope]       = useState<Scope>("all_time");

  // Backfill state (shared lock)
  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillOpen, setBackfillOpen]       = useState(false);
  const [backfillType, setBackfillType]       = useState<"contact" | "team">("contact");

  // Sync states
  const [syncingContact, setSyncingContact] = useState(false);
  const [syncingTeam, setSyncingTeam]       = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  // Split config by tab
  const contactConfig = config.filter((c) => !c.metric_key.startsWith("team"));
  const teamConfig    = config.filter((c) => c.metric_key.startsWith("team"));

  const contactConfigKeys = contactConfig.map((c) => c.metric_key);
  const teamConfigKeys    = teamConfig.map((c) => c.metric_key);

  // Fetch lock status on mount
  useEffect(() => {
    fetch("/api/outcomes/backfill-status")
      .then((r) => r.json())
      .then((d: { running: boolean }) => setBackfillRunning(d.running))
      .catch(() => {});
  }, []);

  // Poll lock status every 30s while the modal is open
  useEffect(() => {
    if (!backfillOpen) return;
    const id = setInterval(() => {
      fetch("/api/outcomes/backfill-status")
        .then((r) => r.json())
        .then((d: { running: boolean }) => setBackfillRunning(d.running))
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(id);
  }, [backfillOpen]);

  async function releaseLock() {
    try {
      const res = await fetch("/api/outcomes/trigger-release-lock", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Release failed");
      setBackfillRunning(false);
      setToast({ msg: "Lock released — you can now start a new backfill.", type: "success" });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "Failed to release lock", type: "error" });
    } finally {
      setTimeout(() => setToast(null), 4000);
    }
  }

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

  // While a backfill is running, poll every 60s; refresh data when it finishes
  useEffect(() => {
    if (!backfillRunning) return;
    const id = setInterval(async () => {
      try {
        const res  = await fetch("/api/outcomes/backfill-status");
        const data = await res.json() as { running: boolean };
        if (!data.running) {
          clearInterval(id);
          setBackfillRunning(false);
          await fetchData();
          setToast({ msg: "Backfill complete — data updated.", type: "success" });
          setTimeout(() => setToast(null), 5000);
        }
      } catch { /* non-fatal */ }
    }, 60_000);
    return () => clearInterval(id);
  }, [backfillRunning, fetchData]);

  async function syncContactNow() {
    setSyncingContact(true);
    try {
      const res = await fetch("/api/outcomes/trigger-enrichment", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Sync failed");
      setToast({ msg: "Contact sync complete", type: "success" });
      await fetchData();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "Contact sync failed", type: "error" });
    } finally {
      setSyncingContact(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  async function syncTeamNow() {
    setSyncingTeam(true);
    try {
      const res = await fetch("/api/outcomes/trigger-enrichment-teams", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Sync failed");
      setToast({ msg: "Team sync complete", type: "success" });
      await fetchData();
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : "Team sync failed", type: "error" });
    } finally {
      setSyncingTeam(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  // All-time aggregation
  const allTimeValues = useMemo(
    () => computeAllTime(monthly, [...contactConfigKeys, ...teamConfigKeys]),
    [monthly, contactConfigKeys, teamConfigKeys],
  );

  const contactDisplay: OutcomeMtdSummary = contactScope === "all_time" ? allTimeValues : mtd;
  const teamDisplay: OutcomeMtdSummary    = teamScope    === "all_time" ? allTimeValues : mtd;

  // Sparklines
  const sparkMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const key of [...contactConfigKeys, ...teamConfigKeys]) {
      const pts = [...monthly]
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((b) => (b.metrics[key] as number) ?? 0);
      if (pts.some((v) => v > 0)) map.set(key, pts);
    }
    return map;
  }, [monthly, contactConfigKeys, teamConfigKeys]);

  function timeAgo(ts: string) {
    const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
    if (diff < 1) return "just now";
    if (diff < 60) return `${diff}m ago`;
    const h = Math.floor(diff / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  // ── Contact tab pipeline metric keys (excludes total / period totals) ────────
  const contactPipelineFilter = (c: OutcomeMetricConfig) =>
    !["agents_enriched_total", "agents_enriched_period", "agents_pushed_hubspot_total"].includes(c.metric_key);

  // ── Team tab pipeline metric keys ─────────────────────────────────────────────
  const teamPipelineFilter = (c: OutcomeMetricConfig) =>
    !["teams_enriched_total", "teams_enriched_period", "teams_pushed_hubspot_total"].includes(c.metric_key);

  const isRunning = backfillRunning;

  return (
    <div className="flex-1 min-h-screen bg-slate-50 dark:bg-slate-950 p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
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
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6">
        {(["contact", "team"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === tab
                ? "text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-600 dark:border-indigo-400 -mb-px"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {tab === "contact" ? "Contact Level" : "Team Level"}
          </button>
        ))}
      </div>

      {/* ── Contact Level Tab ─────────────────────────────────────────────────── */}
      {activeTab === "contact" && (
        <>
          {/* Tab toolbar */}
          <div className="flex items-center justify-end gap-2 mb-6">
            <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden text-sm font-semibold">
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setContactScope(opt.value)}
                  className={`px-3 py-2 transition-colors ${
                    contactScope === opt.value
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={syncContactNow}
              disabled={syncingContact}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {syncingContact ? "Syncing…" : "Sync Now"}
            </button>
            <button
              onClick={() => { setBackfillType("contact"); setBackfillOpen(true); }}
              className={`px-4 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                isRunning
                  ? "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 cursor-default"
                  : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
              }`}
            >
              {isRunning ? "Backfill Running…" : "Backfill"}
            </button>
          </div>

          {/* Hero cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
            {contactConfig.filter(contactPipelineFilter).map((c) => {
              const value = (contactDisplay[c.metric_key] as number) ?? 0;
              return (
                <HeroStatCard
                  key={c.metric_key}
                  label={c.label}
                  value={value}
                  sparkData={sparkMap.get(c.metric_key)}
                  isCurrency={c.metric_key === "arr_closed_mtd"}
                  accent={accentFor(c.metric_key)}
                  note={noteFor(c.metric_key, contactScope)}
                />
              );
            })}
          </div>

          {/* Monthly table */}
          {monthly.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Monthly Breakdown</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Month</th>
                      {contactConfig.filter(contactPipelineFilter).map((c) => (
                        <th key={c.metric_key} className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                    {monthly.map((row) => (
                      <tr key={row.month} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">{row.monthLabel}</td>
                        {contactConfig.filter(contactPipelineFilter).map((c) => {
                          const val = (row.metrics[c.metric_key] as number) ?? 0;
                          return (
                            <td key={c.metric_key} className="text-right px-4 py-3 text-slate-600 dark:text-slate-400 tabular-nums">
                              {c.metric_key === "arr_closed_mtd" ? formatCurrency(val) : val.toLocaleString()}
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
        </>
      )}

      {/* ── Team Level Tab ────────────────────────────────────────────────────── */}
      {activeTab === "team" && (
        <>
          {/* Tab toolbar */}
          <div className="flex items-center justify-end gap-2 mb-6">
            <div className="flex rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden text-sm font-semibold">
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTeamScope(opt.value)}
                  className={`px-3 py-2 transition-colors ${
                    teamScope === opt.value
                      ? "bg-indigo-600 text-white"
                      : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <button
              onClick={syncTeamNow}
              disabled={syncingTeam}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {syncingTeam ? "Syncing…" : "Sync Now"}
            </button>
            <button
              onClick={() => { setBackfillType("team"); setBackfillOpen(true); }}
              className={`px-4 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                isRunning
                  ? "border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 cursor-default"
                  : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
              }`}
            >
              {isRunning ? "Backfill Running…" : "Backfill"}
            </button>
          </div>

          {/* Hero cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
            {teamConfig.filter(teamPipelineFilter).map((c) => {
              const value = (teamDisplay[c.metric_key] as number) ?? 0;
              return (
                <HeroStatCard
                  key={c.metric_key}
                  label={c.label}
                  value={value}
                  sparkData={sparkMap.get(c.metric_key)}
                  isCurrency={c.metric_key === "team_arr_closed_mtd"}
                  accent={accentFor(c.metric_key)}
                  note={noteFor(c.metric_key, teamScope)}
                />
              );
            })}
          </div>

          {/* Team monthly table */}
          {monthly.length > 0 && (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Monthly Breakdown</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="text-left px-6 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Month</th>
                      {teamConfig.filter(teamPipelineFilter).map((c) => (
                        <th key={c.metric_key} className="text-right px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                    {monthly.map((row) => (
                      <tr key={row.month} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-3 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">{row.monthLabel}</td>
                        {teamConfig.filter(teamPipelineFilter).map((c) => {
                          const val = (row.metrics[c.metric_key] as number) ?? 0;
                          return (
                            <td key={c.metric_key} className="text-right px-4 py-3 text-slate-600 dark:text-slate-400 tabular-nums">
                              {c.metric_key === "team_arr_closed_mtd" ? formatCurrency(val) : val.toLocaleString()}
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
        </>
      )}

      {/* Modals / toasts */}
      {backfillOpen && (
        <BackfillModal
          type={backfillType}
          onClose={() => setBackfillOpen(false)}
          backfillRunning={backfillRunning}
          onReleaseLock={async () => { setBackfillOpen(false); await releaseLock(); }}
          onStarted={(from, to) => {
            setBackfillOpen(false);
            setBackfillRunning(true);
            setToast({ msg: `Backfill started for ${from} → ${to}. Running in background — refresh in a few minutes to see updated data.`, type: "success" });
            setTimeout(() => setToast(null), 8000);
          }}
          onDone={(from, to) => {
            setBackfillOpen(false);
            setBackfillRunning(false);
            setToast({ msg: `Backfill complete — metrics synced from ${from} to ${to}.`, type: "success" });
            fetchData();
          }}
        />
      )}
      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
