"use client";

import { useState, useMemo } from "react";
import * as RTooltip from "@radix-ui/react-tooltip";
import { AlertCircle, Search } from "lucide-react";
import Link from "next/link";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { Project } from "@/types";
import { formatCurrency, cn } from "@/lib/utils";
import { UnallocatedSpend } from "@/lib/project-expense";

const SORT_OPTIONS = [
  { value: "spend_desc",      label: "Total spend ↓"      },
  { value: "openrouter_desc", label: "OpenRouter spend ↓" },
  { value: "name_asc",        label: "Name A–Z"            },
  { value: "status",          label: "Status"              },
];

function sortProjects(projects: Project[], sort: string): Project[] {
  return [...projects].sort((a, b) => {
    switch (sort) {
      case "spend_desc":
        return (b.totalSpend ?? -1) - (a.totalSpend ?? -1);
      case "openrouter_desc":
        return (b.expenseBreakdown?.breakdown.openrouter.keyTotalSpend ?? -1) -
               (a.expenseBreakdown?.breakdown.openrouter.keyTotalSpend ?? -1);
      case "name_asc":
        return a.name.localeCompare(b.name);
      case "status":
        return (a.status ?? "zzz").localeCompare(b.status ?? "zzz");
      default:
        return 0;
    }
  });
}

function UnallocatedCard({ data }: { data: UnallocatedSpend }) {
  const miscCount = data.unallocated_misc.count;

  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-slate-400 shrink-0" />
          <h3 className="font-bold text-slate-500 dark:text-slate-400 text-sm leading-tight">
            Unallocated · Not Attributable to Any Single Project
          </h3>
        </div>
        <p className="font-bold text-slate-500 dark:text-slate-400 text-sm shrink-0">
          {formatCurrency(data.grand_total)}
        </p>
      </div>

      {data.shared_infrastructure.total > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Shared Infrastructure
            </span>
            <span className="text-[10px] font-semibold text-slate-500">
              {formatCurrency(data.shared_infrastructure.total)}
            </span>
          </div>
          <ul className="space-y-0.5">
            {data.shared_infrastructure.vendors.map((v) => (
              <li key={v.name} className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pl-2">
                <span className="truncate">{v.name}</span>
                <span className="shrink-0 text-slate-400">{formatCurrency(v.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.shared_tooling.total > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Shared Tooling
            </span>
            <span className="text-[10px] font-semibold text-slate-500">
              {formatCurrency(data.shared_tooling.total)}
            </span>
          </div>
          <ul className="space-y-0.5">
            {data.shared_tooling.vendors.map((v) => (
              <li key={v.name} className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400 pl-2">
                <span className="truncate">{v.name}</span>
                <span className="shrink-0 text-slate-400">{formatCurrency(v.value)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.unallocated_misc.total > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Unallocated Invoices
            </span>
            <span className="text-[10px] font-semibold text-slate-500">
              {formatCurrency(data.unallocated_misc.total)}
            </span>
          </div>
          {miscCount > 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 pl-2">
              {miscCount} invoice{miscCount !== 1 ? "s" : ""} need allocation
            </p>
          )}
        </div>
      )}

      <p className="text-[10px] text-slate-400 dark:text-slate-500 italic border-t border-slate-200 dark:border-slate-700 pt-2 leading-snug">
        {miscCount > 0 && (
          <>
            <Link href="/records?costType=unallocated" className="hover:text-indigo-400 transition-colors">
              {miscCount} invoice{miscCount !== 1 ? "s" : ""} in &lsquo;Unallocated Invoices&rsquo; still need allocation. Triage them in Financial Records →.
            </Link>{" "}
          </>
        )}
        Shared Infrastructure and Shared Tooling are not split across projects — they remain costs of running the portfolio as a whole.
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
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("spend_desc");

  const projects = initialProjects;
  const maxSpend = initialMaxSpend;
  const unallocated = initialUnallocated;

  // Sum each unique OR key once (shared keys are counted once, not once per project)
  const { attributedTotal, grandTotal } = useMemo(() => {
    const seenKeys = new Set<string>();
    let attributed = 0;
    for (const p of projects) {
      const or = p.expenseBreakdown?.breakdown.openrouter;
      if (or) {
        for (const kd of or.keyDetails) {
          if (!seenKeys.has(kd.name)) {
            seenKeys.add(kd.name);
            attributed += kd.spend;
          }
        }
      }
      attributed += p.expenseBreakdown?.breakdown.allocated_invoices.value ?? 0;
    }
    attributed = Math.round(attributed * 100) / 100;
    return { attributedTotal: attributed, grandTotal: Math.round((attributed + unallocated.grand_total) * 100) / 100 };
  }, [projects, unallocated.grand_total]);

  const displayed = useMemo(() => {
    let filtered = projects;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((p) => p.name.toLowerCase().includes(q));
    }
    return sortProjects(filtered, sort);
  }, [projects, search, sort]);

  function headerSpend() {
    if (grandTotal <= 0) return null;
    return (
      <span>
        <span className="text-slate-700 dark:text-slate-300 font-medium">{formatCurrency(attributedTotal)}</span>
        <span className="text-slate-400"> attributed · </span>
        <span className="text-slate-500 dark:text-slate-400 font-medium">{formatCurrency(unallocated.grand_total)}</span>
        <span className="text-slate-400"> unallocated · </span>
        <span className="text-slate-600 dark:text-slate-300 font-semibold">{formatCurrency(grandTotal)}</span>
        <span className="text-slate-400"> total</span>
      </span>
    );
  }

  return (
    <RTooltip.Provider delayDuration={150}>
      <div className="p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Projects</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {projects.length} projects · {headerSpend()}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap">
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
          <p className="text-sm text-slate-400 text-center py-16">
            No projects found. Check Supabase RLS on agents_portfolio table.
          </p>
        ) : displayed.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-16">No projects match the search.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
            {unallocated.grand_total > 0 && !search.trim() && (
              <UnallocatedCard data={unallocated} />
            )}
          </div>
        )}
      </div>
    </RTooltip.Provider>
  );
}
