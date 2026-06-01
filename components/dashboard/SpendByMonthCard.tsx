"use client";

import { useState, useRef, useEffect } from "react";
import { CalendarDays, DollarSign, ChevronDown, ChevronUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface RangeData {
  paid: number;
  unpaid: number;
  unpaidCount: number;
  upcoming: number;
  upcomingCount: number;
}

const EMPTY: RangeData = { paid: 0, unpaid: 0, unpaidCount: 0, upcoming: 0, upcomingCount: 0 };

function getDefaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 0); // last day of prev month
  return {
    from: from.toISOString().split("T")[0],
    to: to.toISOString().split("T")[0],
  };
}

function formatRange(from: string, to: string) {
  const f = new Date(from + "T00:00:00");
  const t = new Date(to + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const sameYear = f.getFullYear() === t.getFullYear();
  const fromStr = f.toLocaleDateString("en-US", opts);
  const toStr = t.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return sameYear
    ? `${fromStr} – ${toStr}`
    : `${f.toLocaleDateString("en-US", { ...opts, year: "numeric" })} – ${toStr}`;
}

export function SpendRangeCard() {
  const defaults = getDefaultRange();
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [applied, setApplied] = useState(defaults);
  const [data, setData] = useState<RangeData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/dashboard/range?from=${applied.from}&to=${applied.to}`)
      .then((r) => (r.ok ? r.json() : EMPTY))
      .catch(() => EMPTY)
      .then((d) => { setData(d); setLoading(false); });
  }, [applied]);

  function apply() {
    if (!from || !to || from > to) return;
    setApplied({ from, to });
    setOpen(false);
    setExpanded(false);
  }

  const hasUnpaid = data.unpaidCount > 0 || data.upcomingCount > 0;

  return (
    <div ref={ref} className="relative rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 border-t-4 border-t-indigo-500 shadow-sm hover:shadow-md transition-shadow">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
          >
            <CalendarDays className="w-3.5 h-3.5 shrink-0" />
            {formatRange(applied.from, applied.to)}
          </button>
          <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-500">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>

        {/* Main value */}
        <p className={`text-3xl font-bold tracking-tight text-slate-900 dark:text-white transition-opacity ${loading ? "opacity-40" : ""}`}>
          {formatCurrency(data.paid)}
        </p>
        <p className="text-xs mt-1.5 text-slate-400 dark:text-slate-500">Total spend (invoices + API)</p>

        {/* Date picker popover */}
        {open && (
          <div className="absolute top-full left-0 mt-2 z-50 bg-white dark:bg-slate-800 border-2 border-indigo-100 dark:border-slate-600 rounded-2xl shadow-2xl p-4 space-y-3.5 w-64">
            <p className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">Select Date Range</p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider">From</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1.5 w-full text-xs bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-500 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-300 uppercase tracking-wider">To</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1.5 w-full text-xs bg-slate-100 dark:bg-slate-700 border border-slate-300 dark:border-slate-500 rounded-lg px-2 py-1.5 text-slate-800 dark:text-slate-100 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            <button
              onClick={apply}
              disabled={!from || !to || from > to}
              className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold tracking-wide transition-colors shadow-sm"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Collapsable breakdown */}
      {hasUnpaid && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-2.5 border-t border-slate-100 dark:border-slate-800 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-b-2xl"
          >
            <span className="text-amber-600 dark:text-amber-400 font-semibold">
              {data.unpaidCount} unpaid · {formatCurrency(data.unpaid)}
            </span>
            {expanded
              ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {expanded && (
            <div className="px-5 pb-4 space-y-2.5 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between pt-3">
                <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Paid
                </span>
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(data.paid)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> Unpaid ({data.unpaidCount})
                </span>
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(data.unpaid)}</span>
              </div>
              {data.upcomingCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Upcoming ({data.upcomingCount})
                  </span>
                  <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">{formatCurrency(data.upcoming)}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
