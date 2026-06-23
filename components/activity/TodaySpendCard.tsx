"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";

function formatRelativeTime(iso: string): string {
  const minsAgo = (Date.now() - new Date(iso).getTime()) / 60000;
  if (minsAgo < 60) return `${Math.floor(minsAgo)}m ago`;
  const hoursAgo = minsAgo / 60;
  if (hoursAgo < 24) return `${Math.floor(hoursAgo)}h ago`;
  return `${Math.floor(hoursAgo / 24)}d ago`;
}

type ProjectRow = {
  key_name:     string;
  project_name: string;
  status:       string;
  today:        number;
  month:        number;
  last_synced:  string | null;
};

type TodayData = {
  today_total:   number;
  month_total:   number;
  last_synced:   string | null;
  current_month: string;
  projects:      ProjectRow[];
};

export default function TodaySpendCard() {
  const [data,    setData]    = useState<TodayData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/activity/today")
      .then(r => r.json())
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="rounded-lg border border-[var(--border-tertiary)] p-6 mb-4">
        <p className="text-sm text-[var(--text-quaternary)]">Loading live spend…</p>
      </div>
    );
  }

  if (!data || data.projects.length === 0) return null;

  const monthLabel = new Date(`${data.current_month}-01`).toLocaleString("en-US", {
    month: "long", year: "numeric", timeZone: "UTC",
  });

  const sorted      = data.projects.filter(p => p.today > 0 || p.month > 0);
  const topN        = sorted.slice(0, 8);
  const others      = sorted.slice(8);
  const othersToday = others.reduce((s, r) => s + r.today, 0);
  const othersMonth = others.reduce((s, r) => s + r.month, 0);

  return (
    <div className="rounded-lg border border-[var(--border-tertiary)] bg-[var(--bg-primary)] p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
            Live Spend
          </h3>
          <p className="text-xs text-[var(--text-quaternary)] mt-0.5">
            Real-time counters from OpenRouter · synced hourly by n8n
          </p>
        </div>
        {data.last_synced && (
          <span className="text-[11px] text-[var(--text-quaternary)]">
            Updated {formatRelativeTime(data.last_synced)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-4">
        <div>
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide mb-1">Today so far</p>
          <p className="text-3xl font-semibold text-[var(--text-primary)]">{formatCurrency(data.today_total)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide mb-1">{monthLabel} so far</p>
          <p className="text-3xl font-semibold text-[var(--text-primary)]">{formatCurrency(data.month_total)}</p>
        </div>
      </div>

      <div className="border-t border-[var(--border-tertiary)] pt-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-[var(--text-quaternary)]">
              <th className="text-left py-1">Project</th>
              <th className="text-right py-1">Today</th>
              <th className="text-right py-1">{monthLabel}</th>
            </tr>
          </thead>
          <tbody>
            {topN.map(p => (
              <tr key={p.key_name} className="border-t border-[var(--border-tertiary)]">
                <td className="py-1.5 text-[var(--text-secondary)]">{p.project_name}</td>
                <td className="py-1.5 text-right tabular-nums font-medium">
                  {p.today > 0 ? <span className="text-[var(--text-brand-primary)]">{formatCurrency(p.today)}</span> : <span className="text-[var(--text-quaternary)]">—</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums text-[var(--text-primary)] font-medium">
                  {p.month > 0 ? formatCurrency(p.month) : <span className="text-[var(--text-quaternary)]">—</span>}
                </td>
              </tr>
            ))}
            {others.length > 0 && (
              <tr className="border-t border-[var(--border-tertiary)] text-[var(--text-tertiary)]">
                <td className="py-1.5 italic">+ {others.length} other project{others.length > 1 ? "s" : ""}</td>
                <td className="py-1.5 text-right tabular-nums font-medium">
                  {othersToday > 0 ? <span className="text-[var(--text-brand-primary)]">{formatCurrency(othersToday)}</span> : <span className="text-[var(--text-quaternary)]">—</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums text-[var(--text-primary)] font-medium">
                  {othersMonth > 0 ? formatCurrency(othersMonth) : <span className="text-[var(--text-quaternary)]">—</span>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
