"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { RefreshCw, CheckCircle2, X, TrendingUp, TrendingDown } from "lucide-react";
import { MonthlyOutcomeBreakdown, MonthlyOutcomeMetrics, OutcomeMetricConfig, OutcomeMtdSummary } from "@/types";
import { cn } from "@/lib/utils";

const usd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

function fmt(key: string, v: number | undefined | null): string {
  if (v == null) return "—";
  if (key === "arr_closed_mtd") return usd(v);
  return v.toLocaleString();
}

function convPct(numerator: number | undefined, denominator: number | undefined): string {
  if (denominator == null || denominator === 0) return "—";
  if (numerator == null) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function avgDeal(arr: number | undefined, deals: number | undefined): string {
  if (!deals) return "—";
  return `${usd((arr ?? 0) / deals)}/deal`;
}

function sourcePct(count: number, total: number): string {
  if (!total) return "—";
  return `${((count / total) * 100).toFixed(1)}%`;
}

// ── Scope ─────────────────────────────────────────────────────────────────────

type Scope = "this_month" | "last_month" | "6m" | "12m" | "all";

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "this_month",  label: "This Month" },
  { value: "last_month",  label: "Last Month" },
  { value: "6m",          label: "Last 6 Months" },
  { value: "12m",         label: "Last 12 Months" },
  { value: "all",         label: "All Time" },
];

function getScopeLabel(scope: Scope): string {
  return SCOPE_OPTIONS.find((o) => o.value === scope)?.label ?? scope;
}

function getLastNMonths(n: number): Set<string> {
  const result = new Set<string>();
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    result.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return result;
}

