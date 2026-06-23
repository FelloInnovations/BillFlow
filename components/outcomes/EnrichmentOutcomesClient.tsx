"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { formatCurrency, formatRelativeTime } from "@/lib/utils";
import {
  OutcomeMetricConfig,
  OutcomeMtdSummary,
  MonthlyOutcomeBreakdown,
} from "@/types";
import { OutcomesPageLayout, MonthlyColumn, MonthlyRow } from "./OutcomesPageLayout";
import type { FunnelStage } from "./FunnelFlow";
import type { TrendChartData } from "./TrendChartsGrid";
import { cn } from "@/lib/utils";

function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div
      className="fixed bottom-6 right-6 z-50 rounded-lg px-4 py-3 text-sm font-semibold shadow-lg text-white"
      style={{ backgroundColor: type === "success" ? "var(--bg-success-solid)" : "var(--bg-error-solid)" }}
    >
      {msg}
    </div>
  );
}

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

  const inputCls = "w-full rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--ring-brand-primary)]";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-xl p-6 w-80">
        <h3 className="font-semibold text-[var(--text-primary)] mb-4">{title}</h3>
        {backfillRunning ? (
          <div className="mb-3 rounded-lg bg-[var(--bg-warning-primary)] border border-[var(--border-warning)] px-3 py-2">
            <p className="text-[11px] text-[var(--text-warning-primary)] mb-1.5">
              A backfill is currently running. Wait for it to complete, or release the lock if it crashed.
            </p>
            <button
              onClick={onReleaseLock}
              className="text-[11px] font-semibold text-[var(--text-warning-primary)] underline underline-offset-2"
            >
              Release Lock
            </button>
          </div>
        ) : (
          <p className="text-[11px] text-[var(--text-tertiary)] mb-3">
            Set &lsquo;From&rsquo; to your earliest expected data date
          </p>
        )}
        <div className="space-y-3 mb-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] block mb-1">From</label>
            <input
              type="date"
              value={from}
              min="2025-05-01"
              onChange={(e) => setFrom(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] block mb-1">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        {err && <p className="text-xs text-[var(--text-error-primary)] mb-3">{err}</p>}
        <div className="flex gap-2">
          <button
            onClick={run}
            disabled={loading || !from || !to || backfillRunning}
            className="flex-1 rounded-lg disabled:opacity-50 text-white text-sm font-semibold py-2 transition-colors"
            style={{ backgroundColor: "var(--bg-brand-solid)" }}
          >
            {loading ? "Running…" : "Run Backfill"}
          </button>
          <button
            onClick={onClose}
            className="px-4 rounded-lg border border-[var(--border-tertiary)] text-sm text-[var(--text-tertiary)] hover:bg-[var(--bg-secondary)] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

type Scope = "all_time" | "this_month";

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "all_time",   label: "All Time"   },
  { value: "this_month", label: "This Month" },
];

const SUM_KEYS = new Set([
  "agents_enriched_period",
  "agents_pushed_hubspot",
  "teams_enriched_period",
  "teams_pushed_hubspot",
]);

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

function mkTrend(
  monthly: MonthlyOutcomeBreakdown[],
  label: string,
  key: string,
  monetary = false,
): TrendChartData {
  const data = [...monthly]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((m) => ({ month: m.month, value: (m.metrics[key] as number) ?? 0 }));
  const total = data.reduce((s, d) => s + d.value, 0);
  return {
    label, metricKey: key, data, totalValue: total,
    displayTotal: monetary ? formatCurrency(total) : total.toLocaleString(),
    isMonetary: monetary,
  };
}

