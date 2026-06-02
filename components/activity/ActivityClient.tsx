"use client";

import { useState, useCallback, useEffect, ComponentType } from "react";
import { useRouter } from "next/navigation";
import { BarChart2, ShieldAlert, List } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActivityData, LogEntry, PaginatedResult } from "@/types";
import { SpendTab } from "./SpendTab";
import { GuardrailsTab } from "./GuardrailsTab";
import { LogsTab } from "./LogsTab";

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

export type SyncResult = {
  synced_keys: number;
  total_log_rows_written: number;
  errors: string[];
} | null;

export function ActivityClient({ initialActivity, initialLogs }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("spend");
  const [monthRange, setMonthRange] = useState<1 | 3 | 6 | 12>(6);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult>(null);
  const [syncCooldownUntil, setSyncCooldownUntil] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(
    initialActivity.last_synced_at ?? null
  );

  useEffect(() => {
    const stored = localStorage.getItem("billflow_last_sync");
    if (stored) setLastSyncAt(stored);
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/activity/sync", { method: "POST" });
      const json = await res.json();
      setSyncResult({
        synced_keys: json.synced_keys ?? 0,
        total_log_rows_written: json.total_log_rows_written ?? 0,
        errors: json.errors ?? [],
      });
      setSyncCooldownUntil(Date.now() + 60_000);
      const now = new Date().toISOString();
      setLastSyncAt(now);
      localStorage.setItem("billflow_last_sync", now);
      router.refresh();
    } catch {
      setSyncResult({ synced_keys: 0, total_log_rows_written: 0, errors: ["Request failed"] });
    } finally {
      setSyncing(false);
    }
  }, [router]);

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
          onSync={handleSync}
          syncing={syncing}
          syncResult={syncResult}
          syncDisabled={Date.now() < syncCooldownUntil}
          lastSyncAt={lastSyncAt}
        />
      </div>

      <div className={tab === "guardrails" ? "" : "hidden"}>
        <GuardrailsTab activity={initialActivity} />
      </div>

      <div className={tab === "logs" ? "" : "hidden"}>
        <LogsTab
          allKeyNames={allKeyNames}
          initialData={initialLogs}
          onSync={handleSync}
          syncing={syncing}
          syncResult={syncResult}
          syncDisabled={Date.now() < syncCooldownUntil}
        />
      </div>
    </div>
  );
}
