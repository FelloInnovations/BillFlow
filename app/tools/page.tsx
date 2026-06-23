"use client";

import { useEffect, useState } from "react";
import { ToolCard } from "@/components/tools/ToolCard";
import { Tool } from "@/types";
import { formatCurrency } from "@/lib/utils";

async function fetchTools(): Promise<{ tools: Tool[]; allProjectNames: string[] }> {
  try {
    const res = await fetch("/api/tools", { cache: "no-store" });
    if (!res.ok) return { tools: [], allProjectNames: [] };
    const json = await res.json();
    return { tools: json.tools ?? [], allProjectNames: json.allProjectNames ?? [] };
  } catch {
    return { tools: [], allProjectNames: [] };
  }
}

const threeMonthsAgo = (() => {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d;
})();

function hasRecentActivity(tool: Tool): boolean {
  return tool.monthlyTrend.some(({ month }) => new Date("1 " + month) >= threeMonthsAgo);
}

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [allProjectNames, setAllProjectNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTools().then(({ tools: t, allProjectNames: p }) => {
      setTools(t);
      setAllProjectNames(p);
      setLoading(false);
    });
  }, []);

  function handleDelete(toolKey: string) {
    setTools((prev) => prev.filter((t) => t.name !== toolKey));
  }

  function handleEdit(toolKey: string, updates: { displayLabel: string; type: "llm" | "service"; notes: string }) {
    setTools((prev) =>
      prev.map((t) =>
        t.name === toolKey ? { ...t, ...updates } : t
      )
    );
  }

  function handleAttributeChange(toolKey: string, manualProjects: string[]) {
    setTools((prev) =>
      prev.map((t) => {
        if (t.name !== toolKey) return t;
        const merged = [...new Set([...(t.autoProjects ?? []), ...manualProjects])];
        return { ...t, manualProjects, hasManualOverride: manualProjects.length > 0, projects: merged };
      })
    );
  }

  // Tools with no recent activity and no linked projects go to Unused/Unlinked
  const unusedUnlinked = tools.filter(
    (t) => t.totalSpend > 0 && t.projects.length === 0 && !hasRecentActivity(t)
  );
  const unusedSet = new Set(unusedUnlinked.map((t) => t.name));

  const llms     = tools.filter((t) => t.type === "llm"     && !unusedSet.has(t.name));
  const services = tools.filter((t) => t.type === "service" && !unusedSet.has(t.name));
  // Exclude the OpenRouter invoice (wallet top-up) row — actual OR spend is
  // captured per API key in the OpenRouter:keyName rows, so counting both doubles it.
  const totalSpend = tools
    .filter((t) => t.name !== "OpenRouter")
    .reduce((s, t) => s + t.totalSpend, 0);

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <p className="text-sm text-slate-400">Loading tools...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Tools</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {tools.length} vendors · {formatCurrency(totalSpend)} total spend
        </p>
      </div>

      {/* LLM Providers */}
      {llms.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            LLM Providers
          </h2>
          <div className="space-y-2">
            {llms.map((tool) => (
              <ToolCard key={tool.name} tool={tool} onDelete={handleDelete} onEdit={handleEdit} allProjectNames={allProjectNames} onAttributeChange={handleAttributeChange} />
            ))}
          </div>
        </section>
      )}

      {/* Shared Infrastructure */}
      {services.length > 0 && (
        <section className="space-y-2">
          <div>
            <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              Shared Infrastructure
            </h2>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Org-wide · not attributed to projects</p>
          </div>
          <div className="space-y-2">
            {services.map((tool) => (
              <ToolCard key={tool.name} tool={tool} onDelete={handleDelete} onEdit={handleEdit} allProjectNames={allProjectNames} onAttributeChange={handleAttributeChange} />
            ))}
          </div>
        </section>
      )}

      {/* Unused / Unlinked Tools */}
      {unusedUnlinked.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              Unused / Unlinked Tools
            </h2>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
              Tools with spend but no active project association and no invoices in the last 90 days
            </p>
          </div>
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
            {unusedUnlinked.map((tool) => (
              <div key={tool.name} className="flex items-center justify-between px-5 py-3.5">
                <span className="text-sm text-slate-500 dark:text-slate-400">{tool.displayLabel}</span>
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">{formatCurrency(tool.totalSpend)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {tools.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-16">
          No tools data available.
        </p>
      )}
    </div>
  );
}