function computeScoped(breakdown: MonthlyOutcomeBreakdown[], scope: Scope): OutcomeMtdSummary {
  const now = new Date();
  let targetMonths: Set<string>;

  if (scope === "this_month") {
    const m = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    targetMonths = new Set([m]);
  } else if (scope === "last_month") {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const m = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    targetMonths = new Set([m]);
  } else if (scope === "6m") {
    targetMonths = getLastNMonths(6);
  } else if (scope === "12m") {
    targetMonths = getLastNMonths(12);
  } else {
    targetMonths = new Set(breakdown.map((b) => b.month));
  }

  const result: OutcomeMtdSummary = {};
  for (const b of breakdown) {
    if (!targetMonths.has(b.month)) continue;
    for (const [key, val] of Object.entries(b.metrics)) {
      result[key] = ((result[key] as number) ?? 0) + (val as number);
    }
  }
  return result;
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

// ── Backfill Modal ────────────────────────────────────────────────────────────
function BackfillModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
  const [from, setFrom]   = useState("2024-12-01");
  const [to,   setTo]     = useState(yesterday);
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState<{
    contacts_found: number;
    dates_with_traffic: number;
    months_processed: number;
    rows_upserted: number;
    errors: string[];
  } | null>(null);

  async function handleRun() {
    setRunning(true);
    setResult(null);
    try {
      const res  = await fetch("/api/outcomes/backfill-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const data = await res.json();
      setResult(data);
      if (!data.errors?.length) onDone();
    } catch (e) {
      setResult({ contacts_found: 0, dates_with_traffic: 0, months_processed: 0, rows_upserted: 0, errors: [String(e)] });
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <h2 className="text-base font-bold text-white">Backfill Historical Data</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-6 py-4 space-y-4">
            <p className="text-xs text-slate-400">
              Fetches all AI-referral contacts from HubSpot in one pass and populates daily traffic + monthly MTD rows for the selected range.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">From</label>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">To</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
              </div>
            </div>

            {result && (
              <div className={cn(
                "rounded-xl border p-3 text-xs space-y-1",
                result.errors.length
                  ? "bg-red-950 border-red-800 text-red-300"
                  : "bg-emerald-950 border-emerald-800 text-emerald-300",
              )}>
                {result.errors.length ? (
                  <p className="font-bold">{result.errors[0]}</p>
                ) : (
                  <>
                    <p><span className="font-bold">{result.contacts_found}</span> contacts found</p>
                    <p><span className="font-bold">{result.dates_with_traffic}</span> dates with traffic</p>
                    <p><span className="font-bold">{result.months_processed}</span> months processed</p>
                    <p><span className="font-bold">{result.rows_upserted}</span> rows upserted</p>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">
              Close
            </button>
            <button
              onClick={handleRun}
              disabled={running || !from || !to}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", running && "animate-spin")} />
              {running ? "Running…" : result ? "Run Again" : "Run Backfill"}
            </button>
          </div>
        </div>
      </div>
    </>
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
  const [date, setDate]     = useState(today);
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
        <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 sticky top-0 bg-slate-900">
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
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">
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

// ── Funnel ────────────────────────────────────────────────────────────────────
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
function ChartTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
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

// ── Source row in AI Traffic Sources card ─────────────────────────────────────
function SourceRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = sourcePct(count, total);
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex items-center gap-2">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
      </div>
      <div className="flex items-center gap-3 tabular-nums">
        <span className="text-xs text-slate-400">{pct}</span>
        <span className="text-sm font-bold text-slate-900 dark:text-white">
          {count > 0 ? count.toLocaleString() : "—"}
        </span>
      </div>
    </div>
  );
}

// ── Sparkline helpers ─────────────────────────────────────────────────────────
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return <div className="h-7" />;
  return (
    <ResponsiveContainer width="100%" height={28}>
      <AreaChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.15} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function SparkTile({ label, total, data, color, currency = false }: {
  label: string; total: number; data: number[]; color: string; currency?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-900 dark:text-white tabular-nums leading-tight">
        {currency
          ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(total)
          : total.toLocaleString()}
      </p>
      <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">last 6 months</p>
      <Sparkline data={data} color={color} />
    </div>
  );
}

const SPARK_TILES: { label: string; key: keyof MonthlyOutcomeMetrics; color: string; currency?: boolean }[] = [
  { label: "LLM Traffic",  key: "llm_traffic_daily", color: "#6366f1" },
  { label: "Demos Held",   key: "demos_held_mtd",    color: "#10b981" },
  { label: "Closed Won",   key: "closed_won_mtd",    color: "#f59e0b" },
  { label: "ARR Closed",   key: "arr_closed_mtd",    color: "#06b6d4", currency: true },
];

// ── Section divider ───────────────────────────────────────────────────────────
function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-4">
      <hr className="flex-1 border-slate-100 dark:border-slate-800" />
      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-600">{label}</span>
      <hr className="flex-1 border-slate-100 dark:border-slate-800" />
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
  initialMonthlyBreakdown: MonthlyOutcomeBreakdown[];
}

type Range = "7D" | "30D" | "MTD";

// Source color palette consistent with BillFlow charts
const SOURCE_COLORS = {
  ChatGPT:    "#10b981",
  Perplexity: "#818cf8",
  Claude:     "#f59e0b",
  "Other AI": "#94a3b8",
} as const;

export function OutcomesClient({
  projectId,
  initialConfig,
  initialMtd,
  initialSeries,
  initialLastSynced,
  initialMonthlyBreakdown,
}: Props) {
  const [config, setConfig]                     = useState(initialConfig);
  const [mtd, setMtd]                           = useState<OutcomeMtdSummary>(initialMtd);
  const [series, setSeries]                     = useState(initialSeries);
  const [lastSynced, setLastSynced]             = useState(initialLastSynced);
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<MonthlyOutcomeBreakdown[]>(initialMonthlyBreakdown);
  const [scope, setScope]                       = useState<Scope>("6m");
  const [range, setRange]                       = useState<Range>("MTD");
  const [syncing, setSyncing]                   = useState(false);
  const [logOpen, setLogOpen]                   = useState(false);
  const [backfillOpen, setBackfillOpen]         = useState(false);
  const [toast, setToast]                       = useState<{ msg: string; type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Scoped totals derived from monthlyBreakdown — no extra API call needed
  const scoped = useMemo(() => computeScoped(monthlyBreakdown, scope), [monthlyBreakdown, scope]);
  const scopeLabel = getScopeLabel(scope);

  const fetchData = useCallback(async (r: Range) => {
    const now = new Date();
    const to  = now.toISOString().substring(0, 10);
    let from: string;
    if (r === "7D") {
      from = new Date(now.getTime() - 7 * 86_400_000).toISOString().substring(0, 10);
    } else if (r === "30D") {
      from = new Date(now.getTime() - 30 * 86_400_000).toISOString().substring(0, 10);
    } else {
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
      setMonthlyBreakdown(data.monthlyBreakdown ?? []);
    } catch { /* silent */ }
  }, [projectId]);

  async function syncNow() {
    setSyncing(true);
    try {
      const res  = await fetch("/api/outcomes/sync-now", { method: "POST" });
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

  // ── Derived values ────────────────────────────────────────────────────────
  const byDate: Record<string, Record<string, number>> = {};
  for (const row of series) {
    if (!byDate[row.date]) byDate[row.date] = {};
    byDate[row.date][row.metric_key] = Number(row.value);
  }
  const allDates = Object.keys(byDate).sort();

  const trafficData = allDates.map((d) => ({
    date:       d.substring(5),
    ChatGPT:    byDate[d].llm_chatgpt_daily    ?? 0,
    Perplexity: byDate[d].llm_perplexity_daily ?? 0,
    Claude:     byDate[d].llm_claude_daily     ?? 0,
    "Other AI": byDate[d].llm_other_daily      ?? 0,
  }));

  const demosData = allDates.map((d, i) => {
    const prev   = i > 0 ? byDate[allDates[i - 1]] : {};
    const booked = Math.max(0, (byDate[d].demos_booked_mtd ?? 0) - (prev.demos_booked_mtd ?? 0));
    const held   = Math.max(0, (byDate[d].demos_held_mtd   ?? 0) - (prev.demos_held_mtd   ?? 0));
    return { date: d.substring(5), "Demos Booked": booked, "Demos Held": held };
  });

  // MoM ARR delta (only shown in "this_month" scope)
  const now = new Date();
  const prevMonthStr   = String(now.getMonth()).padStart(2, "0");
  const prevMonthStart = `${now.getFullYear()}-${prevMonthStr}-01`;
  const prevMonthEnd   = `${now.getFullYear()}-${prevMonthStr}-31`;
  const prevArr = series
    .filter((r) => r.metric_key === "arr_closed_mtd" && r.date >= prevMonthStart && r.date <= prevMonthEnd)
    .reduce((max, r) => Math.max(max, Number(r.value)), -1);
  const currArr  = (scoped.arr_closed_mtd as number) ?? 0;
  const arrDelta = scope === "this_month" && prevArr >= 0 ? currArr - prevArr : null;

  // Scoped funnel values
  const llm    = scoped.llm_traffic_daily  as number | undefined;
  const booked = scoped.demos_booked_mtd   as number | undefined;
  const held   = scoped.demos_held_mtd     as number | undefined;
  const won    = scoped.closed_won_mtd     as number | undefined;
  const arr    = scoped.arr_closed_mtd     as number | undefined;

  // Scoped AI Traffic Sources
  const chatgptScoped    = (scoped.llm_chatgpt_daily    as number) ?? 0;
  const perplexityScoped = (scoped.llm_perplexity_daily as number) ?? 0;
  const claudeScoped     = (scoped.llm_claude_daily     as number) ?? 0;
  const otherScoped      = (scoped.llm_other_daily      as number) ?? 0;
  const totalLlmScoped   = chatgptScoped + perplexityScoped + claudeScoped + otherScoped;

  const syncedLabel = lastSynced
    ? new Date(lastSynced).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : "Never";

  const hasTrafficData = trafficData.some(
    (d) => d.ChatGPT + d.Perplexity + d.Claude + d["Other AI"] > 0,
  );

  // Sparkline tiles — last 6 months oldest→newest
  const spark6 = monthlyBreakdown.slice(0, 6).reverse();
  const currentMonth = now.toISOString().substring(0, 7);

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
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
          {/* Scope selector */}
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
          >
            {SCOPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

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
          <button
            onClick={() => setBackfillOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Backfill
          </button>
        </div>
      </div>

      {/* ── AI Traffic Sources ─────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
              AI Traffic Sources
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              LLM platforms sending AI-referral contacts · {scopeLabel}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900 dark:text-white tabular-nums">
              {totalLlmScoped.toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">Total LLM Traffic</p>
          </div>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <SourceRow label="ChatGPT"    count={chatgptScoped}    total={totalLlmScoped} color={SOURCE_COLORS.ChatGPT} />
          <SourceRow label="Perplexity" count={perplexityScoped} total={totalLlmScoped} color={SOURCE_COLORS.Perplexity} />
          <SourceRow label="Claude"     count={claudeScoped}     total={totalLlmScoped} color={SOURCE_COLORS.Claude} />
          <SourceRow label="Other AI"   count={otherScoped}      total={totalLlmScoped} color={SOURCE_COLORS["Other AI"]} />
        </div>
      </div>

      {/* ── Conversion Funnel ──────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-6">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
          AI Referral Funnel
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-5">{scopeLabel}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <FunnelStage label="LLM Traffic"  value={llm}    metricKey="llm_traffic_daily" />
          <Arrow label={convPct(booked, llm)} />
          <FunnelStage label="Demos Booked" value={booked} metricKey="demos_booked_mtd" />
          <Arrow label={convPct(held, booked)} />
          <FunnelStage label="Demos Held"   value={held}   metricKey="demos_held_mtd" />
          <Arrow label={convPct(won, held)} />
          <FunnelStage label="Closed Won"   value={won}    metricKey="closed_won_mtd" />
          <Arrow label={avgDeal(arr, won)} />
          <FunnelStage label="ARR Closed"   value={arr}    metricKey="arr_closed_mtd" />
        </div>
      </div>

      {/* ── ARR Card ───────────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-6">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
          ARR Closed
        </p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">{scopeLabel}</p>
        <div className="flex items-end gap-4">
          <p className="text-4xl font-bold text-slate-900 dark:text-white tabular-nums">
            {usd(currArr)}
          </p>
          {arrDelta != null && (
            <div className={cn("flex items-center gap-1 mb-1", arrDelta >= 0 ? "text-emerald-500" : "text-rose-500")}>
              {arrDelta >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="text-sm font-bold">
                {arrDelta >= 0 ? "+" : ""}{usd(arrDelta)} vs last month
              </span>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          Sum of current_arr__sync_ for AI-referral contacts with a closed deal in scope.
        </p>
      </div>

      <SectionDivider label="Monthly History" />

      {/* ── Sparkline tiles ────────────────────────────────────────────────── */}
      {spark6.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm px-6 py-5 grid grid-cols-2 lg:grid-cols-4 gap-6">
          {SPARK_TILES.map(({ label, key, color, currency }) => (
            <SparkTile
              key={key}
              label={label}
              total={spark6.reduce((s, m) => s + m.metrics[key], 0)}
              data={spark6.map((m) => m.metrics[key])}
              color={color}
              currency={currency}
            />
          ))}
        </div>
      )}

      {/* ── Monthly Performance table ──────────────────────────────────────── */}
      {monthlyBreakdown.length > 0 && (() => {
        const usdFmt = (v: number) =>
          new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

        return (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Monthly Performance</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">All months with data · newest first</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      Month
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wide whitespace-nowrap">
                      LLM Traffic
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap border-l border-slate-100 dark:border-slate-800">
                      ChatGPT
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      Perplexity
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      Claude
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      Other
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      Demos Booked
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      Demos Held
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">
                      Closed Won
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide whitespace-nowrap">
                      ARR Closed
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {monthlyBreakdown.map((row) => {
                    const isCurrent = row.month === currentMonth;
                    const m = row.metrics;
                    return (
                      <tr
                        key={row.month}
                        className={cn(
                          "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors",
                          isCurrent && "bg-indigo-50/40 dark:bg-indigo-950/20",
                        )}
                      >
                        <td className="px-6 py-3 whitespace-nowrap">
                          <span className={cn(
                            "font-medium text-slate-800 dark:text-slate-200",
                            isCurrent && "font-semibold",
                          )}>
                            {row.monthLabel}
                          </span>
                          {isCurrent && (
                            <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 uppercase tracking-wide align-middle">
                              current
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                          {m.llm_traffic_daily.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap border-l border-slate-100 dark:border-slate-800">
                          {m.llm_chatgpt_daily.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {m.llm_perplexity_daily.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {m.llm_claude_daily.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {m.llm_other_daily.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {m.demos_booked_mtd.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {m.demos_held_mtd.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {m.closed_won_mtd.toLocaleString()}
                        </td>
                        <td className="px-6 py-3 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {usdFmt(m.arr_closed_mtd)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      <SectionDivider label="Daily Activity" />

      {/* ── Time range toggle ──────────────────────────────────────────────── */}
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

      {/* ── Charts ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
            AI Referral Traffic by Source
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
            Daily contacts by originating LLM platform
          </p>
          {hasTrafficData ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trafficData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="ChatGPT"    stackId="s" stroke={SOURCE_COLORS.ChatGPT}    fill={SOURCE_COLORS.ChatGPT}    fillOpacity={0.35} strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="Perplexity" stackId="s" stroke={SOURCE_COLORS.Perplexity} fill={SOURCE_COLORS.Perplexity} fillOpacity={0.35} strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="Claude"     stackId="s" stroke={SOURCE_COLORS.Claude}     fill={SOURCE_COLORS.Claude}     fillOpacity={0.35} strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="Other AI"   stackId="s" stroke={SOURCE_COLORS["Other AI"]} fill={SOURCE_COLORS["Other AI"]} fillOpacity={0.35} strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-slate-400">
              No data for this range
            </div>
          )}
        </div>

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
            <div className="flex items-center justify-center h-[220px] text-sm text-slate-400">
              No data for this range
            </div>
          )}
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {backfillOpen && (
        <BackfillModal
          onClose={() => setBackfillOpen(false)}
          onDone={() => {
            setToast({ msg: "Backfill complete", type: "success" });
            fetchData(range);
          }}
        />
      )}

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
