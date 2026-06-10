"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ProjectOutcomeSummary } from "@/types";
import { formatCurrency } from "@/lib/utils";

const PLATFORMS = [
  { key: "llm_chatgpt_daily",    label: "ChatGPT",    bar: "bg-emerald-400", text: "text-emerald-600 dark:text-emerald-400" },
  { key: "llm_perplexity_daily", label: "Perplexity", bar: "bg-indigo-400",  text: "text-indigo-600 dark:text-indigo-400"  },
  { key: "llm_claude_daily",     label: "Claude",     bar: "bg-amber-400",   text: "text-amber-600 dark:text-amber-400"    },
  { key: "llm_other_daily",      label: "Other AI",   bar: "bg-slate-400",   text: "text-slate-500 dark:text-slate-400"    },
] as const;

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 60_000);
  if (diff < 1) return "just now";
  if (diff < 60) return `${diff}m ago`;
  const h = Math.floor(diff / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls = "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";
  if (s.includes("shut") || s.includes("cancelled") || s.includes("dead"))
    cls = "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400";
  else if (s.includes("live") || s.includes("active") || s.includes("production"))
    cls = "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400";
  else if (s.includes("progress") || s.includes("dev") || s.includes("build"))
    cls = "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400";
  else if (s.includes("pause") || s.includes("hold") || s.includes("stop"))
    cls = "bg-orange-100 text-orange-500 dark:bg-orange-900/40 dark:text-orange-400";
  else if (s.includes("plan") || s.includes("backlog") || s.includes("queue"))
    cls = "bg-blue-100 text-blue-500 dark:bg-blue-900/40 dark:text-blue-400";
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  );
}

export function OutcomesIndexClient() {
  const [projects, setProjects] = useState<ProjectOutcomeSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/outcomes?scope=last_6m")
      .then((r) => r.json())
      .then((data) => setProjects(Array.isArray(data) ? data : []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, []);

  const totals = projects.reduce(
    (acc, p) => ({
      llmTraffic:  acc.llmTraffic  + ((p.mtd.llm_traffic_daily  as number) ?? 0),
      demosBooked: acc.demosBooked + ((p.mtd.demos_booked_mtd   as number) ?? 0),
      closedWon:   acc.closedWon   + ((p.mtd.closed_won_mtd     as number) ?? 0),
      arrClosed:   acc.arrClosed   + ((p.mtd.arr_closed_mtd     as number) ?? 0),
    }),
    { llmTraffic: 0, demosBooked: 0, closedWon: 0, arrClosed: 0 },
  );

  const statCards = [
    { label: "LLM Traffic",  value: totals.llmTraffic.toLocaleString(), sub: "contacts in last 6 months" },
    { label: "Demos Booked", value: totals.demosBooked.toString(),       sub: "meetings scheduled in last 6 months" },
    { label: "Closed Won",   value: totals.closedWon.toString(),          sub: "deals closed in last 6 months" },
    { label: "ARR Closed",   value: formatCurrency(totals.arrClosed),     sub: "revenue in last 6 months" },
  ];

  return (
    <main className="flex-1 min-h-screen bg-slate-50 dark:bg-slate-950 p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Outcomes</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          Business KPI portfolio across all AI projects &middot; Last 6 Months
        </p>
      </div>

      {/* Loading / content */}
      <div className={loading ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
        {projects.length === 0 && !loading ? (
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-16 text-center">
            <p className="text-slate-400 dark:text-slate-500 text-sm font-medium">
              No outcome data for this period.
            </p>
            <p className="text-slate-300 dark:text-slate-600 text-xs mt-2">
              Check that{" "}
              <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                project_outcome_config
              </code>{" "}
              has active rows.
            </p>
          </div>
        ) : (
          <>
            {/* Portfolio summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {statCards.map(({ label, value, sub }) => (
                <div
                  key={label}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                    {label}
                  </p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>
                </div>
              ))}
            </div>

            {/* Per-project cards */}
            <div className="space-y-4">
              {projects.map((project) => {
                const { mtd, projectId } = project;
                const traffic     = (mtd.llm_traffic_daily  as number) ?? 0;
                const demosBooked = (mtd.demos_booked_mtd   as number) ?? 0;
                const demosHeld   = (mtd.demos_held_mtd     as number) ?? 0;
                const closedWon   = (mtd.closed_won_mtd     as number) ?? 0;
                const arrClosed   = (mtd.arr_closed_mtd     as number) ?? 0;

                const displayName =
                  project.projectName ??
                  projectId.charAt(0).toUpperCase() + projectId.slice(1);

                const funnelSteps = [
                  { label: "Traffic",  value: traffic,     currency: false },
                  { label: "Booked",   value: demosBooked, currency: false },
                  { label: "Held",     value: demosHeld,   currency: false },
                  { label: "Won",      value: closedWon,   currency: false },
                  { label: "ARR",      value: arrClosed,   currency: true  },
                ];

                return (
                  <div
                    key={projectId}
                    className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] p-6"
                  >
                    {/* Card header */}
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2.5">
                        <h2 className="font-bold text-slate-900 dark:text-white text-base leading-tight">
                          {displayName}
                        </h2>
                        {project.projectStatus && (
                          <StatusBadge status={project.projectStatus} />
                        )}
                      </div>
                      <Link
                        href={`/projects/${projectId}/outcomes`}
                        className="text-sm font-semibold text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors shrink-0"
                      >
                        View Details →
                      </Link>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* LLM source breakdown */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                          AI Traffic Sources &middot; {traffic.toLocaleString()} total
                        </p>
                        <div className="space-y-2.5">
                          {PLATFORMS.map(({ key, label, bar, text }) => {
                            const count = (mtd[key] as number) ?? 0;
                            const pct = traffic > 0 ? (count / traffic) * 100 : 0;
                            return (
                              <div key={key} className="flex items-center gap-2">
                                <span className={`text-[11px] font-medium w-20 shrink-0 ${text}`}>
                                  {label}
                                </span>
                                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                  <div className={`h-full ${bar} rounded-full`} style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-[11px] text-slate-500 dark:text-slate-400 w-16 text-right shrink-0">
                                  {count} ({pct.toFixed(0)}%)
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Funnel */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                          Funnel &middot; Last 6 Months
                        </p>
                        <div className="flex items-center gap-1 flex-wrap">
                          {funnelSteps.map(({ label, value, currency }, i) => (
                            <div key={label} className="flex items-center gap-1">
                              <div className="text-center min-w-[3.5rem]">
                                <div className="text-base font-bold text-slate-900 dark:text-white leading-tight">
                                  {currency ? formatCurrency(value) : value.toLocaleString()}
                                </div>
                                <div className="text-[9px] uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-0.5">
                                  {label}
                                </div>
                              </div>
                              {i < funnelSteps.length - 1 && (
                                <span className="text-slate-300 dark:text-slate-600 text-[11px] font-bold">→</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Footer */}
                    {project.lastSynced && (
                      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
                        <p className="text-[11px] text-slate-400 dark:text-slate-500">
                          Last synced {timeAgo(project.lastSynced)}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
