"use client";

import { useState, useTransition, useMemo } from "react";
import * as RTooltip from "@radix-ui/react-tooltip";
import { AlertCircle, Search } from "lucide-react";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { Project } from "@/types";
import { formatCurrency, cn } from "@/lib/utils";
import { UnallocatedSpend } from "@/lib/project-expense";

const SCOPE_OPTIONS = [
  { value: "mtd",      label: "This Month"    },
  { value: "last_3m",  label: "Last 3M"       },
  { value: "last_12m", label: "Last 12M"      },
  { value: "all_time", label: "All Time"      },
];

const STATUS_FILTERS = [
  { key: "all",        label: "All"        },
  { key: "production", label: "Production" },
  { key: "dev",        label: "R&D"        },
  { key: "paused",     label: "Paused"     },
  { key: "planned",    label: "Planned"    },
  { key: "deprecated", label: "Deprecated" },
];

const SORT_OPTIONS = [
  { value: "spend_desc",  label: "Total spend ↓"  },
  { value: "direct_desc", label: "Direct spend ↓" },
  { value: "name_asc",    label: "Name A–Z"        },
  { value: "status",      label: "Status"          },
];

function matchStatusFilter(status: string | null, key: string): boolean {
  if (key === "all" || !status) return key === "all";
  const s = status.toLowerCase();
  switch (key) {
    case "production":  return s.includes("live") || s.includes("active") || s.includes("production");
    case "dev":         return s.includes("progress") || s.includes("dev") || s.includes("build");
    case "paused":      return s.includes("pause") || s.includes("hold") || s.includes("stop");
    case "planned":     return s.includes("plan") || s.includes("backlog") || s.includes("queue");
    case "deprecated":  return s.includes("shut") || s.includes("cancel") || s.includes("dead");
    default:            return true;
  }
}

function sortProjects(projects: Project[], sort: string): Project[] {
  return [...projects].sort((a, b) => {
    switch (sort) {
      case "spend_desc":  return (b.totalSpend ?? -1) - (a.totalSpend ?? -1);
      case "direct_desc": return (b.expenseBreakdown?.direct ?? -1) - (a.expenseBreakdown?.direct ?? -1);
      case "name_asc":    return a.name.localeCompare(b.name);
      case "status":      return (a.status ?? "zzz").localeCompare(b.status ?? "zzz");
      default:            return 0;
    }
  });
}

