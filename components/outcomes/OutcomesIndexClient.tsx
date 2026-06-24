"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ProjectOutcomeSummary } from "@/types";
import { formatCurrency } from "@/lib/utils";

type Scope = "all_time" | "this_month" | "last_3m" | "last_6m" | "last_12m";

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "all_time",   label: "All Time"      },
  { value: "this_month", label: "This Month"    },
  { value: "last_3m",   label: "Last 3 Months" },
  { value: "last_6m",   label: "Last 6 Months" },
  { value: "last_12m",  label: "Last 12 Months"},
];

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
  let cls = "bg-[var(--bg-secondary)] text-[var(--text-tertiary)]";
  if (s.includes("shut") || s.includes("cancelled") || s.includes("dead"))
    cls = "bg-[var(--bg-error-primary)] text-[var(--text-error-primary)]";
  else if (s.includes("live") || s.includes("active") || s.includes("production"))
    cls = "bg-[var(--bg-success-primary)] text-[var(--text-success-primary)]";
  else if (s.includes("progress") || s.includes("dev") || s.includes("build"))
    cls = "bg-[var(--bg-warning-primary)] text-[var(--text-warning-primary)]";
  else if (s.includes("pause") || s.includes("hold") || s.includes("stop"))
    cls = "bg-[var(--bg-warning-primary)] text-[var(--text-warning-primary)]";
  else if (s.includes("plan") || s.includes("backlog") || s.includes("queue"))
    cls = "bg-[var(--bg-brand-primary)] text-[var(--text-brand-primary)]";
  return (
    <span className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {status}
    </span>
  );
}

