"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { Project } from "@/types";
import { formatCurrency } from "@/lib/utils";

interface Props {
  initialProjects: Project[];
  initialMaxSpend: number;
}

export function ProjectsClient({ initialProjects, initialMaxSpend }: Props) {
  const [projects, setProjects] = useState(initialProjects);
  const [maxSpend, setMaxSpend] = useState(initialMaxSpend);
  const [isPending, startTransition] = useTransition();

  const totalActual    = projects.reduce((s, p) => s + (p.apiKeySpend    ?? 0), 0);
  const totalEstimated = projects.reduce((s, p) => s + (p.estimatedServiceSpend ?? 0), 0);

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
    if (totalActual > 0 && totalEstimated > 0) {
      return (
        <span>
          <span className="text-slate-700 dark:text-slate-300 font-medium">{formatCurrency(totalActual)}</span>
          <span className="text-slate-400"> actual · </span>
          <span className="text-slate-500">~{formatCurrency(totalEstimated)}</span>
          <span className="text-slate-400"> estimated</span>
        </span>
      );
    }
    if (totalActual > 0) {
      return (
        <span>
          <span className="text-slate-700 dark:text-slate-300 font-medium">{formatCurrency(totalActual)}</span>
          <span className="text-slate-400"> actual</span>
        </span>
      );
    }
    if (totalEstimated > 0) {
      return (
        <span>
          <span className="text-slate-500">~{formatCurrency(totalEstimated)}</span>
          <span className="text-slate-400"> estimated</span>
        </span>
      );
    }
    return null;
  }

  return (
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
            <ProjectCard key={`${p.name}-${i}`} project={p} index={i} maxSpend={maxSpend} />
          ))}
        </div>
      )}
    </div>
  );
}