export interface EnrichmentOutcomesClientProps {
  initialConfig:           OutcomeMetricConfig[];
  initialMtd:              OutcomeMtdSummary;
  initialMonthlyBreakdown: MonthlyOutcomeBreakdown[];
  initialLastSynced:       string | null;
}

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

  const [activeTab, setActiveTab] = useState<"contact" | "team">("contact");

  const [contactScope, setContactScope] = useState<Scope>("all_time");
  const [teamScope, setTeamScope]       = useState<Scope>("all_time");

  const [backfillRunning, setBackfillRunning] = useState(false);
  const [backfillOpen, setBackfillOpen]       = useState(false);
  const [backfillType, setBackfillType]       = useState<"contact" | "team">("contact");

  const [syncingContact, setSyncingContact] = useState(false);
  const [syncingTeam, setSyncingTeam]       = useState(false);

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const contactConfig = config.filter((c) => !c.metric_key.startsWith("team"));
  const teamConfig    = config.filter((c) => c.metric_key.startsWith("team"));

  const contactConfigKeys = contactConfig.map((c) => c.metric_key);
  const teamConfigKeys    = teamConfig.map((c) => c.metric_key);

  useEffect(() => {
    fetch("/api/outcomes/backfill-status")
      .then((r) => r.json())
      .then((d: { running: boolean }) => setBackfillRunning(d.running))
      .catch(() => {});
  }, []);

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

  const contactPipelineFilter = (c: OutcomeMetricConfig) =>
    !["agents_enriched_total", "agents_enriched_period", "agents_pushed_hubspot_total"].includes(c.metric_key);

  const teamPipelineFilter = (c: OutcomeMetricConfig) =>
    !["teams_enriched_total", "teams_enriched_period", "teams_pushed_hubspot_total"].includes(c.metric_key);

  const allTimeValues = useMemo(
    () => computeAllTime(monthly, [...contactConfigKeys, ...teamConfigKeys]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [monthly],
  );

  const contactDisplay: OutcomeMtdSummary = contactScope === "all_time" ? allTimeValues : mtd;
  const teamDisplay: OutcomeMtdSummary    = teamScope    === "all_time" ? allTimeValues : mtd;

  const contactFunnelStages = useMemo((): FunnelStage[] => {
    const pushed = (contactDisplay["agents_pushed_hubspot"] as number) ?? 0;
    const booked = (contactDisplay["demos_booked_mtd"]      as number) ?? 0;
    const held   = (contactDisplay["demos_held_mtd"]        as number) ?? 0;
    const won    = (contactDisplay["closed_won_mtd"]        as number) ?? 0;
    const arr    = (contactDisplay["arr_closed_mtd"]        as number) ?? 0;
    return [
      { label: "PUSHED", value: pushed, displayValue: pushed.toLocaleString(), conversionFromPrev: null },
      { label: "BOOKED", value: booked, displayValue: booked.toLocaleString(), conversionFromPrev: pushed > 0 ? booked / pushed : null },
      { label: "HELD",   value: held,   displayValue: held.toLocaleString(),   conversionFromPrev: booked > 0 ? held / booked : null },
      { label: "WON",    value: won,    displayValue: won.toLocaleString(),    conversionFromPrev: held > 0 ? won / held : null },
      { label: "ARR",    value: arr,    displayValue: formatCurrency(arr), isMonetary: true, conversionFromPrev: null },
    ];
  }, [contactDisplay]);

  const teamFunnelStages = useMemo((): FunnelStage[] => {
    const pushed = (teamDisplay["teams_pushed_hubspot"]   as number) ?? 0;
    const booked = (teamDisplay["team_demos_booked_mtd"]  as number) ?? 0;
    const held   = (teamDisplay["team_demos_held_mtd"]    as number) ?? 0;
    const won    = (teamDisplay["team_closed_won_mtd"]    as number) ?? 0;
    const arr    = (teamDisplay["team_arr_closed_mtd"]    as number) ?? 0;
    return [
      { label: "PUSHED", value: pushed, displayValue: pushed.toLocaleString(), conversionFromPrev: null },
      { label: "BOOKED", value: booked, displayValue: booked.toLocaleString(), conversionFromPrev: pushed > 0 ? booked / pushed : null },
      { label: "HELD",   value: held,   displayValue: held.toLocaleString(),   conversionFromPrev: booked > 0 ? held / booked : null },
      { label: "WON",    value: won,    displayValue: won.toLocaleString(),    conversionFromPrev: held > 0 ? won / held : null },
      { label: "ARR",    value: arr,    displayValue: formatCurrency(arr), isMonetary: true, conversionFromPrev: null },
    ];
  }, [teamDisplay]);

  const contactTrendCharts = useMemo((): TrendChartData[] => [
    mkTrend(monthly, "Demos Booked",  "demos_booked_mtd"),
    mkTrend(monthly, "Demos Held",    "demos_held_mtd"),
    mkTrend(monthly, "Closed Won",    "closed_won_mtd"),
    mkTrend(monthly, "ARR Closed",    "arr_closed_mtd", true),
  ], [monthly]);

  const teamTrendCharts = useMemo((): TrendChartData[] => [
    mkTrend(monthly, "Demos Booked",  "team_demos_booked_mtd"),
    mkTrend(monthly, "Demos Held",    "team_demos_held_mtd"),
    mkTrend(monthly, "Closed Won",    "team_closed_won_mtd"),
    mkTrend(monthly, "ARR Closed",    "team_arr_closed_mtd", true),
  ], [monthly]);

  const contactColumns: MonthlyColumn[] = [
    { key: "agents_pushed_hubspot", label: "Pushed" },
    { key: "demos_booked_mtd",      label: "Booked" },
    { key: "demos_held_mtd",        label: "Held" },
    { key: "closed_won_mtd",        label: "Won" },
    { key: "arr_closed_mtd",        label: "ARR", isMonetary: true },
  ];
  const teamColumns: MonthlyColumn[] = [
    { key: "teams_pushed_hubspot",  label: "Pushed" },
    { key: "team_demos_booked_mtd", label: "Booked" },
    { key: "team_demos_held_mtd",   label: "Held" },
    { key: "team_closed_won_mtd",   label: "Won" },
    { key: "team_arr_closed_mtd",   label: "ARR", isMonetary: true },
  ];

  const monthlyTableData = useMemo((): MonthlyRow[] =>
    [...monthly]
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((m) => ({ month: m.monthLabel, ...m.metrics })),
    [monthly],
  );

  void contactPipelineFilter;
  void teamPipelineFilter;

  const tabsSlot = (
    <div className="flex border-b border-[var(--border-tertiary)] mb-6">
      {(["contact", "team"] as const).map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={cn(
            "px-4 py-2 text-sm font-semibold transition-colors",
            activeTab === tab
              ? "text-[var(--text-brand-primary)] border-b-2 border-[var(--border-brand-solid)] -mb-px"
              : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]",
          )}
        >
          {tab === "contact" ? "Contact Level" : "Team Level"}
        </button>
      ))}
    </div>
  );

  return (
    <>
      <OutcomesPageLayout
        title="Enrichment — Outcomes"
        subtitle="MAD-ID enriched agent pipeline metrics"
        lastSynced={lastSynced ? formatRelativeTime(lastSynced) : ""}
        scope={activeTab === "contact" ? contactScope : teamScope}
        onScopeChange={(s) => activeTab === "contact" ? setContactScope(s as Scope) : setTeamScope(s as Scope)}
        scopeOptions={SCOPE_OPTIONS}
        funnelStages={activeTab === "contact" ? contactFunnelStages : teamFunnelStages}
        trendCharts={activeTab === "contact" ? contactTrendCharts : teamTrendCharts}
        monthlyData={monthlyTableData}
        monthlyColumns={activeTab === "contact" ? contactColumns : teamColumns}
        onSyncNow={activeTab === "contact" ? syncContactNow : syncTeamNow}
        onBackfill={() => { setBackfillType(activeTab); setBackfillOpen(true); }}
        backfillRunning={backfillRunning}
        syncingNow={activeTab === "contact" ? syncingContact : syncingTeam}
        tabs={tabsSlot}
      />
      {backfillOpen && (
        <BackfillModal
          type={backfillType}
          onClose={() => setBackfillOpen(false)}
          backfillRunning={backfillRunning}
          onReleaseLock={async () => { setBackfillOpen(false); await releaseLock(); }}
          onStarted={(from, to) => {
            setBackfillOpen(false);
            setBackfillRunning(true);
            setToast({ msg: `Backfill started for ${from} → ${to}. Running in background.`, type: "success" });
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
    </>
  );
}
