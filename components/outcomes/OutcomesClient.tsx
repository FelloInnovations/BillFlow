"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as RTooltip from "@radix-ui/react-tooltip";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { RefreshCw, CheckCircle2, X, Info, MoreHorizontal } from "lucide-react";
import { MonthlyOutcomeBreakdown, MonthlyOutcomeMetrics, OutcomeMetricConfig, OutcomeMtdSummary } from "@/types";
import { cn, formatRelativeTime } from "@/lib/utils";

const usd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

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

// ── Tooltip wrapper (Fix 4 / Fix 6) ──────────────────────────────────────────

function Tip({ content, children }: { content: string; children: React.ReactElement }) {
  return (
    <RTooltip.Root delayDuration={200}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          className="z-50 max-w-[280px] rounded-xl bg-slate-900 border border-slate-700 px-3 py-2 text-xs text-slate-200 shadow-xl leading-snug"
          sideOffset={6}
        >
          {content}
          <RTooltip.Arrow className="fill-slate-700" />
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <div className={cn(
      "fixed top-5 right-5 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium",
      type === "success"
        ? "bg-emerald-950 border-emerald-700 text-emerald-300"
        : "bg-red-950 border-red-700 text-red-300",
    )}>
      {type === "success" ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
      {msg}
    </div>
  );
}

// ── Backfill Modal ────────────────────────────────────────────────────────────
function BackfillModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
  const [from, setFrom]       = useState("2024-12-01");
  const [to,   setTo]         = useState(yesterday);
  const [running, setRunning] = useState(false);
  const [result, setResult]   = useState<{
    contacts_found: number; dates_with_traffic: number;
    months_processed: number; rows_upserted: number; errors: string[];
  } | null>(null);

  async function handleRun() {
    setRunning(true); setResult(null);
    try {
      const res  = await fetch("/api/outcomes/backfill-now", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to }),
      });
      const data = await res.json();
      setResult(data);
      if (!data.errors?.length) onDone();
    } catch (e) {
      setResult({ contacts_found: 0, dates_with_traffic: 0, months_processed: 0, rows_upserted: 0, errors: [String(e)] });
    } finally { setRunning(false); }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
            <h2 className="text-base font-bold text-white">Backfill Historical Data</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
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
                result.errors.length ? "bg-red-950 border-red-800 text-red-300" : "bg-emerald-950 border-emerald-800 text-emerald-300",
              )}>
                {result.errors.length ? <p className="font-bold">{result.errors[0]}</p> : (
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
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">Close</button>
            <button onClick={handleRun} disabled={running || !from || !to}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors">
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
function LogModal({ projectId, config, onClose, onSaved }: {
  projectId: string; config: OutcomeMetricConfig[]; onClose: () => void; onSaved: () => void;
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
      await Promise.all(filled.map(([key, val]) =>
        fetch(`/api/outcomes/${projectId}/log`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metric_key: key, value: parseFloat(val), date }),
        }),
      ));
      onSaved();
    } finally { setSaving(false); }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 sticky top-0 bg-slate-900">
            <h2 className="text-base font-bold text-white">Log Metrics</h2>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
          </div>
          <div className="px-6 py-4 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" />
            </div>
            {config.map((c) => (
              <div key={c.metric_key}>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{c.label}</label>
                <input type="number" min="0" step="any" placeholder="leave blank to skip"
                  value={values[c.metric_key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [c.metric_key]: e.target.value }))}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm px-3 py-2 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500" />
              </div>
            ))}
          </div>
          <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button onClick={handleSubmit} disabled={saving}
              className="px-4 py-2 text-sm font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── Chart tooltip ─────────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
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

// ── Source row ────────────────────────────────────────────────────────────────
function SourceRow({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = sourcePct(count, total);
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
        <span className="text-xs text-slate-700 dark:text-slate-300">{label}</span>
      </div>
      <div className="flex items-center gap-3 tabular-nums">
        <span className="text-xs text-slate-400">{pct}</span>
        <span className="text-xs font-bold text-slate-900 dark:text-white">{count > 0 ? count.toLocaleString() : "—"}</span>
      </div>
    </div>
  );
}

