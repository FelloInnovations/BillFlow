"use client";

import { useState, ComponentType } from "react";
import { BarChart2, ShieldAlert, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActivityData, Guardrail, LogEntry, PaginatedResult } from "@/types";
import { SpendTab } from "./SpendTab";
import { GuardrailsTab } from "./GuardrailsTab";
import { LogsTab } from "./LogsTab";

interface Props {
  initialActivity: ActivityData;
  initialGuardrails: Guardrail[];
  initialLogs: PaginatedResult<LogEntry>;
}

type Tab = "spend" | "guardrails" | "logs";

const TABS: { id: Tab; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: "spend",      label: "Spend",      Icon: BarChart2 },
  { id: "guardrails", label: "Guardrails", Icon: ShieldAlert },
  { id: "logs",       label: "Logs",       Icon: List },
];

export function ActivityClient({ initialActivity, initialGuardrails, initialLogs }: Props) {
  const [tab, setTab] = useState<Tab>("spend");
  const [guardrails, setGuardrails] = useState<Guardrail[]>(initialGuardrails);
  const [monthRange, setMonthRange] = useState<3 | 6 | 12>(6);

  async function handleSave(projectName: string, budget: number, threshold: number) {
    const res = await fetch("/api/guardrails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        project_name: projectName,
        monthly_budget_usd: budget,
        warning_threshold_pct: threshold,
      }),
    });
    if (res.ok) {
      const saved: Guardrail = await res.json();
      setGuardrails(prev => {
        const idx = prev.findIndex(g => g.project_name === projectName);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = saved;
          return next;
        }
        return [...prev, saved];
      });
    }
  }

  async function handleDelete(projectName: string) {
    const res = await fetch(
      `/api/guardrails?project_name=${encodeURIComponent(projectName)}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      setGuardrails(prev => prev.filter(g => g.project_name !== projectName));
    }
  }

  const allKeyNames = initialActivity.keys.map(k => k.key_name);

  return (
    <div className="space-y-5">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-fit">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all",
              tab === id
                ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className={tab === "spend" ? "" : "hidden"}>
        <SpendTab
          activity={initialActivity}
          monthRange={monthRange}
          setMonthRange={setMonthRange}
        />
      </div>

      <div className={tab === "guardrails" ? "" : "hidden"}>
        <GuardrailsTab
          activity={initialActivity}
          guardrails={guardrails}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      </div>

      <div className={tab === "logs" ? "" : "hidden"}>
        <LogsTab
          allKeyNames={allKeyNames}
          initialData={initialLogs}
        />
      </div>
    </div>
  );
}