function EnrichmentProjectCard({
  project,
  scopeLabel,
}: {
  project: ProjectOutcomeSummary;
  scopeLabel: string;
}) {
  const { mtd } = project;
  const pushed      = (mtd.agents_pushed_hubspot as number) ?? 0;
  const demosBooked = (mtd.demos_booked_mtd      as number) ?? 0;
  const demosHeld   = (mtd.demos_held_mtd        as number) ?? 0;
  const closedWon   = (mtd.closed_won_mtd        as number) ?? 0;
  const arrClosed   = (mtd.arr_closed_mtd        as number) ?? 0;

  const teamsPushed      = (mtd.teams_pushed_hubspot   as number) ?? 0;
  const teamDemosBooked  = (mtd.team_demos_booked_mtd  as number) ?? 0;
  const teamDemosHeld    = (mtd.team_demos_held_mtd    as number) ?? 0;
  const teamClosedWon    = (mtd.team_closed_won_mtd    as number) ?? 0;
  const teamArrClosed    = (mtd.team_arr_closed_mtd    as number) ?? 0;

  const contactFunnel = [
    { label: "Pushed",  value: pushed,      currency: false },
    { label: "Booked",  value: demosBooked, currency: false },
    { label: "Held",    value: demosHeld,   currency: false },
    { label: "Won",     value: closedWon,   currency: false },
    { label: "ARR",     value: arrClosed,   currency: true  },
  ];

  const teamFunnel = [
    { label: "Pushed",  value: teamsPushed,     currency: false },
    { label: "Booked",  value: teamDemosBooked, currency: false },
    { label: "Held",    value: teamDemosHeld,   currency: false },
    { label: "Won",     value: teamClosedWon,   currency: false },
    { label: "ARR",     value: teamArrClosed,   currency: true  },
  ];

  function FunnelRow({ steps }: { steps: typeof contactFunnel }) {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {steps.map(({ label, value, currency }, i) => (
          <div key={label} className="flex items-center gap-1">
            <div className="text-center min-w-[3.5rem]">
              <div className="text-base font-semibold text-[var(--text-primary)] leading-tight">
                {currency ? formatCurrency(value) : value.toLocaleString()}
              </div>
              <div className="text-[9px] uppercase tracking-wider text-[var(--text-quaternary)] mt-0.5">
                {label}
              </div>
            </div>
            {i < steps.length - 1 && (
              <span className="text-[var(--text-quaternary)] text-[11px] font-semibold">→</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <h2 className="font-semibold text-[var(--text-primary)] text-base leading-tight">
            Enrichment
          </h2>
          {project.projectStatus && <StatusBadge status={project.projectStatus} />}
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--bg-brand-primary)] text-[var(--text-brand-primary)]">
            MAD ID Pipeline
          </span>
        </div>
        <Link
          href="/projects/enrichment/outcomes"
          className="text-sm font-semibold text-[var(--text-brand-primary)] hover:opacity-80 transition-opacity shrink-0"
        >
          View Details →
        </Link>
      </div>

      <div className="space-y-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)] mb-3">
            Contact Funnel &middot; {scopeLabel}
          </p>
          <FunnelRow steps={contactFunnel} />
        </div>

        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)] mb-3">
            Team Funnel &middot; {scopeLabel}
          </p>
          <FunnelRow steps={teamFunnel} />
        </div>
      </div>

      {project.lastSynced && (
        <div className="mt-5 pt-4 border-t border-[var(--border-tertiary)]">
          <p className="text-[11px] text-[var(--text-quaternary)]">
            Last synced {timeAgo(project.lastSynced)}
          </p>
        </div>
      )}
    </div>
  );
}

type ArthurInputSummary = {
  totalIdeas: number;
  totalArticles: number;
  totalPublished: number;
  conversionRate: number;
};

export function OutcomesIndexClient() {
  const [scope, setScope]         = useState<Scope>("all_time");
  const [projects, setProjects]   = useState<ProjectOutcomeSummary[]>([]);
  const [loading, setLoading]     = useState(true);
  const [arthurInput, setArthurInput] = useState<ArthurInputSummary>({
    totalIdeas: 0,
    totalArticles: 0,
    totalPublished: 0,
    conversionRate: 0,
  });

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/outcomes?scope=${scope}`).then((r) => r.json()),
      fetch("/api/arthur/metrics?period=all").then((r) => r.json()),
    ])
      .then(([outcomesData, arthurData]) => {
        setProjects(Array.isArray(outcomesData) ? outcomesData : (Array.isArray(outcomesData.projects) ? outcomesData.projects : []));
        setArthurInput({
          totalIdeas:    arthurData?.kpi?.totalIdeas    ?? 0,
          totalArticles: arthurData?.kpi?.totalArticles ?? 0,
          totalPublished: arthurData?.kpi?.totalPublished ?? 0,
          conversionRate: arthurData?.kpi?.conversionRate ?? 0,
        });
      })
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  }, [scope]);

  const scopeLabel = SCOPE_OPTIONS.find((o) => o.value === scope)?.label ?? "All Time";

  const enrichmentProject = projects.find((p) => p.projectId === "enrichment");
  const standardProjects  = projects.filter((p) => p.projectId !== "enrichment");

  return (
    <main className="flex-1 min-h-screen bg-[var(--bg-primary)] p-8">
      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Metrics</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-1">
            Performance portfolio across all AI projects &middot; {scopeLabel}
          </p>
        </div>

        <select
          value={scope}
          onChange={(e) => setScope(e.target.value as Scope)}
          className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)] text-xs font-semibold px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--ring-brand-primary)] focus:border-[var(--border-brand-solid)] cursor-pointer"
        >
          {SCOPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      <div className={loading ? "opacity-50 pointer-events-none transition-opacity" : "transition-opacity"}>
        {projects.length === 0 && !loading ? (
          <div className="rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm p-16 text-center">
            <p className="text-[var(--text-tertiary)] text-sm font-medium">
              No outcome data for this period.
            </p>
            <p className="text-[var(--text-quaternary)] text-xs mt-2">
              Check that{" "}
              <code className="font-mono bg-[var(--bg-secondary)] px-1 py-0.5 rounded">
                project_outcome_config
              </code>{" "}
              has active rows.
            </p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
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

                const isArthur = projectId === "arthur";
                const detailsHref = isArthur
                  ? "/projects/arthur/metrics"
                  : `/projects/${projectId}/outcomes`;

                return (
                  <div
                    key={projectId}
                    className="rounded-lg bg-[var(--bg-primary)] border border-[var(--border-tertiary)] shadow-sm p-6"
                  >
                    <div className="flex items-center justify-between mb-5">
                      <div className="flex items-center gap-2.5">
                        <h2 className="font-semibold text-[var(--text-primary)] text-base leading-tight">
                          {displayName}
                        </h2>
                        {project.projectStatus && (
                          <StatusBadge status={project.projectStatus} />
                        )}
                      </div>
                      <a
                        href={detailsHref}
                        style={{ fontSize: 13, fontWeight: 600, color: "var(--text-brand-primary)", textDecoration: "none" }}
                      >
                        View Details →
                      </a>
                    </div>

                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-quaternary)] mb-3">
                        {isArthur ? "OUTCOME METRICS · ALL TIME" : `Funnel · ${scopeLabel}`}
                      </p>
                      <div className="flex items-center gap-1 flex-wrap">
                        {funnelSteps.map(({ label, value, currency }, i) => (
                          <div key={label} className="flex items-center gap-1">
                            <div className="text-center min-w-[3.5rem]">
                              <div className="text-base font-semibold text-[var(--text-primary)] leading-tight">
                                {currency ? formatCurrency(value) : value.toLocaleString()}
                              </div>
                              <div className="text-[9px] uppercase tracking-wider text-[var(--text-quaternary)] mt-0.5">
                                {label}
                              </div>
                            </div>
                            {i < funnelSteps.length - 1 && (
                              <span className="text-[var(--text-quaternary)] text-[11px] font-semibold">→</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {isArthur && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border-tertiary)" }}>
                        <p style={{ fontSize: 10, fontWeight: 500, color: "var(--text-tertiary)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
                          INPUT METRICS · ALL TIME
                        </p>
                        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
                          <div>
                            <p style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{arthurInput.totalIdeas.toLocaleString()}</p>
                            <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>Ideas</p>
                          </div>
                          <span style={{ color: "var(--text-quaternary)", fontSize: 16 }}>→</span>
                          <div>
                            <p style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{arthurInput.totalArticles.toLocaleString()}</p>
                            <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>Articles</p>
                          </div>
                          <span style={{ color: "var(--text-quaternary)", fontSize: 16 }}>→</span>
                          <div>
                            <p style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{arthurInput.totalPublished.toLocaleString()}</p>
                            <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>Published</p>
                          </div>
                          <span style={{ color: "var(--text-quaternary)", fontSize: 16 }}>·</span>
                          <div>
                            <p style={{ fontSize: 20, fontWeight: 600, color: "var(--text-brand-primary)", margin: 0 }}>{arthurInput.conversionRate}%</p>
                            <p style={{ fontSize: 11, fontWeight: 500, color: "var(--text-tertiary)", margin: "2px 0 0", textTransform: "uppercase", letterSpacing: "0.06em" }}>Conversion</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {project.lastSynced && (
                      <div className="mt-5 pt-4 border-t border-[var(--border-tertiary)]">
                        <p className="text-[11px] text-[var(--text-quaternary)]">
                          Last synced {timeAgo(project.lastSynced)}
                        </p>
                      </div>
                    )}
                  </div>
                );
              })}

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
