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
  const to = new Date(now.getFullYear(), now.getMonth(), 0);
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
    <div ref={ref} className="relative rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] border-l-4 border-l-[var(--border-brand-solid)] shadow-sm hover:shadow-md transition-shadow">
      <div className="p-5">
        <div className="flex items-start justify-between mb-4">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-[var(--text-secondary)] hover:text-[var(--text-brand-primary)] transition-colors"
          >
            <CalendarDays className="w-3.5 h-3.5 shrink-0" />
            {formatRange(applied.from, applied.to)}
          </button>
          <div className="p-2 rounded-xl bg-[var(--bg-brand-primary)] text-[var(--fg-brand-primary)]">
            <DollarSign className="w-4 h-4" />
          </div>
        </div>

        <p className={`text-xl font-semibold tracking-tight text-[var(--text-primary)] transition-opacity ${loading ? "opacity-40" : ""}`}>
          {formatCurrency(data.paid)}
        </p>
        <p className="text-xs mt-1.5 text-[var(--text-quaternary)]">Total spend (invoices + API)</p>

        {open && (
          <div className="absolute top-full left-0 mt-2 z-50 bg-[var(--bg-primary)] border border-[var(--border-brand)] rounded-xl shadow-xl p-4 space-y-3.5 w-64">
            <p className="text-[10px] font-semibold text-[var(--text-brand-primary)] uppercase tracking-widest">Select Date Range</p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">From</label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1.5 w-full text-xs bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-2 py-1.5 text-[var(--text-primary)] outline-none focus:border-[var(--border-brand-solid)] focus:ring-2 focus:ring-[var(--ring-brand-primary)] transition-colors"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">To</label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1.5 w-full text-xs bg-[var(--bg-primary)] border border-[var(--border-primary)] rounded-lg px-2 py-1.5 text-[var(--text-primary)] outline-none focus:border-[var(--border-brand-solid)] focus:ring-2 focus:ring-[var(--ring-brand-primary)] transition-colors"
                />
              </div>
            </div>
            <button
              onClick={apply}
              disabled={!from || !to || from > to}
              className="w-full py-2 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold tracking-wide transition-colors shadow-sm"
              style={{ backgroundColor: "var(--bg-brand-solid)" }}
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {hasUnpaid && (
        <>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-5 py-2.5 border-t border-[var(--border-tertiary)] text-xs font-medium hover:bg-[var(--bg-primary\_hover)] transition-colors rounded-b-lg"
          >
            <span className="text-[var(--text-warning-primary)] font-semibold">
              {data.unpaidCount} unpaid · {formatCurrency(data.unpaid)}
            </span>
            {expanded
              ? <ChevronUp className="w-3.5 h-3.5 text-[var(--text-quaternary)]" />
              : <ChevronDown className="w-3.5 h-3.5 text-[var(--text-quaternary)]" />}
          </button>

          {expanded && (
            <div className="px-5 pb-4 space-y-2.5 border-t border-[var(--border-tertiary)]">
              <div className="flex items-center justify-between pt-3">
                <span className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--bg-success-solid)] inline-block" /> Paid
                </span>
                <span className="text-xs font-semibold text-[var(--text-success-primary)]">{formatCurrency(data.paid)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                  <span className="w-2 h-2 rounded-full bg-[var(--bg-warning-solid)] inline-block" /> Unpaid ({data.unpaidCount})
                </span>
                <span className="text-xs font-semibold text-[var(--text-warning-primary)]">{formatCurrency(data.unpaid)}</span>
              </div>
              {data.upcomingCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                    <span className="w-2 h-2 rounded-full bg-[var(--bg-error-solid)] inline-block" /> Upcoming ({data.upcomingCount})
                  </span>
                  <span className="text-xs font-semibold text-[var(--text-error-primary)]">{formatCurrency(data.upcoming)}</span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
