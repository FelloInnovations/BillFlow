"use client";

import { useState, useEffect, ComponentType } from "react";
import { BarChart2, ShieldAlert, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActivityData, LogEntry, PaginatedResult } from "@/types";
import { SpendTab } from "./SpendTab";
import { GuardrailsTab } from "./GuardrailsTab";
import { LogsTab } from "./LogsTab";
import TodaySpendCard from "./TodaySpendCard";

interface Props {
  initialActivity: ActivityData;
  initialGuardrails?: unknown;
  initialLogs: PaginatedResult<LogEntry>;
}

type Tab = "spend" | "guardrails" | "logs";

const TABS: { id: Tab; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { id: "spend",      label: "Spend",      Icon: BarChart2 },
  { id: "guardrails", label: "Guardrails", Icon: ShieldAlert },
  { id: "logs",       label: "Logs",       Icon: List },
];

export function ActivityClient({ initialActivity, initialLogs }: Props) {
  const [tab, setTab] = useState<Tab>("spend");
  const [monthRange, setMonthRange] = useState<1 | 3 | 6 | 12>(6);
  const [lastSynced, setLastSynced] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/activity/last-synced")
      .then(r => r.json())
      .then(d => setLastSynced(d.last_synced_at));
  }, []);

  const allKeyNames = initialActivity.keys.map(k => k.key_name);

  return (
    <div className="space-y-5">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800 w-full sm:w-fit overflow-x-auto">
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
        <TodaySpendCard />
        <SpendTab
          activity={initialActivity}
          monthRange={monthRange}
          setMonthRange={setMonthRange}
          lastSynced={lastSynced}
        />
      </div>

      <div className={tab === "guardrails" ? "" : "hidden"}>
        <GuardrailsTab activity={initialActivity} />
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