function UnallocatedCard({ data }: { data: UnallocatedSpend }) {
  const sections: { label: string; amount: number; vendors: { vendor: string; amount: number }[] }[] = [];

  if (data.sharedTooling > 0) {
    sections.push({ label: "Shared Tooling", amount: data.sharedTooling, vendors: data.topSharedToolingVendors });
  }
  if (data.invoicesUnallocated > 0) {
    sections.push({ label: "Unallocated Invoices", amount: data.invoicesUnallocated, vendors: data.topUnallocatedInvoiceVendors });
  }
  if (data.unlinkedOrKeys > 0) {
    sections.push({ label: "Unlinked OR Keys", amount: data.unlinkedOrKeys, vendors: [] });
  }

  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-slate-400" />
            <h3 className="font-bold text-slate-500 dark:text-slate-400 text-sm">Unallocated Spend</h3>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 leading-snug">
            Costs that can&apos;t yet be attributed to a project
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-slate-500 dark:text-slate-400 text-sm">{formatCurrency(data.total)}</p>
        </div>
      </div>

      {sections.map((sec) => (
        <div key={sec.label}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{sec.label}</span>
            <span className="text-[10px] font-semibold text-slate-500">{formatCurrency(sec.amount)}</span>
          </div>
          {sec.vendors.length > 0 && (
            <ul className="space-y-0.5">
              {sec.vendors.map((v) => (
                <li key={v.vendor} className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pl-2">
                  <span className="truncate">{v.vendor}</span>
                  <span className="shrink-0 text-slate-400">{formatCurrency(v.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}

      <p className="text-[10px] text-slate-400 dark:text-slate-500 italic border-t border-slate-200 dark:border-slate-700 pt-2 leading-snug">
        Shared infrastructure ({formatCurrency(data.sharedInfraAllocated)}) has been allocated proportionally to projects.
        To attribute costs above to a project, use the Allocate button on the Financial Records page.
      </p>
    </div>
  );
}

interface Props {
  initialProjects: Project[];
  initialMaxSpend: number;
  initialUnallocated: UnallocatedSpend;
  arthurLastSynced?: string | null;
}

export function ProjectsClient({ initialProjects, initialMaxSpend, initialUnallocated, arthurLastSynced }: Props) {
  const [scope, setScope] = useState("all_time");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState("spend_desc");
  const [projects, setProjects] = useState(initialProjects);
  const [maxSpend, setMaxSpend] = useState(initialMaxSpend);
  const [unallocated, setUnallocated] = useState(initialUnallocated);
  const [isPending, startTransition] = useTransition();

  function changeScope(newScope: string) {
    setScope(newScope);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/projects/expenses?scope=${newScope}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setProjects(data.projects ?? []);
        setMaxSpend(data.maxSpend ?? 0);
        setUnallocated(data.unallocated ?? initialUnallocated);
      } catch {
        // silently ignore
      }
    });
  }

  const attributedTotal = projects.reduce((s, p) => s + (p.totalSpend ?? 0), 0);
  const grandTotal = attributedTotal + unallocated.total;

  const displayed = useMemo(() => {
    let filtered = projects;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      filtered = filtered.filter((p) => matchStatusFilter(p.status, statusFilter));
    }
    return sortProjects(filtered, sort);
  }, [projects, search, statusFilter, sort]);

  function headerSpend() {
    if (grandTotal <= 0) return null;
    return (
      <span>
        <span className="text-slate-700 dark:text-slate-300 font-medium">{formatCurrency(attributedTotal)}</span>
        <span className="text-slate-400"> attributed · </span>
        <span className="text-slate-500 dark:text-slate-400 font-medium">{formatCurrency(unallocated.total)}</span>
        <span className="text-slate-400"> unallocated · </span>
        <span className="text-slate-600 dark:text-slate-300 font-semibold">{formatCurrency(grandTotal)}</span>
        <span className="text-slate-400"> total</span>
      </span>
    );
  }

  return (
    <RTooltip.Provider delayDuration={150}>
      <div className="p-6 space-y-4">
        {/* Header row */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Projects</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {projects.length} projects · {headerSpend()}
            </p>
          </div>

          {/* Scope selector */}
          <div className={cn(
            "flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 transition-opacity",
            isPending && "opacity-60 pointer-events-none"
          )}>
            {SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => changeScope(opt.value)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap",
                  scope === opt.value
                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm"
                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Controls bar */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search projects…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
            />
          </div>

          {/* Status filter chips */}
          <div className="flex items-center gap-1 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors whitespace-nowrap",
                  statusFilter === f.key
                    ? "bg-indigo-500 text-white"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="ml-auto px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-400 cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Grid */}
        {projects.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-16">No projects found. Check Supabase RLS on agents_portfolio table.</p>
        ) : displayed.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-16">No projects match the current filters.</p>
        ) : (
          <div className={cn(
            "grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 transition-opacity duration-150",
            isPending && "opacity-50"
          )}>
            {displayed.map((p, i) => {
              const pctOfTotal = grandTotal > 0 ? ((p.totalSpend ?? 0) / grandTotal) * 100 : 0;
              return (
                <ProjectCard
                  key={`${p.name}-${i}`}
                  project={p}
                  index={i}
                  maxSpend={maxSpend}
                  arthurLastSynced={p.name === "Arthur for Fello" ? arthurLastSynced : undefined}
                  pctOfTotal={pctOfTotal > 0.05 ? pctOfTotal : undefined}
                />
              );
            })}
            {unallocated.total > 0 && statusFilter === "all" && !search.trim() && (
              <UnallocatedCard data={unallocated} />
            )}
          </div>
        )}
      </div>
    </RTooltip.Provider>
  );
}
