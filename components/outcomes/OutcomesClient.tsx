"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as RTooltip from "@radix-ui/react-tooltip";
import {
  AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { RefreshCw, CheckCircle2, X, Info, MoreHorizontal } from "lucide-react";
import { MonthlyOutcomeBreakdown, OutcomeMetricConfig, OutcomeMtdSummary } from "@/types";
import { cn, formatRelativeTime } from "@/lib/utils";
import { OutcomesPageLayout, MonthlyColumn, MonthlyRow } from "./OutcomesPageLayout";
import type { FunnelStage } from "./FunnelFlow";
import type { TrendChartData } from "./TrendChartsGrid";

const usd = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v);

function sourcePct(count: number, total: number): string {
  if (!total) return "—";
  return `${((count / total) * 100).toFixed(1)}%`;
}

// ── Scope ─────────────────────────────────────────────────────────────────────

type Scope = "all_time" | "this_month" | "last_6_months";

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "all_time",      label: "All Time"      },
  { value: "this_month",    label: "This Month"    },
  { value: "last_6_months", label: "Last 6 Months" },
];

function getScopeLabel(scope: Scope): string {
  return SCOPE_OPTIONS.find((o) => o.value === scope)?.label ?? scope;
}

function computeScoped(breakdown: MonthlyOutcomeBreakdown[], scope: Scope): OutcomeMtdSummary {
  const now = new Date();
  const getKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const currentMonth = getKey(now);

  let targetMonths: Set<string>;
  if (scope === "this_month") {
    targetMonths = new Set([currentMonth]);
  } else if (scope === "last_6_months") {
    const cutoff = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const cutoffKey = getKey(cutoff);
    targetMonths = new Set(breakdown.map((b) => b.month).filter((m) => m >= cutoffKey));
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

// ── Tooltip wrapper ───────────────────────────────────────────────────────────

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
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-salmon-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">To</label>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-salmon-500" />
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
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-lg bg-salmon-600 hover:bg-salmon-700 text-white disabled:opacity-50 transition-colors">
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
                className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm px-3 py-2 focus:outline-none focus:ring-1 focus:ring-salmon-500 focus:border-salmon-500" />
            </div>
            {config.map((c) => (
              <div key={c.metric_key}>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5">{c.label}</label>
                <input type="number" min="0" step="any" placeholder="leave blank to skip"
                  value={values[c.metric_key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [c.metric_key]: e.target.value }))}
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm px-3 py-2 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-salmon-500 focus:border-salmon-500" />
              </div>
            ))}
          </div>
          <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">Cancel</button>
            <button onClick={handleSubmit} disabled={saving}
              className="px-4 py-2 text-sm font-bold rounded-lg bg-salmon-600 hover:bg-salmon-700 text-white disabled:opacity-50 transition-colors">
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

// ── Sparkline ─────────────────────────────────────────────────────────────────
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

// ── Hero stat helpers ─────────────────────────────────────────────────────────

const COHORT_TOOLTIP = "Demos Booked and Demos Held are measured independently per month. A demo booked in one month but held in another counts in both — so this ratio can exceed 100%.";
const ARR_INFO_TOOLTIP = "Sum of deal amount for AI-referral contacts with closed-won deals in scope. Falls back to deal amount when current_arr__sync_ is not set.";

interface SubInfo { text: string; warn: boolean }

function heroRatio(n: number | undefined, d: number | undefined): SubInfo {
  if (!d) return { text: "—", warn: false };
  if (n == null) return { text: "—", warn: false };
  const pct = (n / d) * 100;
  return { text: `${pct.toFixed(1)}%`, warn: pct > 100 };
}

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
      <div className="w-2.5 h-2.5 rounded-full bg-salmon-200 dark:bg-navy-800" />
      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 text-center leading-tight whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

