"use client";

import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { RefreshCw, CheckCircle2, X, TrendingUp, TrendingDown } from "lucide-react";
import { OutcomeMetricConfig, OutcomeMtdSummary } from "@/types";
import { cn } from "@/lib/utils";

const usd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

function fmt(key: string, v: number | undefined | null): string {
  if (v == null || v === 0) return "—";
  if (key === "arr_closed_mtd") return usd(v);
  return v.toLocaleString();
}

function convPct(numerator: number | undefined, denominator: number | undefined): string {
  if (!numerator || !denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function avgDeal(arr: number | undefined, deals: number | undefined): string {
  if (!arr || !deals) return "—";
  return `${usd(arr / deals)}/deal`;
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div
      className={cn(
        "fixed top-5 right-5 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium",
        type === "success"
          ? "bg-emerald-950 border-emerald-700 text-emerald-300"
          : "bg-red-950 border-red-700 text-red-300",
      )}
    >
      {type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
      {msg}
    </div>
  );
}

// ── Log Metrics Modal ─────────────────────────────────────────────────────────
function LogModal({
  projectId,
  config,
  onClose,
  onSaved,
}: {
  projectId: string;
  config: OutcomeMetricConfig[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    const filled = Object.entries(values).filter(([, v]) => v.trim() !== "");
    if (!filled.length) { onClose(); return; }
    setSaving(true);
    try {
      await Promise.all(
        filled.map(([key, val]) =>
          fetch(`/api/outcomes/${projectId}/log`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ metric_key: key, value: parseFloat(val), date }),
          }),
        ),
      );
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <h2 className="text-base font-bold text-white">Log Metrics</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>
            {config.map((c) => (
              <div key={c.metric_key}>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">
                  {c.label}
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  placeholder="leave blank to skip"
                  value={values[c.metric_key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [c.metric_key]: e.target.value }))}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm px-3 py-2 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            ))}
          </div>
          <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Funnel stage ──────────────────────────────────────────────────────────────
function FunnelStage({ label, value, metricKey }: { label: string; value: number | undefined; metricKey: string }) {
  return (
    <div className="flex flex-col items-center min-w-[100px]">
      <p className="text-2xl font-bold text-white tabular-nums">{fmt(metricKey, value)}</p>
      <p className="text-xs text-slate-400 mt-1 text-center leading-tight">{label}</p>
    </div>
  );
}

function Arrow({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center shrink-0">
      <span className="text-[10px] font-bold text-indigo-400 mb-1 whitespace-nowrap">{label}</span>
      <svg width="28" height="16" viewBox="0 0 28 16">
        <path d="M0 8 H22 M16 2 L26 8 L16 14" stroke="#818cf8" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 shadow-xl text-xs">
      <p className="text-slate-400 mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  projectId: string;
  initialConfig: OutcomeMetricConfig[];
  initialMtd: OutcomeMtdSummary;
  initialSeries: { metric_key: string; date: string; value: number }[];
  initialLastSynced: string | null;
}

type Range = "7D" | "30D" | "MTD";

export function OutcomesClient({
  projectId,
  initialConfig,
  initialMtd,
  initialSeries,
  initialLastSynced,
}: Props) {
  const [config, setConfig]           = useState(initialConfig);
  const [mtd, setMtd]                 = useState<OutcomeMtdSummary>(initialMtd);
  const [series, setSeries]           = useState(initialSeries);
  const [lastSynced, setLastSynced]   = useState(initialLastSynced);
  const [range, setRange]             = useState<Range>("MTD");
  const [syncing, setSyncing]         = useState(false);
  const [logOpen, setLogOpen]         = useState(false);
  const [toast, setToast]             = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const fetchData = useCallback(async (r: Range) => {
    const now = new Date();
    const to = now.toISOString().substring(0, 10);
    let from: string;
    if (r === "7D") {
      from = new Date(now.getTime() - 7 * 86_400_000).toISOString().substring(0, 10);
    } else if (r === "30D") {
      from = new Date(now.getTime() - 30 * 86_400_000).toISOString().substring(0, 10);
    } else {
      // MTD — start of current month
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    }
    try {
      const res = await fetch(`/api/outcomes/${projectId}?from=${from}&to=${to}`, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setConfig(data.config ?? []);
      setMtd(data.mtd ?? {});
      setSeries(data.series ?? []);
      setLastSynced(data.lastSynced ?? null);
    } catch { /* silent */ }
  }, [projectId]);

  async function syncNow() {
    setSyncing(true);
    try {
      const res = await fetch("/api/outcomes/sync-now", { method: "POST" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Sync failed");
      await fetchData(range);
      setToast({ msg: `Synced ${body.upserted?.length ?? 0} metrics`, type: "success" });
    } catch (err) {
      setToast({ msg: err instanceof Error ? err.message : "Sync failed", type: "error" });
    } finally {
      setSyncing(false);
    }
  }

  function handleRangeChange(r: Range) {
    setRange(r);
    fetchData(r);
  }

  // ── Build chart series ──────────────────────────────────────────────────────
  // Group series by date
  const byDate: Record<string, Record<string, number>> = {};
  for (const row of series) {
    if (!byDate[row.date]) byDate[row.date] = {};
    byDate[row.date][row.metric_key] = Number(row.value);
  }
  const allDates = Object.keys(byDate).sort();

  const trafficData = allDates.map((d) => ({
    date: d.substring(5), // MM-DD
    "LLM Traffic":  byDate[d].llm_traffic_daily  ?? 0,
    "Blog Traffic": byDate[d].blog_traffic_daily ?? 0,
  }));

  // For demos chart: compute daily delta from cumulative MTD values
  const demosData = allDates.map((d, i) => {
    const prev = i > 0 ? byDate[allDates[i - 1]] : {};
    const booked = Math.max(0, (byDate[d].demos_booked_mtd ?? 0) - (prev.demos_booked_mtd ?? 0));
    const held   = Math.max(0, (byDate[d].demos_held_mtd   ?? 0) - (prev.demos_held_mtd   ?? 0));
    return { date: d.substring(5), "Demos Booked": booked, "Demos Held": held };
  });

  // Prior month ARR (for MoM delta on ARR card)
  const now = new Date();
  const prevMonthStart = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}-01`;
  const prevMonthEnd   = `${now.getFullYear()}-${String(now.getMonth()).padStart(2, "0")}-31`;
  const prevMonthSeries = series.filter(
    (r) => r.metric_key === "arr_closed_mtd" && r.date >= prevMonthStart && r.date <= prevMonthEnd,
  );
  const prevArr = prevMonthSeries.length
    ? Math.max(...prevMonthSeries.map((r) => Number(r.value)))
    : null;
  const currArr = mtd.arr_closed_mtd ?? 0;
  const arrDelta = prevArr != null ? currArr - prevArr : null;

  // Funnel values
  const llm      = mtd.llm_traffic_daily;
  const booked   = mtd.demos_booked_mtd;
  const held     = mtd.demos_held_mtd;
  const won      = mtd.closed_won_mtd;
  const arr      = mtd.arr_closed_mtd;

  const syncedLabel = lastSynced
    ? new Date(lastSynced).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Never";

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            Arthur — Business Outcomes
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            AI referral funnel · HubSpot
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
            Last synced: {syncedLabel}
          </span>
          <button
            onClick={syncNow}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
            Sync Now
          </button>
          <button
            onClick={() => setLogOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Log Metrics
          </button>
        </div>
      </div>

      {/* Blog Traffic card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 border-t-4 border-t-violet-400 shadow-sm p-5">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          Content Traffic — Arthur's blogs
        </p>
        <p className="text-3xl font-bold text-slate-900 dark:text-white tabular-nums">
          {fmt("blog_traffic_daily", mtd.blog_traffic_daily)}
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
          Contacts whose first touch was an Arthur blog post via AI referral. MTD.
        </p>
      </div>

      {/* Conversion funnel */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-6">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-5">
          AI Referral Funnel — MTD
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <FunnelStage label="LLM Traffic" value={llm} metricKey="llm_traffic_daily" />
          <Arrow label={convPct(booked, llm)} />
          <FunnelStage label="Demos Booked" value={booked} metricKey="demos_booked_mtd" />
          <Arrow label={convPct(held, booked)} />
          <FunnelStage label="Demos Held" value={held} metricKey="demos_held_mtd" />
          <Arrow label={convPct(won, held)} />
          <FunnelStage label="Closed Won" value={won} metricKey="closed_won_mtd" />
          <Arrow label={avgDeal(arr, won)} />
          <FunnelStage label="ARR Closed" value={arr} metricKey="arr_closed_mtd" />
        </div>
      </div>

      {/* Time range toggle */}
      <div className="flex items-center gap-1">
        {(["7D", "30D", "MTD"] as Range[]).map((r) => (
          <button
            key={r}
            onClick={() => handleRangeChange(r)}
            className={cn(
              "px-3 py-1.5 text-xs font-bold rounded-lg transition-colors",
              range === r
                ? "bg-indigo-600 text-white"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800",
            )}
          >
            {r}
          </button>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Left: LLM + Blog Traffic line chart */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Traffic</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">LLM &amp; Blog traffic daily contacts</p>
          {trafficData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trafficData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="LLM Traffic"  stroke="#818cf8" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Blog Traffic" stroke="#a78bfa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-slate-400">No data for this range</div>
          )}
        </div>

        {/* Right: Demos Booked vs Held bar chart */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">Demos</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Daily demos booked vs. held</p>
          {demosData.some((d) => d["Demos Booked"] > 0 || d["Demos Held"] > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={demosData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Demos Booked" fill="#6366f1" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Demos Held"   fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-slate-400">No data for this range</div>
          )}
        </div>
      </div>

      {/* ARR card */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 border-t-4 border-t-emerald-400 shadow-sm p-6">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3">
          ARR Closed — MTD
        </p>
        <div className="flex items-end gap-4">
          <p className="text-4xl font-bold text-slate-900 dark:text-white tabular-nums">
            {currArr > 0 ? usd(currArr) : "—"}
          </p>
          {arrDelta != null && currArr > 0 && (
            <div className={cn("flex items-center gap-1 mb-1", arrDelta >= 0 ? "text-emerald-500" : "text-rose-500")}>
              {arrDelta >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="text-sm font-bold">
                {arrDelta >= 0 ? "+" : ""}{usd(arrDelta)} vs last month
              </span>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          Sum of current_arr__sync_ for AI-referral contacts with a closed deal this month.
        </p>
      </div>

      {/* Log Metrics modal */}
      {logOpen && (
        <LogModal
          projectId={projectId}
          config={config}
          onClose={() => setLogOpen(false)}
          onSaved={() => {
            setLogOpen(false);
            setToast({ msg: "Metrics logged successfully", type: "success" });
            fetchData(range);
          }}
        />
      )}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  );
}
