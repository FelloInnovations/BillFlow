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
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-6 mb-4">
        <p className="text-sm text-slate-400">Loading live spend…</p>
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
    <div className="rounded-xl border border-slate-200 bg-white p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Live Spend
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Real-time counters from OpenRouter · synced hourly by n8n
          </p>
        </div>
        {data.last_synced && (
          <span className="text-[11px] text-gray-400">
            Updated {formatRelativeTime(data.last_synced)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6 mb-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">Today so far</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(data.today_total)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">{monthLabel} so far</p>
          <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(data.month_total)}</p>
        </div>
      </div>

      <div className="border-t border-slate-100 pt-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <th className="text-left py-1">Project</th>
              <th className="text-right py-1">Today</th>
              <th className="text-right py-1">{monthLabel}</th>
            </tr>
          </thead>
          <tbody>
            {topN.map(p => (
              <tr key={p.key_name} className="border-t border-slate-100">
                <td className="py-1.5 text-gray-700">{p.project_name}</td>
                <td className="py-1.5 text-right tabular-nums font-medium">
                  {p.today > 0 ? <span className="text-[#FF725C]">{formatCurrency(p.today)}</span> : <span className="text-gray-400">—</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums text-gray-900 font-medium">
                  {p.month > 0 ? formatCurrency(p.month) : <span className="text-gray-400">—</span>}
                </td>
              </tr>
            ))}
            {others.length > 0 && (
              <tr className="border-t border-slate-100 text-gray-500">
                <td className="py-1.5 italic">+ {others.length} other project{others.length > 1 ? "s" : ""}</td>
                <td className="py-1.5 text-right tabular-nums font-medium">
                  {othersToday > 0 ? <span className="text-[#FF725C]">{formatCurrency(othersToday)}</span> : <span className="text-gray-400">—</span>}
                </td>
                <td className="py-1.5 text-right tabular-nums text-gray-900 font-medium">
                  {othersMonth > 0 ? formatCurrency(othersMonth) : <span className="text-gray-400">—</span>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