function VisualArrow({ ratio, isLast = false }: { ratio: SubInfo; isLast?: boolean }) {
  void isLast;
  const color = ratio.warn ? "#f59e0b" : "#ff8778";
  const labelSpan = (
    <span
      className={cn(
        "text-[10px] font-bold whitespace-nowrap",
        ratio.warn ? "text-amber-500 dark:text-amber-400 cursor-help" : "text-salmon-400",
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
  Perplexity: "#ff8778",
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
  const [lastSynced, setLastSynced]             = useState(initialLastSynced ?? "");
  const [monthlyBreakdown, setMonthlyBreakdown] = useState<MonthlyOutcomeBreakdown[]>(initialMonthlyBreakdown);
  const [scope, setScope]                       = useState<Scope>("all_time");
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
      setLastSynced(data.lastSynced ?? "");
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

  // ── Derived values ────────────────────────────────────────────────────────
  const llm    = (scoped.llm_traffic_daily as number) ?? 0;
  const booked = (scoped.demos_booked_mtd  as number) ?? 0;
  const held   = (scoped.demos_held_mtd    as number) ?? 0;
  const won    = (scoped.closed_won_mtd    as number) ?? 0;
  const arr    = (scoped.arr_closed_mtd    as number) ?? 0;

  const chatgptS    = (scoped.llm_chatgpt_daily    as number) ?? 0;
  const perplexityS = (scoped.llm_perplexity_daily as number) ?? 0;
  const claudeS     = (scoped.llm_claude_daily     as number) ?? 0;
  const otherS      = (scoped.llm_other_daily      as number) ?? 0;
  const totalLlmS   = chatgptS + perplexityS + claudeS + otherS;

  const spark6 = monthlyBreakdown.slice(0, 6).reverse();

  const heroSparks = {
    llm:    spark6.map((m) => m.metrics.llm_traffic_daily),
    booked: spark6.map((m) => m.metrics.demos_booked_mtd),
    held:   spark6.map((m) => m.metrics.demos_held_mtd),
    won:    spark6.map((m) => m.metrics.closed_won_mtd),
    arr:    spark6.map((m) => m.metrics.arr_closed_mtd),
  };

  const bookedSub = heroRatio(booked, llm);
  const heldSub   = heroRatio(held, booked);
  const wonSub    = heroRatio(won, held);
  const avgDealStr = won > 0 ? `${usd(arr / won)}/deal` : "—";

  // ── Funnel stages ─────────────────────────────────────────────────────────
  const funnelStages = useMemo((): FunnelStage[] => {
    const llmVal    = (scoped.llm_traffic_daily as number) ?? 0;
    const bookedVal = (scoped.demos_booked_mtd  as number) ?? 0;
    const heldVal   = (scoped.demos_held_mtd    as number) ?? 0;
    const wonVal    = (scoped.closed_won_mtd    as number) ?? 0;
    const arrVal    = (scoped.arr_closed_mtd    as number) ?? 0;
    return [
      { label: "TRAFFIC", value: llmVal,    displayValue: llmVal.toLocaleString(),    conversionFromPrev: null },
      { label: "BOOKED",  value: bookedVal, displayValue: bookedVal.toLocaleString(), conversionFromPrev: llmVal    > 0 ? bookedVal / llmVal    : null },
      { label: "HELD",    value: heldVal,   displayValue: heldVal.toLocaleString(),   conversionFromPrev: bookedVal > 0 ? heldVal   / bookedVal : null },
      { label: "WON",     value: wonVal,    displayValue: wonVal.toLocaleString(),    conversionFromPrev: heldVal   > 0 ? wonVal    / heldVal   : null },
      { label: "ARR",     value: arrVal,    displayValue: usd(arrVal), isMonetary: true, conversionFromPrev: null },
    ];
  }, [scoped]);

  // ── Trend charts ──────────────────────────────────────────────────────────
  const trendCharts = useMemo((): TrendChartData[] => {
    function mkTrend(label: string, key: string, monetary = false): TrendChartData {
      const data = [...monthlyBreakdown]
        .sort((a, b) => a.month.localeCompare(b.month))
        .map((m) => ({ month: m.month, value: (m.metrics[key] as number) ?? 0 }));
      const total = data.reduce((s, d) => s + d.value, 0);
      return {
        label, metricKey: key, data, totalValue: total,
        displayTotal: monetary ? usd(total) : total.toLocaleString(),
        isMonetary: monetary,
      };
    }
    return [
      mkTrend("Demos Booked", "demos_booked_mtd"),
      mkTrend("Demos Held",   "demos_held_mtd"),
      mkTrend("Closed Won",   "closed_won_mtd"),
      mkTrend("ARR Closed",   "arr_closed_mtd", true),
    ];
  }, [monthlyBreakdown]);

  // ── Monthly table ─────────────────────────────────────────────────────────
  const monthlyColumns: MonthlyColumn[] = [
    { key: "llm_traffic_daily",    label: "LLM Traffic" },
    { key: "llm_chatgpt_daily",    label: "ChatGPT" },
    { key: "llm_perplexity_daily", label: "Perplexity" },
    { key: "llm_claude_daily",     label: "Claude" },
    { key: "llm_other_daily",      label: "Other AI" },
    { key: "demos_booked_mtd",     label: "Booked" },
    { key: "demos_held_mtd",       label: "Held" },
    { key: "closed_won_mtd",       label: "Won" },
    { key: "arr_closed_mtd",       label: "ARR", isMonetary: true },
  ];

  const monthlyData: MonthlyRow[] = useMemo(() =>
    [...monthlyBreakdown]
      .sort((a, b) => b.month.localeCompare(a.month))
      .map((m) => ({ month: m.monthLabel, ...(m.metrics as Record<string, number>) })),
    [monthlyBreakdown],
  );

  // ── Project-specific section (LLM breakdown) ──────────────────────────────
  const projectSpecificSection = (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
      {/* Left: AI Traffic Sources */}
      <div className="lg:col-span-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">AI Traffic Sources</p>
        <p className="text-xs text-muted-foreground mb-4">{scopeLabel}</p>
        <div className="divide-y divide-border">
          <SourceRow label="ChatGPT"    count={chatgptS}    total={totalLlmS} color={SOURCE_COLORS.ChatGPT} />
          <SourceRow label="Perplexity" count={perplexityS} total={totalLlmS} color={SOURCE_COLORS.Perplexity} />
          <SourceRow label="Claude"     count={claudeS}     total={totalLlmS} color={SOURCE_COLORS.Claude} />
          <SourceRow label="Other AI"   count={otherS}      total={totalLlmS} color={SOURCE_COLORS["Other AI"]} />
        </div>
      </div>

      {/* Right: Visual funnel */}
      <div className="lg:col-span-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5 flex flex-col justify-between">
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">AI Referral Funnel</p>
          <p className="text-xs text-muted-foreground mb-6">{scopeLabel}</p>
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
        <p className="text-[11px] text-muted-foreground italic mt-4 leading-snug border-t border-border pt-3">
          Demos Booked and Demos Held are measured independently per month.
        </p>
      </div>
    </div>
  );

  // ── Extra actions (Log Metrics + More) ────────────────────────────────────
  const extraActions = (
    <>
      <button
        onClick={() => setLogOpen(true)}
        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-card transition-colors"
      >
        Log Metrics
      </button>
      <MoreMenu>
        <MoreMenuItem onClick={() => setBackfillOpen(true)}>Backfill Historical Data</MoreMenuItem>
      </MoreMenu>
    </>
  );

  // Suppress series reference (kept for fetchData but not rendered)
  void series;
  void heroSparks;
  void avgDealStr;

  return (
    <RTooltip.Provider delayDuration={200}>
      <OutcomesPageLayout
        title="Arthur — Business Outcomes"
        subtitle="AI referral funnel · HubSpot"
        lastSynced={formatRelativeTime(lastSynced)}
        scope={scope}
        onScopeChange={(s) => setScope(s as Scope)}
        scopeOptions={SCOPE_OPTIONS}
        funnelStages={funnelStages}
        trendCharts={trendCharts}
        monthlyData={monthlyData}
        monthlyColumns={monthlyColumns}
        onSyncNow={syncNow}
        onBackfill={() => setBackfillOpen(true)}
        backfillRunning={false}
        syncingNow={syncing}
        projectSpecificSection={projectSpecificSection}
        extraActions={extraActions}
      />
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
    </RTooltip.Provider>
  );
}
