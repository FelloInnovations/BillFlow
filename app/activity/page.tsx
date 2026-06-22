import { Suspense } from "react";
import { ActivityClient } from "@/components/activity/ActivityClient";
import { ActivityData, Guardrail, LogEntry, PaginatedResult } from "@/types";

const EMPTY_ACTIVITY: ActivityData       = { keys: [], months: [], all_projects: [], last_synced_at: null, latest_date: null };
const EMPTY_LOGS: PaginatedResult<LogEntry> = { data: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };

async function getData(): Promise<{
  activity:   ActivityData;
  guardrails: Guardrail[];
  logs:       PaginatedResult<LogEntry>;
}> {
  try {
    const base = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
    const [activityRes, guardrailsRes, logsRes] = await Promise.all([
      fetch(`${base}/api/activity`,             { cache: "no-store" }),
      fetch(`${base}/api/guardrails`,           { cache: "no-store" }),
      fetch(`${base}/api/logs?page=1&pageSize=50`, { cache: "no-store" }),
    ]);
    return {
      activity:   activityRes.ok   ? await activityRes.json()   : EMPTY_ACTIVITY,
      guardrails: guardrailsRes.ok ? await guardrailsRes.json() : [],
      logs:       logsRes.ok       ? await logsRes.json()       : EMPTY_LOGS,
    };
  } catch {
    return { activity: EMPTY_ACTIVITY, guardrails: [], logs: EMPTY_LOGS };
  }
}

export default async function ActivityPage() {
  const { activity, guardrails, logs } = await getData();

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Activity</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          OpenRouter per-key spend, budget guardrails, and API invocation logs
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-slate-400">Loading activity...</p>}>
        <ActivityClient
          initialActivity={activity}
          initialGuardrails={guardrails}
          initialLogs={logs}
        />
      </Suspense>
    </div>
  );
}
