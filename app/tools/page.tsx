"use client";

import { useEffect, useState } from "react";
import { ToolCard } from "@/components/tools/ToolCard";
import { FlaggedToolsBanner } from "@/components/tools/FlaggedToolsBanner";
import { Tool, FlaggedToolsData } from "@/types";
import { formatCurrency } from "@/lib/utils";
import { AlertTriangle, Ban } from "lucide-react";

async function fetchTools(): Promise<Tool[]> {
  try {
    const res = await fetch("/api/tools", { cache: "no-store" });
    if (!res.ok) return [];
    const json = await res.json();
    return json.tools ?? [];
  } catch {
    return [];
  }
}

async function fetchFlaggedTools(): Promise<FlaggedToolsData> {
  try {
    const res = await fetch("/api/flagged-tools", { cache: "no-store" });
    if (!res.ok) return { billedInactive: [], neverUsed: [] };
    return res.json();
  } catch {
    return { billedInactive: [], neverUsed: [] };
  }
}

function getToolFlags(
  toolName: string,
  flaggedData: FlaggedToolsData
): ("paying_not_in_use" | "never_used")[] {
  const key = toolName.toLowerCase();
  const flags: ("paying_not_in_use" | "never_used")[] = [];
  const fuzzy = (a: string, b: string) => a.includes(b) || b.includes(a);
  if (flaggedData.billedInactive.some((v) => fuzzy(key, v.vendor_name.toLowerCase()))) {
    flags.push("paying_not_in_use");
  }
  if (flaggedData.neverUsed.some((v) => fuzzy(key, v.vendor_name.toLowerCase()))) {
    flags.push("never_used");
  }
  return flags;
}

export default function ToolsPage() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [flaggedData, setFlaggedData] = useState<FlaggedToolsData>({ billedInactive: [], neverUsed: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchTools(), fetchFlaggedTools()]).then(([t, f]) => {
      setTools(t);
      setFlaggedData(f);
      setLoading(false);
    });
  }, []);

  function handleDelete(toolKey: string) {
    setTools((prev) => prev.filter((t) => t.name !== toolKey));
  }

  function handleEdit(toolKey: string, updates: { displayLabel: string; type: "llm" | "service"; notes: string }) {
    setTools((prev) =>
      prev.map((t) =>
        t.name === toolKey ? { ...t, displayLabel: updates.displayLabel, type: updates.type, notes: updates.notes } : t
      )
    );
  }

  const llms     = tools.filter((t) => t.type === "llm"     && !getToolFlags(t.name, flaggedData).length);
  const services = tools.filter((t) => t.type === "service" && !getToolFlags(t.name, flaggedData).length);
  const flagged  = tools.filter((t) => getToolFlags(t.name, flaggedData).length > 0);
  const totalSpend = tools.reduce((s, t) => s + t.totalSpend, 0);
  const totalFlagged = flaggedData.billedInactive.length + flaggedData.neverUsed.length;

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-sm text-slate-400">Loading tools...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Tools</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {tools.length} vendors · {formatCurrency(totalSpend)} total spend
          </p>
        </div>
        {totalFlagged > 0 && (
          <FlaggedToolsBanner
            billedInactive={flaggedData.billedInactive}
            neverUsed={flaggedData.neverUsed}
          />
        )}
      </div>

      {/* LLM Providers */}
      {llms.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            LLM Providers
          </h2>
          <div className="space-y-2">
            {llms.map((tool) => (
              <ToolCard
                key={tool.name}
                tool={tool}
                flagTypes={getToolFlags(tool.name, flaggedData)}
                onDelete={handleDelete} onEdit={handleEdit}
              />
            ))}
          </div>
        </section>
      )}

      {/* Services */}
      {services.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
            Services
          </h2>
          <div className="space-y-2">
            {services.map((tool) => (
              <ToolCard
                key={tool.name}
                tool={tool}
                flagTypes={getToolFlags(tool.name, flaggedData)}
                onDelete={handleDelete} onEdit={handleEdit}
              />
            ))}
          </div>
        </section>
      )}

      {/* Flagged */}
      {flagged.length > 0 && (
        <section id="flagged" className="space-y-2 scroll-mt-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              Flagged
            </h2>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
              {flagged.length}
            </span>
          </div>
          <div className="space-y-2">
            {flagged.map((tool) => (
              <ToolCard
                key={tool.name}
                tool={tool}
                flagTypes={getToolFlags(tool.name, flaggedData)}
                onDelete={handleDelete} onEdit={handleEdit}
              />
            ))}
          </div>
        </section>
      )}

      {/* Unmatched flagged vendors not in the tool list */}
      {(flaggedData.billedInactive.length > 0 || flaggedData.neverUsed.length > 0) &&
        flagged.length === 0 && (
          <section id="flagged" className="scroll-mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm p-5 space-y-4">
            <h2 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              Flagged Vendors
            </h2>
            {flaggedData.billedInactive.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Billed &amp; inactive ({flaggedData.billedInactive.length})
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {flaggedData.billedInactive.map((v) => (
                    <span key={v.vendor_name} className="text-xs px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-400 font-medium">
                      {v.vendor_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {flaggedData.neverUsed.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Ban className="w-3.5 h-3.5 text-red-500" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Never used ({flaggedData.neverUsed.length})
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {flaggedData.neverUsed.map((v) => (
                    <span key={v.vendor_name} className="text-xs px-2.5 py-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-400 font-medium">
                      {v.vendor_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
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