// ── Sparkline (Fix 1) ─────────────────────────────────────────────────────────
function Sparkline({ data, color, height = 28 }: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return <div style={{ height }} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data.map((v, i) => ({ i, v }))} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.15} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

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

// ── Hero stat helpers ─────────────────────────────────────────────────────────

// Fix 6: updated tooltip text
const COHORT_TOOLTIP = "Demos Booked and Demos Held are measured independently per month. A demo booked in one month but held in another counts in both — so this ratio can exceed 100%.";

// Fix 4: ARR card info tooltip
const ARR_INFO_TOOLTIP = "Sum of deal amount for AI-referral contacts with closed-won deals in scope. Falls back to deal amount when current_arr__sync_ is not set.";

interface SubInfo { text: string; warn: boolean }

function heroRatio(n: number | undefined, d: number | undefined): SubInfo {
  if (!d) return { text: "—", warn: false };
  if (n == null) return { text: "—", warn: false };
  const pct = (n / d) * 100;
  return { text: `${pct.toFixed(1)}%`, warn: pct > 100 };
}

// Fix 5: derive informative LLM Traffic subtitle
function topSourceSub(chatgpt: number, perplexity: number, claude: number, other: number): string {
  const total = chatgpt + perplexity + claude + other;
  if (!total) return "—";
  const sources = [
    { name: "ChatGPT",    count: chatgpt },
    { name: "Perplexity", count: perplexity },
    { name: "Claude",     count: claude },
    { name: "Other AI",   count: other },
  ];
  const max = Math.max(...sources.map((s) => s.count));
  if (max === 0) return "—";
  const tops = sources.filter((s) => s.count === max);
  if (tops.length > 1) return "Multiple sources";
  return `${((tops[0].count / total) * 100).toFixed(1)}% from ${tops[0].name}`;
}

// Fix 1 + Fix 4: hero card with inline sparkline and optional label tooltip
function HeroStatCard({
  label, value, sub, accentEmerald = false, sparkData, sparkColor, labelTooltip,
}: {
  label: string;
  value: string;
  sub?: SubInfo;
  accentEmerald?: boolean;
  sparkData?: number[];
  sparkColor?: string;
  labelTooltip?: string;
}) {
  return (
    <div className={cn(
      "rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5",
      accentEmerald && "border-t-2 border-t-emerald-400",
    )}>
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1">
        {label}
        {labelTooltip && (
          <Tip content={labelTooltip}>
            <Info className="w-3 h-3 text-slate-400 dark:text-slate-500 cursor-help shrink-0" />
          </Tip>
        )}
      </p>
      <p className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white tabular-nums">
        {value}
      </p>
      {sub && (
        <p className={cn(
          "text-xs mt-1.5",
          sub.warn ? "text-amber-500 dark:text-amber-400" : "text-slate-400 dark:text-slate-500",
        )}>
          {sub.warn ? (
            <Tip content={COHORT_TOOLTIP}>
              <span className="cursor-help inline-flex items-center gap-1">
                {sub.text} <span className="text-[10px]">⚠</span>
              </span>
            </Tip>
          ) : sub.text}
        </p>
      )}
      {sparkData && sparkColor && sparkData.length >= 2 && (
        <div className="mt-3">
          <Sparkline data={sparkData} color={sparkColor} height={40} />
        </div>
      )}
    </div>
  );
}

