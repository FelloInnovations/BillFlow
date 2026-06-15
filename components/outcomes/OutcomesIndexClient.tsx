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

interface PortfolioTotals {
  llm_traffic:    number;
  agents_enriched: number;
  demos_booked:   { value: number; deduped: boolean };
  demos_held:     { value: number; deduped: boolean };
  closed_won:     { value: number; deduped: boolean };
  arr_closed:     { value: number; deduped: boolean };
}

type Scope = "all_time" | "this_month" | "last_3m" | "last_6m" | "last_12m";

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "all_time",   label: "All Time"      },
  { value: "this_month", label: "This Month"    },
  { value: "last_3m",   label: "Last 3 Months" },
  { value: "last_6m",   label: "Last 6 Months" },
  { value: "last_12m",  label: "Last 12 Months"},
];

const COMBINED_TOOLTIP =
  "Combined across Arthur and Enrichment. Contacts appearing in both projects are counted once.";

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

// Enrichment project card — shows MAD ID pipeline funnel
function EnrichmentProjectCard({
  project,
  scopeLabel,
}: {
  project: ProjectOutcomeSummary;
  scopeLabel: string;
}) {
  const { mtd } = project;
  // Use agents_enriched_period (scope-specific count) as the headline enriched value
  const enrichedPeriod  = (mtd.agents_enriched_period as number) ?? 0;
  const pushed          = (mtd.agents_pushed_hubspot  as number) ?? 0;
  const demosBooked     = (mtd.demos_booked_mtd       as number) ?? 0;
  const demosHeld       = (mtd.demos_held_mtd         as number) ?? 0;
  const closedWon       = (mtd.closed_won_mtd         as number) ?? 0;
  const arrClosed       = (mtd.arr_closed_mtd         as number) ?? 0;

  const funnelSteps = [
    { label: "Enriched", value: enrichedPeriod, currency: false },
    { label: "Pushed",   value: pushed,         currency: false },
    { label: "Booked",   value: demosBooked,    currency: false },
    { label: "Held",     value: demosHeld,      currency: false },
    { label: "Won",      value: closedWon,      currency: false },
    { label: "ARR",      value: arrClosed,      currency: true  },
  ];

  return (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <h2 className="font-bold text-slate-900 dark:text-white text-base leading-tight">
            Enrichment
          </h2>
          {project.projectStatus && <StatusBadge status={project.projectStatus} />}
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400">
            MAD ID Pipeline
          </span>
        </div>
        <Link
          href="/projects/enrichment/outcomes"
          className="text-sm font-semibold text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors shrink-0"
        >
          View Details →
        </Link>
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
          Funnel &middot; {scopeLabel}
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

      {project.lastSynced && (
        <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Last synced {timeAgo(project.lastSynced)}
          </p>
        </div>
      )}
    </div>
  );
}

export function OutcomesIndexClient() {
  const [scope, setScope]                   = useState<Scope>("all_time");
  const [projects, setProjects]             = useState<ProjectOutcomeSummary[]>([]);
  const [portfolioTotals, setPortfolioTotals] = useState<PortfolioTotals | null>(null);
  const [loading, setLoading]               = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/outcomes?scope=${scope}`)
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setProjects(data);
        } else {
          setProjects(Array.isArray(data.projects) ? data.projects : []);
          setPortfolioTotals(data.portfolioTotals ?? null);
        }
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [scope]);

  const scopeLabel      = SCOPE_OPTIONS.find((o) => o.value === scope)?.label ?? "All Time";
  const scopeLabelLower = scopeLabel.toLowerCase();

  const pt = portfolioTotals;

  const statCards = pt ? [
    {
      label:    "LLM Traffic",
      value:    pt.llm_traffic.toLocaleString(),
      sub:      `Arthur only · ${scopeLabelLower}`,
      combined: false,
    },
    {
      label:    "Agents Enriched",
      value:    pt.agents_enriched.toLocaleString(),
      sub:      `Enrichment only · ${scopeLabelLower}`,
      combined: false,
    },
    {
      label:    "Demos Booked",
      value:    pt.demos_booked.value.toLocaleString(),
      sub:      `${pt.demos_booked.deduped ? "deduped" : "combined"} · ${scopeLabelLower}`,
      combined: true,
    },
    {
      label:    "Closed Won",
      value:    pt.closed_won.value.toLocaleString(),
      sub:      `${pt.closed_won.deduped ? "deduped" : "combined"} · ${scopeLabelLower}`,
      combined: true,
    },
    {
      label:    "ARR Closed",
      value:    formatCurrency(pt.arr_closed.value),
      sub:      `${pt.arr_closed.deduped ? "deduped revenue" : "combined revenue"} · ${scopeLabelLower}`,
      combined: true,
    },
  ] : [];

  const enrichmentProject = projects.find((p) => p.projectId === "enrichment");
  const standardProjects  = projects.filter((p) => p.projectId !== "enrichment");

  return (
    <main className="flex-1 min-h-screen bg-slate-50 dark:bg-slate-950 p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Outcomes</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Business KPI portfolio across all AI projects &middot; {scopeLabel}
          </p>
        </div>

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
      </div>

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
            {statCards.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
                {statCards.map(({ label, value, sub, combined }) => (
                  <div
                    key={label}
                    className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm p-5"
                    title={combined ? COMBINED_TOOLTIP : undefined}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1 flex items-center gap-1">
                      {label}
                      {combined && (
                        <span className="text-slate-300 dark:text-slate-600 text-[10px] cursor-help" title={COMBINED_TOOLTIP}>ⓘ</span>
                      )}
                    </p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
                    <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{sub}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Per-project cards */}
            <div className="space-y-4">
              {/* Standard projects (Arthur-style with AI traffic funnel) */}
              {standardProjects.map((project) => {
                const { mtd, projectId } = project;
                const traffic     = (mtd.llm_traffic_daily as number) ?? 0;
                const demosBooked = (mtd.demos_booked_mtd  as number) ?? 0;
                const demosHeld   = (mtd.demos_held_mtd    as number) ?? 0;
                const closedWon   = (mtd.closed_won_mtd    as number) ?? 0;
                const arrClosed   = (mtd.arr_closed_mtd    as number) ?? 0;

                const displayName =
                  project.projectName ??
                  projectId.charAt(0).toUpperCase() + projectId.slice(1);

                const funnelSteps = [
                  { label: "Traffic", value: traffic,     currency: false },
                  { label: "Booked",  value: demosBooked, currency: false },
                  { label: "Held",    value: demosHeld,   currency: false },
                  { label: "Won",     value: closedWon,   currency: false },
                  { label: "ARR",     value: arrClosed,   currency: true  },
                ];

                return (
                  <div
                    key={projectId}
                    className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)] p-6"
                  >
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
                          Funnel &middot; {scopeLabel}
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

              {/* Enrichment project card */}
              {enrichmentProject && (
                <EnrichmentProjectCard project={enrichmentProject} scopeLabel={scopeLabel} />
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
