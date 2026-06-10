"use client";

import { useState, useTransition } from "react";
import * as RTooltip from "@radix-ui/react-tooltip";
import { RefreshCw, AlertCircle } from "lucide-react";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { Project } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { UnallocatedSpend } from "@/lib/project-expense";

interface Props {
  initialProjects: Project[];
  initialMaxSpend: number;
  arthurLastSynced?: string | null;
  unallocated: UnallocatedSpend;
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

export function ProjectsClient({ initialProjects, initialMaxSpend, arthurLastSynced, unallocated }: Props) {
  const [projects, setProjects] = useState(initialProjects);
  const [maxSpend, setMaxSpend] = useState(initialMaxSpend);
  const [isPending, startTransition] = useTransition();

  // attributed = sum of all project totals (direct + their allocated infra share)
  const attributedTotal = projects.reduce((s, p) => s + (p.totalSpend ?? 0), 0);
  const grandTotal = attributedTotal + unallocated.total;

  function refresh() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/sheets", { cache: "no-store" });
        if (!res.ok) return;
        const { projects: fresh }: { projects: Project[] } = await res.json();
        const sorted = [...fresh].sort((a, b) => (b.totalSpend ?? -1) - (a.totalSpend ?? -1));
        const newMax = Math.max(0, ...sorted.map((p) => p.totalSpend ?? 0));
        setProjects(sorted);
        setMaxSpend(newMax);
      } catch {
        // silently ignore
      }
    });
  }

  function headerSpend() {
    if (grandTotal <= 0) return null;
    return (
      <span>
        <span className="text-slate-700 dark:text-slate-300 font-medium">{formatCurrency(attributedTotal)}</span>
        <span className="text-slate-400"> attributed (incl. allocated infra) · </span>
        <span className="text-slate-500 dark:text-slate-400 font-medium">{formatCurrency(unallocated.total)}</span>
        <span className="text-slate-400"> unallocated · </span>
        <span className="text-slate-600 dark:text-slate-300 font-semibold">{formatCurrency(grandTotal)}</span>
        <span className="text-slate-400"> total</span>
      </span>
    );
  }

  return (
    <RTooltip.Provider delayDuration={150}>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Projects</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              {projects.length} projects · {headerSpend()}
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={isPending}
            className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isPending ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        {projects.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-16">No projects found. Check Supabase RLS on agents_portfolio table.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {projects.map((p, i) => (
              <ProjectCard
                key={`${p.name}-${i}`}
                project={p}
                index={i}
                maxSpend={maxSpend}
                arthurLastSynced={p.name === "Arthur for Fello" ? arthurLastSynced : undefined}
              />
            ))}
            {unallocated.total > 0 && (
              <UnallocatedCard data={unallocated} />
            )}
          </div>
        )}
      </div>
    </RTooltip.Provider>
  );
}