// ── Visual funnel ─────────────────────────────────────────────────────────────
function VisualStage({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-2.5 h-2.5 rounded-full bg-indigo-200 dark:bg-indigo-800" />
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 text-center leading-tight whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

// Fix 6: use Radix Tooltip instead of title attribute
function VisualArrow({ ratio, isLast = false }: { ratio: SubInfo; isLast?: boolean }) {
  void isLast;
  const color = ratio.warn ? "#f59e0b" : "#818cf8";
  const labelSpan = (
    <span
      className={cn(
        "text-[10px] font-bold whitespace-nowrap",
        ratio.warn ? "text-amber-500 dark:text-amber-400 cursor-help" : "text-indigo-400",
      )}
    >
      {ratio.text}{ratio.warn && " ⚠"}
    </span>
  );
  return (
    <div className="flex flex-col items-center gap-0.5 shrink-0">
      {ratio.warn ? <Tip content={COHORT_TOOLTIP}>{labelSpan}</Tip> : labelSpan}
      <svg width="28" height="14" viewBox="0 0 28 14">
        <path
          d="M0 7 H22 M16 2 L26 7 L16 12"
          stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

// ── More (⋯) dropdown menu ────────────────────────────────────────────────────
function MoreMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onOutsideClick);
    return () => document.removeEventListener("mousedown", onOutsideClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-center h-[30px] w-[30px] rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        aria-label="More options"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-44 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-20 py-1 overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}

function MoreMenuItem({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
    >
      {children}
    </button>
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
  const [, setMtd]                              = useState<OutcomeMtdSummary>(initialMtd);
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

  const scoped     = useMemo(() => computeScoped(monthlyBreakdown, scope), [monthlyBreakdown, scope]);
  const scopeLabel = getScopeLabel(scope);

  const fetchData = useCallback(async (r: Range) => {
    const now = new Date();
    const to  = now.toISOString().substring(0, 10);
    let from: string;
    if (r === "7D")       from = new Date(now.getTime() - 7  * 86_400_000).toISOString().substring(0, 10);
    else if (r === "30D") from = new Date(now.getTime() - 30 * 86_400_000).toISOString().substring(0, 10);
    else                  from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
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
    } finally { setSyncing(false); }
  }

  function handleRangeChange(r: Range) { setRange(r); fetchData(r); }

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

  // Funnel values from scoped breakdown
  const llm    = (scoped.llm_traffic_daily as number) ?? 0;
  const booked = (scoped.demos_booked_mtd  as number) ?? 0;
  const held   = (scoped.demos_held_mtd    as number) ?? 0;
  const won    = (scoped.closed_won_mtd    as number) ?? 0;
  const arr    = (scoped.arr_closed_mtd    as number) ?? 0;

  const avgDealStr = won > 0 ? `${usd(arr / won)}/deal` : "—";

  const chatgptS    = (scoped.llm_chatgpt_daily    as number) ?? 0;
  const perplexityS = (scoped.llm_perplexity_daily as number) ?? 0;
  const claudeS     = (scoped.llm_claude_daily     as number) ?? 0;
  const otherS      = (scoped.llm_other_daily      as number) ?? 0;
  const totalLlmS   = chatgptS + perplexityS + claudeS + otherS;

  const syncedLabel = `Last synced ${formatRelativeTime(lastSynced)}`;

  const hasTrafficData = trafficData.some(
    (d) => d.ChatGPT + d.Perplexity + d.Claude + d["Other AI"] > 0,
  );

  // Fix 1: last 6 months oldest-first for hero sparklines
  const spark6       = monthlyBreakdown.slice(0, 6).reverse();
  const currentMonth = new Date().toISOString().substring(0, 7);

  const heroSparks = {
    llm:    spark6.map((m) => m.metrics.llm_traffic_daily),
    booked: spark6.map((m) => m.metrics.demos_booked_mtd),
    held:   spark6.map((m) => m.metrics.demos_held_mtd),
    won:    spark6.map((m) => m.metrics.closed_won_mtd),
    arr:    spark6.map((m) => m.metrics.arr_closed_mtd),
  };

  // Hero sub-labels
  const bookedSub = heroRatio(booked, llm);
  const heldSub   = heroRatio(held, booked);
  const wonSub    = heroRatio(won, held);

  return (
    <RTooltip.Provider delayDuration={200}>
      <div className="p-6 space-y-6 max-w-7xl">

        {/* ── Section 1: Header ───────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Arthur — Business Outcomes</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">AI referral funnel · HubSpot</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={scope} onChange={(e) => setScope(e.target.value as Scope)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-xs font-semibold px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer">
              {SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">{syncedLabel}</span>
            <button onClick={syncNow} disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50 transition-colors">
              <RefreshCw className={cn("w-3.5 h-3.5", syncing && "animate-spin")} />
              Sync Now
            </button>
            <button onClick={() => setLogOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              Log Metrics
            </button>
            <MoreMenu>
              <MoreMenuItem onClick={() => { setBackfillOpen(true); }}>Backfill Historical Data</MoreMenuItem>
            </MoreMenu>
          </div>
        </div>

        {/* ── Section 2: Hero Stats Row (Fix 1: inline sparklines) ────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
          {/* Fix 5: LLM Traffic subtitle = top source breakdown */}
          <HeroStatCard
            label="LLM Traffic"
            value={llm.toLocaleString()}
            sub={{ text: topSourceSub(chatgptS, perplexityS, claudeS, otherS), warn: false }}
            sparkData={heroSparks.llm}
            sparkColor="#6366f1"
          />
          <HeroStatCard
            label="Demos Booked"
            value={booked.toLocaleString()}
            sub={{ text: bookedSub.text === "—" ? "—" : `${bookedSub.text} of traffic`, warn: bookedSub.warn }}
            sparkData={heroSparks.booked}
            sparkColor="#818cf8"
          />
          <HeroStatCard
            label="Demos Held"
            value={held.toLocaleString()}
            sub={{ text: heldSub.text === "—" ? "—" : `${heldSub.text} of booked`, warn: heldSub.warn }}
            sparkData={heroSparks.held}
            sparkColor="#10b981"
          />
          <HeroStatCard
            label="Closed Won"
            value={won.toLocaleString()}
            sub={{ text: wonSub.text === "—" ? "—" : `${wonSub.text} of held`, warn: wonSub.warn }}
            sparkData={heroSparks.won}
            sparkColor="#f59e0b"
          />
          {/* Fix 4: single-line subtitle + ⓘ tooltip for fallback explanation */}
          <HeroStatCard
            label="ARR Closed"
            value={usd(arr)}
            sub={{ text: avgDealStr, warn: false }}
            accentEmerald
            sparkData={heroSparks.arr}
            sparkColor="#06b6d4"
            labelTooltip={ARR_INFO_TOOLTIP}
          />
        </div>

        {/* ── Section 3: Traffic Sources + Visual Funnel ──────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Left 40%: AI Traffic Sources */}
          <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5">
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
              AI Traffic Sources
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">{scopeLabel}</p>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <SourceRow label="ChatGPT"    count={chatgptS}    total={totalLlmS} color={SOURCE_COLORS.ChatGPT} />
              <SourceRow label="Perplexity" count={perplexityS} total={totalLlmS} color={SOURCE_COLORS.Perplexity} />
              <SourceRow label="Claude"     count={claudeS}     total={totalLlmS} color={SOURCE_COLORS.Claude} />
              <SourceRow label="Other AI"   count={otherS}      total={totalLlmS} color={SOURCE_COLORS["Other AI"]} />
            </div>
          </div>

          {/* Right 60%: Visual funnel — labels + arrows only */}
          <div className="lg:col-span-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex flex-col justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
                AI Referral Funnel
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-6">{scopeLabel}</p>
              <div className="flex flex-wrap items-center justify-center gap-2 py-2">
                <VisualStage label="LLM Traffic" />
                <VisualArrow ratio={bookedSub.text === "—" ? { text: "—", warn: false } : { text: bookedSub.text, warn: bookedSub.warn }} />
                <VisualStage label="Demos Booked" />
                <VisualArrow ratio={heldSub.text === "—" ? { text: "—", warn: false } : { text: heldSub.text, warn: heldSub.warn }} />
                <VisualStage label="Demos Held" />
                <VisualArrow ratio={wonSub.text === "—" ? { text: "—", warn: false } : { text: wonSub.text, warn: wonSub.warn }} />
                <VisualStage label="Closed Won" />
                <VisualArrow ratio={{ text: won > 0 ? `${usd(arr / won)}/deal` : "—", warn: false }} isLast />
                <VisualStage label="ARR Closed" />
              </div>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic mt-4 leading-snug border-t border-slate-100 dark:border-slate-800 pt-3">
              Demos Booked and Demos Held are measured independently per month — a demo booked in one month and held in another will count in both metrics.
            </p>
          </div>
        </div>

        {/* Fix 1 + Fix 2: standalone sparkline row and "Monthly History" divider removed */}

        {/* ── Section 4: Monthly Performance table ────────────────────── */}
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
                      <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Month</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-indigo-500 dark:text-indigo-400 uppercase tracking-wide whitespace-nowrap">LLM Traffic</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap border-l border-slate-100 dark:border-slate-800">ChatGPT</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Perplexity</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Claude</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Other</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Demos Booked</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Demos Held</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap">Closed Won</th>
                      <th className="text-right px-6 py-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wide whitespace-nowrap">ARR Closed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {monthlyBreakdown.map((row) => {
                      const isCurrent = row.month === currentMonth;
                      const m = row.metrics;
                      return (
                        <tr key={row.month} className={cn(
                          "hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors",
                          isCurrent && "bg-indigo-50/40 dark:bg-indigo-950/20",
                        )}>
                          <td className="px-6 py-3 whitespace-nowrap">
                            <span className={cn("font-medium text-slate-800 dark:text-slate-200", isCurrent && "font-semibold")}>{row.monthLabel}</span>
                            {isCurrent && (
                              <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 uppercase tracking-wide align-middle">current</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">{m.llm_traffic_daily.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap border-l border-slate-100 dark:border-slate-800">{m.llm_chatgpt_daily.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">{m.llm_perplexity_daily.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">{m.llm_claude_daily.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">{m.llm_other_daily.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">{m.demos_booked_mtd.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">{m.demos_held_mtd.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">{m.closed_won_mtd.toLocaleString()}</td>
                          <td className="px-6 py-3 text-right tabular-nums font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{usdFmt(m.arr_closed_mtd)}</td>
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

        {/* ── Section 5: Range toggle ──────────────────────────────────── */}
        <div className="flex items-center gap-1">
          {(["7D", "30D", "MTD"] as Range[]).map((r) => (
            <button key={r} onClick={() => handleRangeChange(r)}
              className={cn(
                "px-3 py-1.5 text-xs font-bold rounded-lg transition-colors",
                range === r ? "bg-indigo-600 text-white" : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800",
              )}>
              {r}
            </button>
          ))}
        </div>

        {/* ── Section 5: Charts ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">AI Referral Traffic by Source</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">Daily contacts by originating LLM platform</p>
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
              <div className="flex items-center justify-center h-[220px] text-sm text-slate-400">No data for this range</div>
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
              <div className="flex items-center justify-center h-[220px] text-sm text-slate-400">No data for this range</div>
            )}
          </div>
        </div>

        {/* ── Modals ──────────────────────────────────────────────────── */}
        {backfillOpen && (
          <BackfillModal
            onClose={() => setBackfillOpen(false)}
            onDone={() => { setToast({ msg: "Backfill complete", type: "success" }); fetchData(range); }}
          />
        )}
        {logOpen && (
          <LogModal
            projectId={projectId} config={config}
            onClose={() => setLogOpen(false)}
            onSaved={() => { setLogOpen(false); setToast({ msg: "Metrics logged successfully", type: "success" }); fetchData(range); }}
          />
        )}
        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </div>
    </RTooltip.Provider>
  );
}
